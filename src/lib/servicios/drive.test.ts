import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fijarCifradoActivo } from "@/lib/auth/cifrado";
import { db } from "@/db";
import { ajustes, conexionDrive, copiasSeguridad } from "@/db/schema";
import { reiniciarBd } from "../../../tests/ayudas";
import { borrarCredenciales, borrarEnDrive, completarConexion, crearState, desconectar, estadoDrive, guardarCredenciales, leerCredenciales, origenDe, subirCopiaADrive, urlAutorizacion, urlRedireccion, validarState } from "./drive";

let dir = "";
beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "gv-drive-"));
  process.env.BACKUP_DIR = dir;
  process.env.GOOGLE_CLIENT_ID = "id-cliente";
  process.env.GOOGLE_CLIENT_SECRET = "secreto-cliente";
  process.env.PUBLIC_URL = "https://gestor.ejemplo.ts.net/";
  process.env.DRIVE_TROZO = String(256 * 1024);
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DRIVE_TROZO;
});
beforeEach(async () => {
  fijarCifradoActivo(true);
  await reiniciarBd();
});
afterAll(() => fijarCifradoActivo(false));
afterEach(() => vi.unstubAllGlobals());

interface Llamada {
  url: string;
  metodo: string;
  cabeceras: Record<string, string>;
  cuerpo?: string;
}

/** Simula las respuestas de Google; devuelve el registro de llamadas. */
function simularGoogle(opciones: { refresh?: boolean; invalidGrant?: boolean; fallosPrimerTrozo?: number } = {}) {
  const llamadas: Llamada[] = [];
  let fallos = opciones.fallosPrimerTrozo ?? 0;
  const json = (o: unknown, status = 200, cab: Record<string, string> = {}) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...cab } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const cabeceras = Object.fromEntries(Object.entries((init.headers as Record<string, string>) ?? {}));
      llamadas.push({ url, metodo: init.method ?? "GET", cabeceras, cuerpo: typeof init.body === "string" ? init.body : init.body instanceof URLSearchParams ? init.body.toString() : undefined });
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        if (opciones.invalidGrant) return json({ error: "invalid_grant", error_description: "Token revocado" }, 400);
        const authCode = String(init.body).includes("authorization_code");
        return json(authCode ? { access_token: "acceso", refresh_token: opciones.refresh === false ? undefined : "refresco-secreto" } : { access_token: "acceso" });
      }
      if (url.includes("/about")) return json({ user: { emailAddress: "alfonso@gmail.com" } });
      if (url.includes("/files?q=")) return json({ files: [] });
      if (url.includes("/files?fields=id") && init.method === "POST") return json({ id: "carpeta-1" });
      if (url.includes("uploadType=resumable")) return new Response("", { status: 200, headers: { location: "https://upload.example/sesion-1" } });
      if (url === "https://upload.example/sesion-1") {
        if (fallos > 0) {
          fallos--;
          return new Response("", { status: 503 });
        }
        const rango = cabeceras["Content-Range"];
        const [, fin, total] = /bytes \d+-(\d+)\/(\d+)/.exec(rango) ?? [];
        return Number(fin) + 1 >= Number(total) ? json({ id: "archivo-1" }, 200) : new Response("", { status: 308 });
      }
      if (/\/files\/archivo-1\?fields=parents/.test(url)) return json({ parents: ["carpeta-1"] });
      if (/\/files\/otro\?fields=parents/.test(url)) return json({ parents: ["otra-carpeta"] });
      if (/\/files\/[^?]+$/.test(url) && init.method === "DELETE") return new Response(null, { status: 204 });
      if (/\/files\/carpeta-1\?fields=id,trashed/.test(url)) return json({ id: "carpeta-1", trashed: false });
      return json({ error: "no simulado: " + url }, 500);
    }),
  );
  return llamadas;
}

async function copiaLocal(contenido: Buffer) {
  const nombre = "gv_20261015_030000_auto.dump";
  writeFileSync(path.join(dir, nombre), contenido);
  const [f] = await db.insert(copiasSeguridad).values({ nombre, tipo: "auto", tamano: contenido.length, sha256: "a".repeat(64) }).returning();
  return f;
}

