import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { ajustes, copiasSeguridad } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { carpetaCopias, enMantenimiento } from "@/lib/mantenimiento";
import { verificarPassword } from "@/lib/auth/password";
import { usuarios } from "@/db/schema";
import { verificarSegundoFactor } from "./autenticacion";

/* ------------------------------------------------------------------ */
/* Configuración y utilidades                                          */
/* ------------------------------------------------------------------ */

export const LIMITE_SUBIDA_BYTES = 2 * 1024 * 1024 * 1024;
const NOMBRE_VALIDO = /^gv_\d{8}_\d{6}_(manual|auto|previa)\.dump$/;

export type TipoCopia = "manual" | "auto" | "previa";

export function dirCopias(): string {
  const d = carpetaCopias();
  mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
}

const ficheroMantenimiento = () => path.join(/*turbopackIgnore: true*/ dirCopias(), ".mantenimiento");

export { enMantenimiento };

/** Orden de un comando configurable: `PG_DUMP_CMD="docker exec -i gestorventas-db pg_dump"` o simplemente `pg_dump`. */
function comando(variable: string, defecto: string): string[] {
  return (process.env[variable] ?? defecto).trim().split(/\s+/);
}

interface Conexion {
  host: string;
  puerto: string;
  usuario: string;
  clave: string;
  bd: string;
}

function conexion(): Conexion {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const u = new URL(url);
  return { host: u.hostname, puerto: u.port || "5432", usuario: decodeURIComponent(u.username), clave: decodeURIComponent(u.password), bd: u.pathname.slice(1) };
}

const argsConexion = (c: Conexion) => ["-h", c.host, "-p", c.puerto, "-U", c.usuario];

interface ResultadoProceso {
  codigo: number;
  stderr: string;
}

