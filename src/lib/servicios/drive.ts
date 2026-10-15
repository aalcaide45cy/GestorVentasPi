import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { open, stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { conexionDrive, copiasSeguridad } from "@/db/schema";
import { cifrar, descifrar } from "@/lib/auth/cifrado";
import { HttpError } from "@/lib/auth/sesion";
import { dirCopias, obtenerCopia } from "./copias";

/** Conexión con Google Drive (13.4): OAuth 2.0 de servidor web, alcance mínimo `drive.file`, solo se guarda el refresh token (cifrado). */

const ALCANCE = "https://www.googleapis.com/auth/drive.file";
const URL_AUTORIZACION = "https://accounts.google.com/o/oauth2/v2/auth";
const URL_TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const API_SUBIDA = "https://www.googleapis.com/upload/drive/v3/files";
export const NOMBRE_CARPETA = "GestorVentasPi-Copias";
/** Tamaño de trozo: múltiplo de 256 KiB, como exige la subida reanudable. */
const trozo = (): number => Number(process.env.DRIVE_TROZO) || 8 * 1024 * 1024;

export function driveConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.PUBLIC_URL);
}

export const urlRedireccion = (): string => `${(process.env.PUBLIC_URL ?? "").replace(/\/+$/, "")}/api/admin/drive/callback`;

/* ---- «state» firmado contra CSRF ---- */

function firma(datos: string): string {
  const secreto = process.env.APP_SECRET ?? "";
  return createHmac("sha256", secreto).update(`drive-state:${datos}`).digest("base64url");
}

export function crearState(idUsuario: number, ahora = Date.now()): string {
  const cuerpo = `${idUsuario}.${ahora + 10 * 60 * 1000}.${randomBytes(8).toString("base64url")}`;
  return `${cuerpo}.${firma(cuerpo)}`;
}

export function validarState(state: string, idUsuario: number, ahora = Date.now()): boolean {
  const partes = state.split(".");
  if (partes.length !== 4) return false;
  const cuerpo = partes.slice(0, 3).join(".");
  const esperada = Buffer.from(firma(cuerpo));
  const recibida = Buffer.from(partes[3]);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return false;
  return Number(partes[0]) === idUsuario && Number(partes[1]) > ahora;
}

