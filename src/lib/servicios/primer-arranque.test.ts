import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { verificarPassword } from "@/lib/auth/password";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { anunciarPrimerArranque, codigoPrimerArranque, crearPrimerAdministrador, hayUsuarios } from "./primer-arranque";

let dir = "";
beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "gv-primer-"));
  process.env.BACKUP_DIR = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(async () => {
  await reiniciarBd();
  rmSync(path.join(dir, ".primer-arranque.txt"), { force: true });
});

const PASSWORD = "una-clave-muy-larga-1";
const datos = (codigo: string, extra: Partial<{ nombre: string; email: string; password: string; ip: string | null }> = {}) => ({ nombre: "Ana Admin", email: "Ana@Ejemplo.com", password: PASSWORD, codigo, ip: "5.5.5.5", ...extra });

describe("primer arranque: crear el primer administrador", () => {
  it("el código tiene forma XXXX-XXXX, es estable y queda guardado en la carpeta de copias", () => {
    const c = codigoPrimerArranque();
    expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(codigoPrimerArranque()).toBe(c);
    expect(readFileSync(path.join(dir, ".primer-arranque.txt"), "utf8").trim()).toBe(c);
  });

  it("con el código correcto crea el administrador sin doble factor, borra el código y la pantalla deja de existir", async () => {
    expect(await hayUsuarios(db)).toBe(false);
    const codigo = codigoPrimerArranque();
    const r = await crearPrimerAdministrador(db, datos(codigo.toLowerCase()));
    expect(r.estado).toBe("ok");
    const [u] = await db.select().from(usuarios);
    expect(u).toMatchObject({ loginEmail: "ana@ejemplo.com", nombre: "Ana Admin", rol: "administrador", totpActivo: false, debeCambiarPassword: false });
    expect(await verificarPassword(u.passwordHash, PASSWORD)).toBe(true);
    expect(await hayUsuarios(db)).toBe(true);
    expect(existsSync(path.join(dir, ".primer-arranque.txt"))).toBe(false);
  });

  it("con un código incorrecto no crea nada, y tras 5 intentos bloquea", async () => {
    codigoPrimerArranque();
    for (let i = 0; i < 5; i++) expect(await crearPrimerAdministrador(db, datos("AAAA-BBBB"))).toEqual({ estado: "codigo" });
    expect(await hayUsuarios(db)).toBe(false);
    // Aunque ahora acierte, está bloqueado
    expect((await crearPrimerAdministrador(db, datos(codigoPrimerArranque()))).estado).toBe("bloqueado");
    expect(await hayUsuarios(db)).toBe(false);
  });

  it("si ya existe cualquier usuario, se rechaza (también con el código bueno)", async () => {
    const codigo = codigoPrimerArranque();
    await crearUsuarioPrueba("vendedor");
    await expect(crearPrimerAdministrador(db, datos(codigo))).rejects.toMatchObject({ status: 409 });
    expect((await db.select().from(usuarios)).filter((u) => u.rol === "administrador")).toHaveLength(0);
  });

  it("valida nombre, correo y contraseña antes de nada", async () => {
    const codigo = codigoPrimerArranque();
    await expect(crearPrimerAdministrador(db, datos(codigo, { nombre: " " }))).rejects.toMatchObject({ status: 400 });
    await expect(crearPrimerAdministrador(db, datos(codigo, { email: "sin-arroba" }))).rejects.toMatchObject({ status: 400 });
    await expect(crearPrimerAdministrador(db, datos(codigo, { password: "corta" }))).rejects.toMatchObject({ status: 400 });
    expect(await hayUsuarios(db)).toBe(false);
  });

  it("dos peticiones a la vez crean un único administrador", async () => {
    const codigo = codigoPrimerArranque();
    const resultados = await Promise.allSettled([crearPrimerAdministrador(db, datos(codigo, { email: "uno@ejemplo.com", ip: "1.1.1.1" })), crearPrimerAdministrador(db, datos(codigo, { email: "dos@ejemplo.com", ip: "2.2.2.2" }))]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await db.select().from(usuarios).where(eq(usuarios.rol, "administrador"))).toHaveLength(1);
  });

  it("al arrancar sin usuarios deja el código a la vista en el registro; con usuarios, no", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await anunciarPrimerArranque(db);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0][0])).toContain(codigoPrimerArranque());
    aviso.mockClear();
    await crearUsuarioPrueba("administrador");
    await anunciarPrimerArranque(db);
    expect(aviso).not.toHaveBeenCalled();
    aviso.mockRestore();
  });
});