/** Ejecuta un comando de PostgreSQL con stdin/stdout opcionales hacia ficheros. */
function ejecutar(cmd: string[], opciones: { stdin?: string; stdout?: string; sha?: boolean }): Promise<ResultadoProceso & { sha256?: string; bytes?: number }> {
  const c = conexion();
  return new Promise((resolve, reject) => {
    const hijo = spawn(cmd[0], cmd.slice(1), { env: { ...process.env, PGPASSWORD: c.clave }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stderr = "";
    hijo.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    hijo.on("error", (e) => reject(new HttpError(500, `No se pudo ejecutar «${cmd[0]}»: ${e.message}`)));

    const hash = createHash("sha256");
    let bytes = 0;
    const tareas: Promise<unknown>[] = [];
    if (opciones.stdout) {
      const salida = createWriteStream(/*turbopackIgnore: true*/ opciones.stdout, { mode: 0o600 });
      hijo.stdout.on("data", (d: Buffer) => {
        hash.update(d);
        bytes += d.length;
      });
      tareas.push(pipeline(hijo.stdout, salida));
    } else {
      hijo.stdout.resume();
    }
    if (opciones.stdin) tareas.push(pipeline(createReadStream(/*turbopackIgnore: true*/ opciones.stdin), hijo.stdin).catch(() => undefined));
    else hijo.stdin.end();

    hijo.on("close", (codigo) => {
      Promise.allSettled(tareas).then(() => resolve({ codigo: codigo ?? 1, stderr, sha256: opciones.stdout ? hash.digest("hex") : undefined, bytes }));
    });
  });
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/** Nombre único: si ya existe una copia del mismo segundo, avanza hasta encontrar uno libre. */
function nombreNuevo(tipo: TipoCopia, d = new Date()): string {
  for (let i = 0; i < 120; i++) {
    const nombre = nombreEn(tipo, new Date(d.getTime() + i * 1000));
    if (!existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dirCopias(), nombre))) return nombre;
  }
  throw new HttpError(500, "No se pudo generar un nombre de copia libre");
}

function nombreEn(tipo: TipoCopia, d: Date): string {
  const f = `${d.getFullYear()}${dosDigitos(d.getMonth() + 1)}${dosDigitos(d.getDate())}_${dosDigitos(d.getHours())}${dosDigitos(d.getMinutes())}${dosDigitos(d.getSeconds())}`;
  return `gv_${f}_${tipo}.dump`;
}

export async function sha256DeFichero(ruta: string): Promise<string> {
  const h = createHash("sha256");
  await pipeline(createReadStream(/*turbopackIgnore: true*/ ruta), h);
  return h.digest("hex");
}

/* ------------------------------------------------------------------ */
/* Ajustes                                                             */
/* ------------------------------------------------------------------ */

export const esquemaAjustesCopias = z.object({
  automatica: z.boolean(),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida (HH:MM)"),
  retDiarias: z.number().int().min(1).max(365),
  retSemanales: z.number().int().min(0).max(104),
  retMensuales: z.number().int().min(0).max(120),
  driveAutomatica: z.boolean(),
});
export type AjustesCopias = z.infer<typeof esquemaAjustesCopias>;

export const AJUSTES_POR_DEFECTO: AjustesCopias = { automatica: true, hora: "03:30", retDiarias: 14, retSemanales: 8, retMensuales: 12, driveAutomatica: false };

const CLAVES: Record<keyof AjustesCopias, string> = {
  automatica: "backup_auto",
  hora: "backup_hora",
  retDiarias: "backup_ret_diarias",
  retSemanales: "backup_ret_semanales",
  retMensuales: "backup_ret_mensuales",
  driveAutomatica: "backup_drive_auto",
};

export async function leerAjustesCopias(ej: Ejecutor): Promise<AjustesCopias> {
  const filas = await ej.select().from(ajustes);
  const mapa = new Map(filas.map((f) => [f.clave, f.valor]));
  const num = (k: keyof AjustesCopias, def: number) => {
    const v = Number(mapa.get(CLAVES[k]));
    return Number.isInteger(v) && mapa.has(CLAVES[k]) ? v : def;
  };
  const bool = (k: keyof AjustesCopias, def: boolean) => (mapa.has(CLAVES[k]) ? mapa.get(CLAVES[k]) === "true" : def);
  const d = AJUSTES_POR_DEFECTO;
  return {
    automatica: bool("automatica", d.automatica),
    hora: mapa.get(CLAVES.hora) ?? d.hora,
    retDiarias: num("retDiarias", d.retDiarias),
    retSemanales: num("retSemanales", d.retSemanales),
    retMensuales: num("retMensuales", d.retMensuales),
    driveAutomatica: bool("driveAutomatica", d.driveAutomatica),
  };
}

export async function guardarAjustesCopias(ej: Ejecutor, entrada: unknown): Promise<AjustesCopias> {
  const a = esquemaAjustesCopias.parse(entrada);
  for (const k of Object.keys(CLAVES) as (keyof AjustesCopias)[]) {
    const valor = String(a[k]);
    await ej.insert(ajustes).values({ clave: CLAVES[k], valor }).onConflictDoUpdate({ target: ajustes.clave, set: { valor } });
  }
  return a;
}

/* ------------------------------------------------------------------ */
/* Crear, listar, descargar y borrar                                   */
/* ------------------------------------------------------------------ */

export interface CopiaDto {
  id: number;
  nombre: string;
  tipo: string;
  creadaEn: string;
  tamano: number;
  sha256: string;
  enDrive: boolean;
  archivoPresente: boolean;
  estado: string;
  error: string | null;
}

/** Crea una copia completa (`pg_dump -Fc`), calcula su SHA-256 y la anota. */
export async function crearCopia(ej: Ejecutor, tipo: TipoCopia, creadaPor: number | null = null): Promise<CopiaDto> {
  const nombre = nombreNuevo(tipo);
  const ruta = path.join(/*turbopackIgnore: true*/ dirCopias(), nombre);
  const c = conexion();
  const cmd = [...comando("PG_DUMP_CMD", "pg_dump"), "-Fc", "-Z", "6", "--no-owner", "--no-privileges", ...argsConexion(c), "-d", c.bd];
  const r = await ejecutar(cmd, { stdout: ruta, sha: true });
  if (r.codigo !== 0) {
    await unlink(/*turbopackIgnore: true*/ ruta).catch(() => undefined);
    throw new HttpError(500, `La copia de seguridad ha fallado: ${r.stderr.trim().split("\n").pop() || `código ${r.codigo}`}`);
  }
  const tamano = (await stat(/*turbopackIgnore: true*/ ruta)).size;
  if (tamano === 0) {
    await unlink(/*turbopackIgnore: true*/ ruta).catch(() => undefined);
    throw new HttpError(500, "La copia de seguridad ha salido vacía");
  }
  const [fila] = await ej.insert(copiasSeguridad).values({ nombre, tipo, tamano, sha256: r.sha256 ?? (await sha256DeFichero(ruta)), creadaPor }).returning();
  return aDto(fila, true);
}

function aDto(f: typeof copiasSeguridad.$inferSelect, presente: boolean): CopiaDto {
  return { id: f.id, nombre: f.nombre, tipo: f.tipo, creadaEn: f.creadaEn.toISOString(), tamano: f.tamano, sha256: f.sha256, enDrive: f.driveFileId !== null, archivoPresente: presente, estado: f.estado, error: f.error };
}

/** Anota en la tabla los `.dump` de la carpeta que no estén registrados (subidos a mano o tras una restauración). */
export async function sincronizarCarpeta(ej: Ejecutor): Promise<void> {
  const dir = dirCopias();
  const conocidas = new Set((await ej.select({ n: copiasSeguridad.nombre }).from(copiasSeguridad)).map((x) => x.n));
  for (const nombre of readdirSync(/*turbopackIgnore: true*/ dir)) {
    const m = NOMBRE_VALIDO.exec(nombre);
    if (!m || conocidas.has(nombre)) continue;
    const ruta = path.join(/*turbopackIgnore: true*/ dir, nombre);
    const st = statSync(/*turbopackIgnore: true*/ ruta);
    await ej.insert(copiasSeguridad).values({ nombre, tipo: m[1], tamano: st.size, sha256: await sha256DeFichero(ruta), creadaEn: st.mtime }).onConflictDoNothing();
  }
}

export async function listarCopias(ej: Ejecutor): Promise<CopiaDto[]> {
  await sincronizarCarpeta(ej);
  const filas = await ej.select().from(copiasSeguridad).orderBy(desc(copiasSeguridad.creadaEn), desc(copiasSeguridad.id));
  const dir = dirCopias();
  return filas.map((f) => aDto(f, existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, f.nombre))));
}

