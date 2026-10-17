import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { copiasSeguridad, marcas, sesiones, usuarios } from "@/db/schema";
import { cifrar } from "@/lib/auth/cifrado";
import { hashPassword } from "@/lib/auth/password";
import { codigoTotp, generarSecreto } from "@/lib/auth/totp";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { copiaAutomaticaSiToca } from "./planificador";
import {
  aplicarRetencion,
  borrarCopia,
  copiasSobrantes,
  crearCopia,
  enMantenimiento,
  estadoCopias,
  guardarAjustesCopias,
  leerAjustesCopias,
  borrarCopiasInvalidas,
  asegurarCopiaReciente,
  listarCopias,
  motivoCopiaInvalida,
  restaurarCopiaCompleta,
  sha256DeFichero,
} from "./copias";

/** Las pruebas que usan pg_dump/pg_restore se ejecutan con el cliente del contenedor de desarrollo si no hay uno local. */
function configurarPg(): boolean {
  try {
    execFileSync("pg_dump", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    /* sin cliente local */
  }
  try {
    const contenedor = process.env.PG_CONTENEDOR ?? "gestorventas-db";
    execFileSync("docker", ["exec", contenedor, "pg_dump", "--version"], { stdio: "ignore" });
    const clave = decodeURIComponent(new URL(process.env.DATABASE_URL as string).password);
    process.env.PG_DUMP_CMD = `docker exec -i -e PGPASSWORD=${clave} ${contenedor} pg_dump`;
    process.env.PG_RESTORE_CMD = `docker exec -i -e PGPASSWORD=${clave} ${contenedor} pg_restore`;
    return true;
  } catch {
    return false;
  }
}

const hayPg = configurarPg();
let dir = "";

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "gv-copias-"));
  process.env.BACKUP_DIR = dir;
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(reiniciarBd);

describe("retención (sin PostgreSQL)", () => {
  const dia = (d: string) => new Date(`${d}T03:30:00`);
  it("conserva N diarias + M semanales + K mensuales y propone borrar el resto", () => {
    const copias = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, creadaEn: new Date(2026, 0, 1 + i, 3, 30) }));
    const sobran = copiasSobrantes(copias, { retDiarias: 14, retSemanales: 4, retMensuales: 2 });
    const quedan = copias.filter((c) => !sobran.includes(c.id));
    expect(quedan.length).toBeGreaterThanOrEqual(14);
    expect(quedan.length).toBeLessThanOrEqual(14 + 4 + 2);
    // las 14 más recientes siempre se conservan
    const recientes = copias.slice(-14).map((c) => c.id);
    for (const id of recientes) expect(sobran).not.toContain(id);
    // la más antigua (1 de enero) es la última de enero... no la del último día de enero: se borra
    expect(sobran).toContain(1);
  });
  it("una sola copia al día cuenta como diaria", () => {
    const c = [
      { id: 1, creadaEn: dia("2026-02-01") },
      { id: 2, creadaEn: new Date("2026-02-01T20:00:00") },
    ];
    expect(copiasSobrantes(c, { retDiarias: 1, retSemanales: 0, retMensuales: 0 })).toEqual([1]);
  });
});

describe("copias vacías o rotas (sin PostgreSQL)", () => {
  it("un fichero vacío o diminuto nunca se da por válido", async () => {
    const vacio = path.join(dir, "gv_20260101_000000_manual.dump");
    writeFileSync(vacio, "");
    expect(await motivoCopiaInvalida(vacio)).toMatch(/vacía/);
    writeFileSync(vacio, "x".repeat(300));
    expect(await motivoCopiaInvalida(vacio)).toMatch(/demasiado pequeña/);
    expect(await motivoCopiaInvalida(path.join(dir, "no-existe.dump"))).toMatch(/no existe/);
  });

  it("una copia vacía de la carpeta se registra como inválida y se puede borrar sin tocar las demás", async () => {
    const vacio = path.join(dir, "gv_20260102_000000_auto.dump");
    writeFileSync(vacio, "");
    const lista = await listarCopias(db);
    const mala = lista.find((c) => c.nombre === "gv_20260102_000000_auto.dump");
    expect(mala).toMatchObject({ estado: "error" });
    const r = await borrarCopiasInvalidas(db);
    expect(r.borradas).toBeGreaterThanOrEqual(1);
    expect(existsSync(vacio)).toBe(false);
    expect((await listarCopias(db)).some((c) => c.nombre === "gv_20260102_000000_auto.dump")).toBe(false);
  });
});