export function urlAutorizacion(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: urlRedireccion(),
    response_type: "code",
    scope: ALCANCE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${URL_AUTORIZACION}?${p.toString()}`;
}

/* ---- Tokens ---- */

async function pedirToken(cuerpo: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; error?: string }> {
  const r = await fetch(URL_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...cuerpo }) });
  const json = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!r.ok || !json.access_token) {
    const e = new HttpError(r.status === 400 || r.status === 401 ? 401 : 502, json.error_description ?? json.error ?? "Google no aceptó la petición");
    (e as HttpError & { invalidGrant?: boolean }).invalidGrant = json.error === "invalid_grant";
    throw e;
  }
  return { access_token: json.access_token, refresh_token: json.refresh_token };
}

/** Guarda la conexión tras el consentimiento de Google. */
export async function completarConexion(ej: Ejecutor, codigo: string): Promise<{ email: string | null }> {
  const t = await pedirToken({ grant_type: "authorization_code", code: codigo, redirect_uri: urlRedireccion() });
  if (!t.refresh_token) throw new HttpError(400, "Google no ha devuelto permiso permanente. Vuelve a conectar y acepta todos los permisos.");
  let email: string | null = null;
  try {
    const r = await fetch(`${API}/about?fields=user(emailAddress)`, { headers: { Authorization: `Bearer ${t.access_token}` } });
    if (r.ok) email = ((await r.json()) as { user?: { emailAddress?: string } }).user?.emailAddress ?? null;
  } catch {
    /* el correo es solo informativo */
  }
  const valores = { refreshTokenCifrado: cifrar(t.refresh_token, "drive"), email, carpetaId: null, conectadaEn: new Date(), requiereReconexion: false };
  await ej.insert(conexionDrive).values({ id: 1, ...valores }).onConflictDoUpdate({ target: conexionDrive.id, set: valores });
  return { email };
}

export async function desconectar(ej: Ejecutor): Promise<void> {
  await ej.delete(conexionDrive).where(eq(conexionDrive.id, 1));
}

export interface EstadoDrive {
  configurado: boolean;
  conectado: boolean;
  requiereReconexion: boolean;
  email: string | null;
  carpetaId: string | null;
}

export async function estadoDrive(ej: Ejecutor): Promise<EstadoDrive> {
  const [c] = await ej.select().from(conexionDrive).where(eq(conexionDrive.id, 1));
  return { configurado: driveConfigurado(), conectado: Boolean(c), requiereReconexion: c?.requiereReconexion ?? false, email: c?.email ?? null, carpetaId: c?.carpetaId ?? null };
}

async function tokenDeAcceso(ej: Ejecutor): Promise<string> {
  const [c] = await ej.select().from(conexionDrive).where(eq(conexionDrive.id, 1));
  if (!c) throw new HttpError(409, "Google Drive no está conectado");
  if (!driveConfigurado()) throw new HttpError(409, "Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o PUBLIC_URL en la configuración");
  try {
    return (await pedirToken({ grant_type: "refresh_token", refresh_token: descifrar(c.refreshTokenCifrado, "drive") })).access_token;
  } catch (e) {
    if ((e as { invalidGrant?: boolean }).invalidGrant) {
      await ej.update(conexionDrive).set({ requiereReconexion: true }).where(eq(conexionDrive.id, 1));
      throw new HttpError(409, "El permiso de Google Drive ha caducado o se ha revocado. Vuelve a conectar.");
    }
    throw e;
  }
}

async function api(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } });
}

/** Carpeta «GestorVentasPi-Copias» (se crea la primera vez; con `drive.file` solo se ven las carpetas creadas por la app). */
async function asegurarCarpeta(ej: Ejecutor, token: string): Promise<string> {
  const [c] = await ej.select().from(conexionDrive).where(eq(conexionDrive.id, 1));
  if (c?.carpetaId) {
    const r = await api(token, `${API}/files/${c.carpetaId}?fields=id,trashed`);
    if (r.ok && !((await r.json()) as { trashed?: boolean }).trashed) return c.carpetaId;
  }
  const q = encodeURIComponent(`name='${NOMBRE_CARPETA}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const buscar = await api(token, `${API}/files?q=${q}&fields=files(id)&spaces=drive`);
  let id: string | undefined;
  if (buscar.ok) id = ((await buscar.json()) as { files?: { id: string }[] }).files?.[0]?.id;
  if (!id) {
    const crear = await api(token, `${API}/files?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: NOMBRE_CARPETA, mimeType: "application/vnd.google-apps.folder" }) });
    if (!crear.ok) throw new HttpError(502, "No se pudo crear la carpeta en Google Drive");
    id = ((await crear.json()) as { id: string }).id;
  }
  await ej.update(conexionDrive).set({ carpetaId: id }).where(eq(conexionDrive.id, 1));
  return id;
}

async function esperar(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Subida reanudable por trozos con reintentos. Devuelve el id del fichero en Drive. */
async function subirReanudable(token: string, ruta: string, nombre: string, carpetaId: string, espera = 1500): Promise<string> {
  const total = (await stat(/*turbopackIgnore: true*/ ruta)).size;
  const inicio = await api(token, `${API_SUBIDA}?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/octet-stream", "X-Upload-Content-Length": String(total) },
    body: JSON.stringify({ name: nombre, parents: [carpetaId] }),
  });
  const sesion = inicio.headers.get("location");
  if (!inicio.ok || !sesion) throw new HttpError(502, "Google Drive no aceptó iniciar la subida");

  const fichero = await open(/*turbopackIgnore: true*/ ruta, "r");
  try {
    let desde = 0;
    while (desde < total) {
      const hasta = Math.min(desde + trozo(), total) - 1;
      const buf = Buffer.alloc(hasta - desde + 1);
      await fichero.read(buf, 0, buf.length, desde);
      let hecho = false;
      let ultimoError = "";
      for (let intento = 0; intento < 4 && !hecho; intento++) {
        try {
          const r = await fetch(sesion, { method: "PUT", headers: { "Content-Length": String(buf.length), "Content-Range": `bytes ${desde}-${hasta}/${total}` }, body: buf });
          if (r.status === 200 || r.status === 201) return ((await r.json()) as { id: string }).id;
          if (r.status === 308) hecho = true;
          else ultimoError = `HTTP ${r.status}`;
        } catch (e) {
          ultimoError = e instanceof Error ? e.message : "error de red";
        }
        if (!hecho) await esperar(espera * (intento + 1));
      }
      if (!hecho) throw new HttpError(502, `La subida a Google Drive se interrumpió (${ultimoError})`);
      desde = hasta + 1;
    }
    if (total === 0) throw new HttpError(400, "La copia está vacía");
    throw new HttpError(502, "Google Drive no confirmó la subida");
  } finally {
    await fichero.close();
  }
}

/** Sube una copia local a Drive y anota el id. */
export async function subirCopiaADrive(ej: Ejecutor, idCopia: number, espera = 1500): Promise<{ driveFileId: string }> {
  const { fila } = await obtenerCopia(ej, idCopia);
  if (fila.driveFileId) return { driveFileId: fila.driveFileId };
  const token = await tokenDeAcceso(ej);
  const carpeta = await asegurarCarpeta(ej, token);
  const id = await subirReanudable(token, path.join(/*turbopackIgnore: true*/ dirCopias(), fila.nombre), fila.nombre, carpeta, espera);
  await ej.update(copiasSeguridad).set({ driveFileId: id, subidaDriveEn: new Date() }).where(eq(copiasSeguridad.id, idCopia));
  return { driveFileId: id };
}

/** Borra de Drive archivos de la propia carpeta (nunca otros). */
export async function borrarEnDrive(ej: Ejecutor, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const token = await tokenDeAcceso(ej);
  const carpeta = await asegurarCarpeta(ej, token);
  let n = 0;
  for (const id of ids) {
    const info = await api(token, `${API}/files/${id}?fields=parents`);
    if (!info.ok) continue;
    const padres = ((await info.json()) as { parents?: string[] }).parents ?? [];
    if (!padres.includes(carpeta)) continue;
    const r = await api(token, `${API}/files/${id}`, { method: "DELETE" });
    if (r.ok || r.status === 404) n++;
  }
  return n;
}