export async function obtenerCopia(ej: Ejecutor, id: number) {
  const [f] = await ej.select().from(copiasSeguridad).where(eq(copiasSeguridad.id, id));
  if (!f) throw new HttpError(404, "Copia no encontrada");
  if (!NOMBRE_VALIDO.test(f.nombre)) throw new HttpError(400, "Nombre de copia no válido");
  return { fila: f, ruta: path.join(/*turbopackIgnore: true*/ dirCopias(), f.nombre) };
}

/** Flujo de lectura para la descarga desde el navegador. */
export async function abrirCopia(ej: Ejecutor, id: number): Promise<{ nombre: string; tamano: number; flujo: ReadableStream }> {
  const { fila, ruta } = await obtenerCopia(ej, id);
  if (!existsSync(/*turbopackIgnore: true*/ ruta)) throw new HttpError(404, "El fichero de la copia ya no está en el servidor");
  return { nombre: fila.nombre, tamano: (await stat(/*turbopackIgnore: true*/ ruta)).size, flujo: Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ ruta)) as ReadableStream };
}

/** Guarda un `.dump` recibido por el navegador (flujo crudo, máx. 2 GB) y lo registra. */
export async function guardarSubida(ej: Ejecutor, cuerpo: ReadableStream | null, nombreOriginal: string, creadaPor: number): Promise<CopiaDto> {
  if (!cuerpo) throw new HttpError(400, "No se ha recibido ningún fichero");
  if (!nombreOriginal.toLowerCase().endsWith(".dump")) throw new HttpError(400, "El fichero debe terminar en .dump");
  const nombre = nombreNuevo("manual");
  const ruta = path.join(/*turbopackIgnore: true*/ dirCopias(), nombre);
  let bytes = 0;
  try {
    await pipeline(Readable.fromWeb(cuerpo as never), limitarTamano((n) => (bytes = n)), createWriteStream(/*turbopackIgnore: true*/ ruta, { mode: 0o600 }));
  } catch (e) {
    await unlink(/*turbopackIgnore: true*/ ruta).catch(() => undefined);
    throw e instanceof HttpError ? e : new HttpError(400, "No se pudo guardar el fichero recibido");
  }
  const valida = await ejecutar([...comando("PG_RESTORE_CMD", "pg_restore"), "--list"], { stdin: ruta });
  if (valida.codigo !== 0) {
    await unlink(/*turbopackIgnore: true*/ ruta).catch(() => undefined);
    throw new HttpError(400, "El fichero no es una copia de PostgreSQL válida (pg_restore no puede leerlo)");
  }
  const [fila] = await ej.insert(copiasSeguridad).values({ nombre, tipo: "manual", tamano: bytes, sha256: await sha256DeFichero(ruta), creadaPor }).returning();
  return aDto(fila, true);
}