describe("ajustes", () => {
  it("valores por defecto y guardado validado", async () => {
    expect(await leerAjustesCopias(db)).toEqual({ automatica: true, hora: "03:30", retDiarias: 14, retSemanales: 8, retMensuales: 12, driveAutomatica: false, driveFrecuencia: "todas", driveCarpeta: "GestorVentasPi-Copias", avisoMaxCopias: 40, avisoMaxGb: 0 });
    await guardarAjustesCopias(db, { automatica: false, hora: "04:15", retDiarias: 7, retSemanales: 2, retMensuales: 3, driveAutomatica: true });
    expect((await leerAjustesCopias(db)).hora).toBe("04:15");
    await expect(guardarAjustesCopias(db, { automatica: true, hora: "25:99", retDiarias: 7, retSemanales: 2, retMensuales: 3, driveAutomatica: false })).rejects.toThrow();
  });
});

describe.skipIf(!hayPg)("copias completas con PostgreSQL", () => {
  it("crea una copia .dump con su SHA-256, permisos y registro", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const c = await crearCopia(db, "manual", admin.idUsuario);
    expect(c.nombre).toMatch(/^gv_\d{8}_\d{6}_manual\.dump$/);
    expect(c.tamano).toBeGreaterThan(1000);
    const ruta = path.join(dir, c.nombre);
    expect(await sha256DeFichero(ruta)).toBe(c.sha256);
    expect(readFileSync(ruta).subarray(0, 5).toString()).toBe("PGDMP");
    const lista = await listarCopias(db);
    expect(lista[0]).toMatchObject({ nombre: c.nombre, archivoPresente: true, enDrive: false });
    expect((await estadoCopias(db)).ultima?.nombre).toBe(c.nombre);
    await borrarCopia(db, c.id);
    expect(existsSync(ruta)).toBe(false);
  });

  it("reutiliza una copia reciente y válida antes de una operación grande, o crea una nueva si no hay", async () => {
    const primera = await asegurarCopiaReciente(db, null);
    expect(primera.creadaAhora).toBe(true);
    const segunda = await asegurarCopiaReciente(db, null);
    expect(segunda).toMatchObject({ creadaAhora: false, nombre: primera.nombre });
  });

  it("aplica la retención solo a las automáticas", async () => {
    await guardarAjustesCopias(db, { automatica: true, hora: "03:30", retDiarias: 1, retSemanales: 0, retMensuales: 0, driveAutomatica: false });
    const manual = await crearCopia(db, "manual");
    const a1 = await crearCopia(db, "auto");
    await db.update(copiasSeguridad).set({ creadaEn: new Date(Date.now() - 3 * 86400000) }).where(eq(copiasSeguridad.id, a1.id));
    await crearCopia(db, "auto");
    const r = await aplicarRetencion(db);
    expect(r.borradas).toBe(1);
    const nombres = (await listarCopias(db)).map((c) => c.nombre);
    expect(nombres).toContain(manual.nombre);
    expect(nombres).not.toContain(a1.nombre);
  });

  it("restaura una copia: recupera los datos, crea copia previa, vacía sesiones y sale de mantenimiento", async () => {
    const secreto = generarSecreto();
    const admin = await crearUsuarioPrueba("administrador", "Admin copias");
    await db.update(usuarios).set({ passwordHash: await hashPassword("ClaveDePrueba-2026!"), totpSecretoCifrado: cifrar(secreto, "totp"), totpActivo: true }).where(eq(usuarios.idUsuario, admin.idUsuario));
    await db.insert(marcas).values({ nombre: "Marca original" });
    const copia = await crearCopia(db, "manual", admin.idUsuario);

    await db.insert(marcas).values({ nombre: "Marca posterior" });
    await db.insert(sesiones).values({ idUsuario: admin.idUsuario, tokenHash: "x".repeat(10), caducaEn: new Date(Date.now() + 1e6), mfaVerificado: true });

    // Contraseña, código o confirmación incorrectos no tocan nada
    const mal = { id: copia.id, password: "otra", codigo: codigoTotp(secreto), confirmacion: "RESTAURAR" };
    await expect(restaurarCopiaCompleta(db, admin.idUsuario, mal, null)).rejects.toMatchObject({ status: 403 });
    await expect(restaurarCopiaCompleta(db, admin.idUsuario, { ...mal, password: "ClaveDePrueba-2026!", confirmacion: "no" }, null)).rejects.toMatchObject({ status: 400 });
    expect((await db.select().from(marcas)).length).toBe(2);

    const r = await restaurarCopiaCompleta(db, admin.idUsuario, { id: copia.id, password: "ClaveDePrueba-2026!", codigo: codigoTotp(secreto), confirmacion: "RESTAURAR" }, null);
    expect(r.previa).toMatch(/_previa\.dump$/);
    expect(existsSync(path.join(dir, r.previa))).toBe(true);
    expect((await db.select().from(marcas)).map((m) => m.nombre)).toEqual(["Marca original"]);
    expect(await db.select().from(sesiones)).toHaveLength(0);
    expect(enMantenimiento()).toBe(false);
    // La copia previa queda listada tras la restauración
    expect((await listarCopias(db)).some((c) => c.tipo === "previa")).toBe(true);
  });

  it("rechaza restaurar un fichero que no es un dump", async () => {
    const secreto = generarSecreto();
    const admin = await crearUsuarioPrueba("administrador");
    await db.update(usuarios).set({ passwordHash: await hashPassword("ClaveDePrueba-2026!"), totpSecretoCifrado: cifrar(secreto, "totp"), totpActivo: true }).where(eq(usuarios.idUsuario, admin.idUsuario));
    const falso = path.join(dir, "gv_20260101_000000_manual.dump");
    writeFileSync(falso, "esto no es un volcado");
    const lista = await listarCopias(db);
    const id = lista.find((c) => c.nombre.endsWith("20260101_000000_manual.dump"))!.id;
    await expect(restaurarCopiaCompleta(db, admin.idUsuario, { id, password: "ClaveDePrueba-2026!", codigo: codigoTotp(secreto), confirmacion: "RESTAURAR" }, null)).rejects.toMatchObject({ status: 400 });
    expect(enMantenimiento()).toBe(false);
  });

  it("la copia automática se hace una vez al día, pasada la hora, y no si está desactivada", async () => {
    const hora = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const base = { automatica: true, retDiarias: 14, retSemanales: 8, retMensuales: 12, driveAutomatica: false };
    const manana = new Date(new Date().setHours(23, 59, 0, 0));
    await guardarAjustesCopias(db, { ...base, hora: hora(manana) });
    expect(await copiaAutomaticaSiToca(db, new Date(manana.getTime() - 3600_000))).toBeNull(); // aún no es la hora
    await guardarAjustesCopias(db, { ...base, automatica: false, hora: "00:00" });
    expect(await copiaAutomaticaSiToca(db)).toBeNull();
    await guardarAjustesCopias(db, { ...base, hora: "00:00" });
    const nombre = await copiaAutomaticaSiToca(db);
    expect(nombre).toMatch(/_auto\.dump$/);
    expect(await copiaAutomaticaSiToca(db)).toBeNull(); // ya hay una de hoy
    expect((await estadoCopias(db)).avisoAntigua).toBe(false);
  });
});