describe("OAuth", () => {
  it("la URL pide alcance mínimo, acceso offline y consentimiento, y el state firmado caduca y es del usuario", () => {
    const state = crearState(7);
    const u = new URL(urlAutorizacion(state, { id: "id-cliente", secreto: "secreto-cliente", origen: "env" }, "https://gestor.ejemplo.ts.net/"));
    expect(u.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent select_account");
    expect(u.searchParams.get("redirect_uri")).toBe("https://gestor.ejemplo.ts.net/api/admin/drive/callback");
    expect(validarState(state, 7)).toBe(true);
    expect(validarState(state, 8)).toBe(false);
    expect(validarState(state + "x", 7)).toBe(false);
    expect(validarState(state, 7, Date.now() + 11 * 60 * 1000)).toBe(false);
  });

  it("guarda solo el refresh token, cifrado, y desconecta", async () => {
    simularGoogle();
    const r = await completarConexion(db, "codigo-de-google", "https://gestor.ejemplo.ts.net");
    expect(r.email).toBe("alfonso@gmail.com");
    const [c] = await db.select().from(conexionDrive);
    expect(c.refreshTokenCifrado).not.toContain("refresco-secreto");
    expect(c.refreshTokenCifrado.startsWith("v1.")).toBe(true);
    expect(await estadoDrive(db)).toMatchObject({ configurado: true, conectado: true, email: "alfonso@gmail.com", requiereReconexion: false });
    await desconectar(db);
    expect((await estadoDrive(db)).conectado).toBe(false);
  });

  it("sin refresh token pide volver a conectar", async () => {
    simularGoogle({ refresh: false });
    await expect(completarConexion(db, "x", "https://gestor.ejemplo.ts.net")).rejects.toMatchObject({ status: 400 });
  });
});

describe("credenciales de Google guardadas en la aplicación", () => {
  it("se guardan con el secreto cifrado, mandan sobre el .env y se pueden borrar", async () => {
    await expect(guardarCredenciales(db, "no-vale", "secreto-largo-123")).rejects.toMatchObject({ status: 400 });
    await guardarCredenciales(db, "123-abc.apps.googleusercontent.com", "GOCSPX-secreto-largo");
    expect(await leerCredenciales(db)).toMatchObject({ id: "123-abc.apps.googleusercontent.com", secreto: "GOCSPX-secreto-largo", origen: "aplicacion" });
    const [f] = await db.select().from(ajustes).where(eq(ajustes.clave, "drive_client_secreto"));
    expect(f.valor).not.toContain("GOCSPX");
    expect(await estadoDrive(db)).toMatchObject({ configurado: true, clientId: "123-abc.apps.googleusercontent.com", credencialesEn: "aplicacion" });
    await borrarCredenciales(db);
    expect(await leerCredenciales(db)).toMatchObject({ origen: "env" }); // vuelve a las del .env si las hay
  });

  it("la dirección de vuelta sale de la cabecera de la petición, también detrás de un túnel", () => {
    const peticion = (h: Record<string, string>) => new Request("http://localhost:3000/api/x", { headers: h });
    expect(origenDe(peticion({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(origenDe(peticion({ host: "interno", "x-forwarded-proto": "https", "x-forwarded-host": "gestor.ejemplo.ts.net" }))).toBe("https://gestor.ejemplo.ts.net");
    expect(urlRedireccion("https://gestor.ejemplo.ts.net/")).toBe("https://gestor.ejemplo.ts.net/api/admin/drive/callback");
  });
});

describe("subida y borrado", () => {
  it("sube por trozos a la carpeta propia, reintenta fallos y anota el id", async () => {
    const llamadas = simularGoogle({ fallosPrimerTrozo: 1 });
    await completarConexion(db, "c", "https://gestor.ejemplo.ts.net");
    const f = await copiaLocal(Buffer.alloc(600 * 1024, 7));
    const r = await subirCopiaADrive(db, f.id, 1);
    expect(r.driveFileId).toBe("archivo-1");
    const puts = llamadas.filter((l) => l.url === "https://upload.example/sesion-1");
    expect(puts.length).toBe(1 + 3); // un reintento + 3 trozos
    expect(puts.at(-1)?.cabeceras["Content-Range"]).toBe(`bytes ${512 * 1024}-${600 * 1024 - 1}/${600 * 1024}`);
    const inicio = llamadas.find((l) => l.url.includes("uploadType=resumable"));
    expect(JSON.parse(inicio?.cuerpo ?? "{}")).toEqual({ name: "gv_20261015_030000_auto.dump", parents: ["carpeta-1"] });
    const [fila] = await db.select().from(copiasSeguridad).where(eq(copiasSeguridad.id, f.id));
    expect(fila.driveFileId).toBe("archivo-1");
    expect((await db.select().from(conexionDrive))[0].carpetaId).toBe("carpeta-1");
    // Una segunda subida no repite
    expect((await subirCopiaADrive(db, f.id, 1)).driveFileId).toBe("archivo-1");
  });

  it("con el permiso revocado marca «reconectar» y no rompe", async () => {
    simularGoogle();
    await completarConexion(db, "c", "https://gestor.ejemplo.ts.net");
    simularGoogle({ invalidGrant: true });
    const f = await copiaLocal(Buffer.alloc(1000, 1));
    await expect(subirCopiaADrive(db, f.id, 1)).rejects.toMatchObject({ status: 409 });
    expect((await estadoDrive(db)).requiereReconexion).toBe(true);
  });

  it("solo borra archivos de la carpeta propia", async () => {
    const llamadas = simularGoogle();
    await completarConexion(db, "c", "https://gestor.ejemplo.ts.net");
    const n = await borrarEnDrive(db, ["archivo-1", "otro"]);
    expect(n).toBe(1);
    expect(llamadas.filter((l) => l.metodo === "DELETE")).toHaveLength(1);
  });
});