/** Generador de paso que corta el flujo al superar el límite de tamaño. */
function limitarTamano(fijar: (n: number) => void) {
  let total = 0;
  return async function* (fuente: AsyncIterable<Buffer>) {
    for await (const trozo of fuente) {
      total += trozo.length;
      fijar(total);
      if (total > LIMITE_SUBIDA_BYTES) throw new HttpError(413, "El fichero supera el límite de 2 GB");
      yield trozo;
    }
  };
}

export async function borrarCopia(ej: Ejecutor, id: number): Promise<{ driveFileId: string | null }> {
  const { fila, ruta } = await obtenerCopia(ej, id);
  await rm(/*turbopackIgnore: true*/ ruta, { force: true });
  await ej.delete(copiasSeguridad).where(eq(copiasSeguridad.id, id));
  return { driveFileId: fila.driveFileId };
}

/* ------------------------------------------------------------------ */
/* Retención                                                           */
/* ------------------------------------------------------------------ */

function semanaIso(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${dosDigitos(Math.ceil(((t.getTime() - inicio.getTime()) / 86400000 + 1) / 7))}`;
}

/** Identificadores de copias automáticas que sobran según la política «N diarias + M semanales + K mensuales». */
export function copiasSobrantes(copias: { id: number; creadaEn: Date }[], a: Pick<AjustesCopias, "retDiarias" | "retSemanales" | "retMensuales">): number[] {
  const ordenadas = [...copias].sort((x, y) => y.creadaEn.getTime() - x.creadaEn.getTime());
  const conservar = new Set<number>();
  const marcar = (clave: (d: Date) => string, max: number) => {
    const vistas = new Set<string>();
    for (const c of ordenadas) {
      const k = clave(c.creadaEn);
      if (vistas.has(k)) continue;
      if (vistas.size >= max) break;
      vistas.add(k);
      conservar.add(c.id);
    }
  };
  marcar((d) => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`, a.retDiarias);
  marcar(semanaIso, a.retSemanales);
  marcar((d) => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}`, a.retMensuales);
  return ordenadas.filter((c) => !conservar.has(c.id)).map((c) => c.id);
}

/** Borra las copias automáticas que superan la retención. Devuelve los ids de Drive a borrar (si los hay). */
export async function aplicarRetencion(ej: Ejecutor): Promise<{ borradas: number; driveFileIds: string[] }> {
  const a = await leerAjustesCopias(ej);
  const autos = await ej.select().from(copiasSeguridad).where(eq(copiasSeguridad.tipo, "auto"));
  const sobran = new Set(copiasSobrantes(autos.map((x) => ({ id: x.id, creadaEn: x.creadaEn })), a));
  const driveFileIds: string[] = [];
  for (const f of autos.filter((x) => sobran.has(x.id))) {
    const r = await borrarCopia(ej, f.id);
    if (r.driveFileId) driveFileIds.push(r.driveFileId);
  }
  return { borradas: sobran.size, driveFileIds };
}

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

export interface EstadoCopias {
  ultima: CopiaDto | null;
  ultimaAutomatica: CopiaDto | null;
  /** La última copia automática tiene más de 48 h (o no existe y la automática está activada). */
  avisoAntigua: boolean;
  ultimoError: string | null;
  pgDisponible: boolean;
}

export async function estadoCopias(ej: Ejecutor, ahora = new Date()): Promise<EstadoCopias> {
  const lista = await listarCopias(ej);
  const a = await leerAjustesCopias(ej);
  const ultimaAuto = lista.find((c) => c.tipo === "auto") ?? null;
  const [err] = await ej.select().from(ajustes).where(eq(ajustes.clave, "backup_ultimo_error"));
  const antigua = a.automatica && (!ultimaAuto || ahora.getTime() - new Date(ultimaAuto.creadaEn).getTime() > 48 * 3600 * 1000);
  return { ultima: lista[0] ?? null, ultimaAutomatica: ultimaAuto, avisoAntigua: antigua, ultimoError: err?.valor || null, pgDisponible: true };
}

export async function anotarError(ej: Ejecutor, mensaje: string | null): Promise<void> {
  const valor = mensaje ?? "";
  await ej.insert(ajustes).values({ clave: "backup_ultimo_error", valor }).onConflictDoUpdate({ target: ajustes.clave, set: { valor } });
}

/* ------------------------------------------------------------------ */
/* Restauración (13.5)                                                 */
/* ------------------------------------------------------------------ */

export const esquemaRestaurar = z.object({
  id: z.number().int().positive(),
  password: z.string().min(1, "Indica tu contraseña"),
  codigo: z.string().min(1, "Introduce el código de doble factor"),
  confirmacion: z.string(),
});

async function pgRestore(ruta: string): Promise<void> {
  const c = conexion();
  const cmd = [...comando("PG_RESTORE_CMD", "pg_restore"), "--clean", "--if-exists", "--no-owner", "--no-privileges", "--single-transaction", ...argsConexion(c), "-d", c.bd];
  const r = await ejecutar(cmd, { stdin: ruta });
  if (r.codigo !== 0) throw new HttpError(500, `pg_restore ha fallado: ${r.stderr.trim().split("\n").pop() || `código ${r.codigo}`}`);
}

/** Pasos posteriores a restaurar: migraciones pendientes y vaciado de sesiones. */
async function posRestauracion(ej: Ejecutor): Promise<void> {
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.join(/*turbopackIgnore: true*/ process.cwd(), "src", "db", "migrations") });
  } finally {
    await pool.end();
  }
  await ej.execute(sql`truncate table sesiones, login_intentos`);
}

/**
 * Restaura una copia: valida credenciales y confirmación, activa el modo mantenimiento, hace una copia
 * previa, restaura, migra y vacía sesiones. Si algo falla vuelve a la copia previa.
 */
export async function restaurarCopiaCompleta(ej: Ejecutor, idAdmin: number, entrada: z.infer<typeof esquemaRestaurar>, ip: string | null): Promise<{ previa: string }> {
  if (entrada.confirmacion.trim() !== "RESTAURAR") throw new HttpError(400, "Escribe RESTAURAR para confirmar");
  const [u] = await ej.select().from(usuarios).where(eq(usuarios.idUsuario, idAdmin));
  if (!u || !(await verificarPassword(u.passwordHash, entrada.password))) throw new HttpError(403, "La contraseña no es correcta");
  const segundo = await verificarSegundoFactor(ej, idAdmin, entrada.codigo, ip);
  if (segundo.estado === "bloqueado") throw new HttpError(429, "Demasiados intentos. Inténtalo más tarde.");
  if (segundo.estado !== "ok") throw new HttpError(403, "El código de doble factor no es correcto");

  const { ruta } = await obtenerCopia(ej, entrada.id);
  if (!existsSync(/*turbopackIgnore: true*/ ruta)) throw new HttpError(404, "El fichero de la copia ya no está en el servidor");
  const valida = await ejecutar([...comando("PG_RESTORE_CMD", "pg_restore"), "--list"], { stdin: ruta });
  if (valida.codigo !== 0) throw new HttpError(400, "El fichero no es una copia de PostgreSQL válida");

  await writeFile(/*turbopackIgnore: true*/ ficheroMantenimiento(), new Date().toISOString());
  let previa: CopiaDto | null = null;
  try {
    previa = await crearCopia(ej, "previa", idAdmin);
    const rutaPrevia = path.join(/*turbopackIgnore: true*/ dirCopias(), previa.nombre);
    try {
      await pgRestore(ruta);
      await posRestauracion(ej);
    } catch (e) {
      // Vuelta atrás: se restaura el estado anterior
      await pgRestore(rutaPrevia).catch(() => undefined);
      await posRestauracion(ej).catch(() => undefined);
      throw e instanceof HttpError ? new HttpError(500, `${e.message}. Se ha recuperado el estado anterior.`) : e;
    }
  } finally {
    await sincronizarCarpeta(ej).catch(() => undefined);
    await rm(/*turbopackIgnore: true*/ ficheroMantenimiento(), { force: true });
  }
  return { previa: previa.nombre };
}
