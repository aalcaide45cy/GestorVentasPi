import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { sembrar } from "@/db/semilla";
import { ajustes, codigosRecuperacion, conexionDrive, copiasSeguridad, emailsUsuarios, plantillasPlan, plantillasTarifasVn, telefonosUsuarios, usuarios } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { carpetaCopias, enMantenimiento } from "@/lib/mantenimiento";
import { ajustarCifradoTrasRestaurar, asegurarComprobacion, prepararPortabilidad } from "./clave-recuperacion";
import { archivarElementos, TABLA_ARCHIVO_COPIA } from "./papelera-elementos";

/* ------------------------------------------------------------------ */
/* Configuración y utilidades                                          */
/* ------------------------------------------------------------------ */

const SHA256_VACIA_ALIAS = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
export const LIMITE_SUBIDA_BYTES = 256 * 1024 * 1024 * 1024;
const NOMBRE_VALIDO = /^gv_\d{8}_\d{6}_(manual|auto|previa)\.dump$/;

export type TipoCopia = "manual" | "auto" | "previa";

export function dirCopias(): string {
  const d = carpetaCopias();
  mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
}

const ficheroMantenimiento = () => path.join(/*turbopackIgnore: true*/ dirCopias(), ".mantenimiento");

export { enMantenimiento };

/** Tamaño mínimo razonable de una copia válida: una base de datos con sus tablas siempre pesa bastante más. */
export const TAMANO_MINIMO_COPIA = 4096;
/** SHA-256 de un archivo vacío: si una copia lo tiene, está vacía. */
export const SHA256_VACIO = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

type HerramientaPg = "pg_dump" | "pg_restore";
const VARIABLE_PG: Record<HerramientaPg, string> = { pg_dump: "PG_DUMP_CMD", pg_restore: "PG_RESTORE_CMD" };

function ejecutableEn(carpeta: string, nombre: string): string | null {
  for (const n of process.platform === "win32" ? [`${nombre}.exe`, nombre] : [nombre]) {
    const ruta = path.join(/*turbopackIgnore: true*/ carpeta, n);
    try {
      if (existsSync(/*turbopackIgnore: true*/ ruta) && statSync(/*turbopackIgnore: true*/ ruta).isFile()) return ruta;
    } catch {
      /* sin acceso: se sigue buscando */
    }
  }
  return null;
}

/** Carpetas habituales donde se instala el cliente de PostgreSQL (versión más reciente primero). */
function carpetasHabituales(): string[] {
  const resultado: string[] = [];
  const versiones = (base: string, sub: string) => {
    try {
      return readdirSync(/*turbopackIgnore: true*/ base)
        .sort((a, b) => Number.parseFloat(b) - Number.parseFloat(a))
        .map((v) => path.join(/*turbopackIgnore: true*/ base, v, sub));
    } catch {
      return [];
    }
  };
  if (process.platform === "win32") {
    for (const raiz of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], "C:\\Program Files"]) if (raiz) resultado.push(...versiones(path.join(/*turbopackIgnore: true*/ raiz, "PostgreSQL"), "bin"));
  } else {
    resultado.push(...versiones("/usr/lib/postgresql", "bin"), "/usr/bin", "/usr/local/bin", "/opt/homebrew/bin", "/usr/local/opt/libpq/bin");
  }
  return resultado;
}

let cachePg: Partial<Record<HerramientaPg, string[]>> = {};

/** ¿Está en marcha el contenedor de Docker de la base de datos (desarrollo en un PC sin cliente de PostgreSQL)? */
function contenedorBd(): string | null {
  const nombre = process.env.PG_CONTAINER || "gestorventas-db";
  try {
    const r = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", nombre], { encoding: "utf8", timeout: 4000, windowsHide: true });
    return r.status === 0 && r.stdout.trim() === "true" ? nombre : null;
  } catch {
    return null;
  }
}

/**
 * Orden con la que se ejecuta `pg_dump` o `pg_restore`. Se busca, por este orden: la variable `PG_DUMP_CMD` / `PG_RESTORE_CMD`,
 * el PATH, las carpetas habituales de PostgreSQL (Windows y Linux) y, en desarrollo, el contenedor Docker de la base de datos.
 * Si no hay ninguno, falla con un mensaje claro (nunca se «finge» una copia).
 */
export function comandoPg(herramienta: HerramientaPg): string[] {
  const guardado = cachePg[herramienta];
  if (guardado) return guardado;
  const variable = VARIABLE_PG[herramienta];
  let cmd: string[] | null = null;
  const configurado = process.env[variable]?.trim();
  if (configurado) cmd = configurado.split(/\s+/);
  if (!cmd) {
    for (const carpeta of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
      const r = ejecutableEn(carpeta, herramienta);
      if (r) {
        cmd = [r];
        break;
      }
    }
  }
  if (!cmd) {
    for (const carpeta of carpetasHabituales()) {
      const r = ejecutableEn(carpeta, herramienta);
      if (r) {
        cmd = [r];
        break;
      }
    }
  }
  if (!cmd) {
    const contenedor = contenedorBd();
    if (contenedor) cmd = ["docker", "exec", "-i", contenedor, herramienta];
  }
  if (!cmd) {
    throw new HttpError(
      500,
      `No se encuentra «${herramienta}» en este equipo, así que no se puede hacer ni restaurar la copia de seguridad. Instala el cliente de PostgreSQL (herramientas pg_dump y pg_restore) o indica su ruta en la variable ${variable} del archivo .env. En la Raspberry viene incluido en la aplicación.`,
    );
  }
  cachePg[herramienta] = cmd;
  return cmd;
}

/** ¿Se pueden usar pg_dump y pg_restore? (para avisarlo en pantalla). */
export function estadoHerramientasPg(): { disponible: boolean; detalle: string } {
  try {
    const d = comandoPg("pg_dump");
    comandoPg("pg_restore");
    return { disponible: true, detalle: d[0] === "docker" ? `a través del contenedor Docker «${d[3]}»` : d[0] };
  } catch (e) {
    cachePg = {};
    return { disponible: false, detalle: e instanceof Error ? e.message : "No se encuentra pg_dump" };
  }
}

/** Orden de un comando configurable (compatibilidad): `PG_DUMP_CMD="docker exec -i gestorventas-db pg_dump"` o simplemente `pg_dump`. */
function comando(variable: string, defecto: string): string[] {
  return comandoPg(defecto as HerramientaPg);
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
function ejecutar(cmd: string[], opciones: { stdin?: string; stdout?: string; sha?: boolean; capturar?: boolean }): Promise<ResultadoProceso & { sha256?: string; bytes?: number; salida?: string }> {
  const c = conexion();
  return new Promise((resolve, reject) => {
    const hijo = spawn(cmd[0], cmd.slice(1), { env: { ...process.env, PGPASSWORD: c.clave }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stderr = "";
    let salida = "";
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
    } else if (opciones.capturar) {
      hijo.stdout.on("data", (d: Buffer) => {
        if (salida.length < 4_000_000) salida += d.toString("utf8");
      });
    } else {
      hijo.stdout.resume();
    }
    if (opciones.stdin) tareas.push(pipeline(createReadStream(/*turbopackIgnore: true*/ opciones.stdin), hijo.stdin).catch(() => undefined));
    else hijo.stdin.end();

    hijo.on("close", (codigo) => {
      Promise.allSettled(tareas).then(() => resolve({ codigo: codigo ?? 1, stderr, sha256: opciones.stdout ? hash.digest("hex") : undefined, bytes, salida }));
    });
  });
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/** Nombre único: si ya existe una copia del mismo segundo, avanza hasta encontrar uno libre. */
/**
 * Copias que se están escribiendo ahora mismo (el `pg_dump` o la subida del navegador van llenando el fichero). Mientras tanto, la lista
 * de copias no debe registrarlas: se apuntarían a medias (con su tamaño y huella parciales) y chocarían con el registro definitivo.
 */
const G = globalThis as unknown as { __copiasEnCurso?: Set<string> };
const copiasEnCurso = (): Set<string> => (G.__copiasEnCurso ??= new Set());

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
  /** Qué copias automáticas se suben a Drive: todas, solo una a la semana o solo una al mes. */
  driveFrecuencia: z.enum(["todas", "semanal", "mensual"]).default("todas"),
  /** Nombre de la carpeta de Drive donde se guardan (la crea la aplicación si no existe). */
  driveCarpeta: z.string().trim().min(1, "Falta el nombre de la carpeta").max(100).default("GestorVentasPi-Copias"),
  /** Aviso (punto rojo en Configuración) cuando hay más copias que estas (0 = sin aviso). */
  avisoMaxCopias: z.number().int().min(0).max(1000).default(40),
  /** Aviso cuando las copias ocupan más GB que estos (0 = sin aviso). */
  avisoMaxGb: z.number().int().min(0).max(10000).default(0),
  /** Copias portables: llevan dentro la clave de cifrado y se restauran en cualquier instalación sin pedir nada. */
  portables: z.boolean().default(true),
});
export type AjustesCopias = z.infer<typeof esquemaAjustesCopias>;

export const AJUSTES_POR_DEFECTO: AjustesCopias = { automatica: true, hora: "03:30", retDiarias: 14, retSemanales: 8, retMensuales: 12, driveAutomatica: false, driveFrecuencia: "todas", driveCarpeta: "GestorVentasPi-Copias", avisoMaxCopias: 40, avisoMaxGb: 0, portables: true };

const CLAVES: Record<keyof AjustesCopias, string> = {
  automatica: "backup_auto",
  hora: "backup_hora",
  retDiarias: "backup_ret_diarias",
  retSemanales: "backup_ret_semanales",
  retMensuales: "backup_ret_mensuales",
  driveAutomatica: "backup_drive_auto",
  driveFrecuencia: "backup_drive_frecuencia",
  driveCarpeta: "backup_drive_carpeta",
  avisoMaxCopias: "backup_aviso_max_copias",
  avisoMaxGb: "backup_aviso_max_gb",
  portables: "backup_portables",
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
    driveFrecuencia: (["todas", "semanal", "mensual"] as const).find((f) => f === mapa.get(CLAVES.driveFrecuencia)) ?? d.driveFrecuencia,
    driveCarpeta: mapa.get(CLAVES.driveCarpeta)?.trim() || d.driveCarpeta,
    avisoMaxCopias: num("avisoMaxCopias", d.avisoMaxCopias),
    avisoMaxGb: num("avisoMaxGb", d.avisoMaxGb),
    portables: bool("portables", d.portables),
  };
}

export async function guardarAjustesCopias(ej: Ejecutor, entrada: unknown): Promise<AjustesCopias> {
  const a = esquemaAjustesCopias.parse(entrada);
  const antes = await leerAjustesCopias(ej);
  // Si cambia el nombre de la carpeta de Drive, la siguiente subida busca o crea la nueva
  if (antes.driveCarpeta !== a.driveCarpeta) await ej.update(conexionDrive).set({ carpetaId: null }).where(eq(conexionDrive.id, 1));
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
  notas: string | null;
}

/**
 * Comprueba que un fichero es una copia de PostgreSQL utilizable: tamaño razonable, `pg_restore --list` lo lee y contiene las
 * tablas principales. Devuelve el motivo del fallo, o null si es válida.
 */
export async function motivoCopiaInvalida(ruta: string): Promise<string | null> {
  let tamano = 0;
  try {
    tamano = (await stat(/*turbopackIgnore: true*/ ruta)).size;
  } catch {
    return "El fichero de la copia no existe.";
  }
  if (tamano === 0) return "La copia está vacía (0 bytes).";
  if (tamano < TAMANO_MINIMO_COPIA) return `La copia es demasiado pequeña (${tamano} bytes) para ser una base de datos completa.`;
  let r;
  try {
    r = await ejecutar([...comandoPg("pg_restore"), "--list"], { stdin: ruta, capturar: true });
  } catch (e) {
    return e instanceof Error ? e.message : "No se pudo comprobar la copia.";
  }
  if (r.codigo !== 0) return "El fichero no es una copia de PostgreSQL válida (pg_restore no puede leerla).";
  if (!/TABLE DATA public expedientes\b/.test(r.salida ?? "")) return "La copia no contiene los datos de los expedientes: está incompleta.";
  return null;
}

/** Crea una copia completa (`pg_dump -Fc`), la VALIDA, calcula su SHA-256 y la anota. Nunca deja un fichero vacío o roto. */
export async function crearCopia(ej: Ejecutor, tipo: TipoCopia, creadaPor: number | null = null, nota?: string): Promise<CopiaDto> {
  // Deja en la base el dato de comprobación del cifrado: así cualquier copia permite saber si su clave coincide
  await asegurarComprobacion(ej).catch(() => undefined);
  // Con las copias portables, la copia lleva dentro la clave para abrirse en otra instalación
  await prepararPortabilidad(ej).catch(() => undefined);
  const nombre = nombreNuevo(tipo);
  copiasEnCurso().add(nombre);
  try {
    return await crearCopiaNombrada(ej, tipo, creadaPor, nota, nombre);
  } finally {
    copiasEnCurso().delete(nombre);
  }
}

async function crearCopiaNombrada(ej: Ejecutor, tipo: TipoCopia, creadaPor: number | null, nota: string | undefined, nombre: string): Promise<CopiaDto> {
  const ruta = path.join(/*turbopackIgnore: true*/ dirCopias(), nombre);
  const fallar = async (mensaje: string, estado: number = 500): Promise<never> => {
    await unlink(/*turbopackIgnore: true*/ ruta).catch(() => undefined);
    await anotarError(ej, mensaje).catch(() => undefined);
    throw new HttpError(estado, mensaje);
  };
  let sha256: string | undefined;
  try {
    const c = conexion();
    const cmd = [...comandoPg("pg_dump"), "-Fc", "-Z", "6", "--no-owner", "--no-privileges", ...argsConexion(c), "-d", c.bd];
    const r = await ejecutar(cmd, { stdout: ruta, sha: true });
    if (r.codigo !== 0) return await fallar(`La copia de seguridad ha fallado: ${r.stderr.trim().split("\n").pop() || `código ${r.codigo}`}`);
    sha256 = r.sha256;
  } catch (e) {
    // «No se encuentra pg_dump», fallo al lanzarlo, etc.: se borra cualquier resto y se avisa
    return await fallar(e instanceof Error ? e.message : "La copia de seguridad ha fallado");
  }
  const motivo = await motivoCopiaInvalida(ruta);
  if (motivo) return await fallar(`La copia de seguridad no es válida y se ha descartado: ${motivo}`);
  const tamano = (await stat(/*turbopackIgnore: true*/ ruta)).size;
  const huella = sha256 ?? (await sha256DeFichero(ruta));
  const notas = nota ?? (tipo === "previa" ? "Copia automática previa a una operación delicada." : null);
  // Si por lo que sea la lista ya la había apuntado a medias, se corrige con los datos definitivos en vez de fallar por nombre repetido
  const [fila] = await ej
    .insert(copiasSeguridad)
    .values({ nombre, tipo, tamano, sha256: huella, creadaPor, notas })
    .onConflictDoUpdate({ target: copiasSeguridad.nombre, set: { tamano, sha256: huella, estado: "ok", error: null, creadaPor, notas } })
    .returning();
  await anotarError(ej, null).catch(() => undefined);
  return aDto(fila, true);
}

/** Última copia VÁLIDA (estado correcto y fichero presente en el servidor), con su antigüedad en minutos. */
export async function ultimaCopiaValida(ej: Ejecutor, ahora = new Date()): Promise<{ copia: CopiaDto; minutos: number } | null> {
  const lista = await listarCopias(ej);
  const c = lista.find((x) => x.estado === "ok" && x.archivoPresente && x.tamano >= TAMANO_MINIMO_COPIA);
  return c ? { copia: c, minutos: Math.max(0, Math.round((ahora.getTime() - new Date(c.creadaEn).getTime()) / 60000)) } : null;
}

/**
 * Garantiza una copia de seguridad reciente antes de una operación delicada (duplicado masivo…): si la última válida es de hace
 * menos de `maxMinutos` la reutiliza; si no, crea una nueva de tipo «previa». Falla si no se puede.
 */
export async function asegurarCopiaReciente(ej: Ejecutor, creadaPor: number | null, maxMinutos = 15, motivo?: string): Promise<{ nombre: string; creadaAhora: boolean; milisegundos: number }> {
  const inicio = Date.now();
  const ultima = await ultimaCopiaValida(ej);
  if (ultima && ultima.minutos <= maxMinutos) return { nombre: ultima.copia.nombre, creadaAhora: false, milisegundos: Date.now() - inicio };
  const nueva = await crearCopia(ej, "previa", creadaPor, motivo);
  return { nombre: nueva.nombre, creadaAhora: true, milisegundos: Date.now() - inicio };
}

/** Marca como inválidas las copias ya registradas que están vacías o son demasiado pequeñas (hechas cuando fallaba pg_dump). */
export async function marcarCopiasInvalidas(ej: Ejecutor): Promise<number> {
  const filas = await ej
    .update(copiasSeguridad)
    .set({ estado: "error", error: "Copia vacía o demasiado pequeña: no sirve para restaurar." })
    .where(sql`${copiasSeguridad.estado} = 'ok' and (${copiasSeguridad.sha256} = ${SHA256_VACIO} or ${copiasSeguridad.tamano} < ${TAMANO_MINIMO_COPIA})`)
    .returning({ id: copiasSeguridad.id });
  return filas.length;
}

/** Borra del servidor las copias marcadas como inválidas (fichero y registro). Devuelve cuántas. */
export async function borrarCopiasInvalidas(ej: Ejecutor): Promise<{ borradas: number; driveFileIds: string[] }> {
  await marcarCopiasInvalidas(ej);
  const malas = await ej.select().from(copiasSeguridad).where(eq(copiasSeguridad.estado, "error"));
  const driveFileIds: string[] = [];
  for (const f of malas) {
    const r = await borrarCopia(ej, f.id).catch(() => null);
    if (r?.driveFileId) driveFileIds.push(r.driveFileId);
  }
  return { borradas: malas.length, driveFileIds };
}

function aDto(f: typeof copiasSeguridad.$inferSelect, presente: boolean): CopiaDto {
  return { id: f.id, nombre: f.nombre, tipo: f.tipo, creadaEn: f.creadaEn.toISOString(), tamano: f.tamano, sha256: f.sha256, enDrive: f.driveFileId !== null, archivoPresente: presente, estado: f.estado, error: f.error, notas: f.notas };
}

/** Guarda (o borra, si va vacía) la nota de una copia. */
export async function guardarNotaCopia(ej: Ejecutor, id: number, notas: string | null): Promise<void> {
  const limpia = notas?.trim() ? notas.trim().slice(0, 2000) : null;
  const filas = await ej.update(copiasSeguridad).set({ notas: limpia }).where(eq(copiasSeguridad.id, id)).returning({ id: copiasSeguridad.id });
  if (filas.length === 0) throw new HttpError(404, "Copia no encontrada");
}

/** Anota en la tabla los `.dump` de la carpeta que no estén registrados (subidos a mano o tras una restauración). */
export async function sincronizarCarpeta(ej: Ejecutor): Promise<void> {
  const dir = dirCopias();
  const registradas = await ej.select({ id: copiasSeguridad.id, n: copiasSeguridad.nombre, tamano: copiasSeguridad.tamano, estado: copiasSeguridad.estado }).from(copiasSeguridad);
  const conocidas = new Set(registradas.map((x) => x.n));
  // Copias apuntadas a medias (la lista las vio mientras se escribían): si el fichero ya está completo y es válido, se corrigen
  for (const r of registradas.filter((x) => x.estado === "error" && x.tamano < TAMANO_MINIMO_COPIA && !copiasEnCurso().has(x.n))) {
    try {
      const ruta = path.join(/*turbopackIgnore: true*/ dir, r.n);
      if (!existsSync(/*turbopackIgnore: true*/ ruta)) continue;
      const st = statSync(/*turbopackIgnore: true*/ ruta);
      if (st.size < TAMANO_MINIMO_COPIA || Date.now() - st.mtimeMs < 15_000 || (await motivoCopiaInvalida(ruta)) !== null) continue;
      await ej.update(copiasSeguridad).set({ estado: "ok", error: null, tamano: st.size, sha256: await sha256DeFichero(ruta) }).where(eq(copiasSeguridad.id, r.id));
    } catch {
      /* se deja como está */
    }
  }
  for (const nombre of readdirSync(/*turbopackIgnore: true*/ dir)) {
    const m = NOMBRE_VALIDO.exec(nombre);
    if (!m || conocidas.has(nombre) || copiasEnCurso().has(nombre)) continue;
    const ruta = path.join(/*turbopackIgnore: true*/ dir, nombre);
    try {
      const st = statSync(/*turbopackIgnore: true*/ ruta);
      const sha = await sha256DeFichero(ruta);
      const vacia = st.size < TAMANO_MINIMO_COPIA || sha === SHA256_VACIA_ALIAS;
      await ej
        .insert(copiasSeguridad)
        .values({ nombre, tipo: m[1], tamano: st.size, sha256: sha, creadaEn: st.mtime, ...(vacia ? { estado: "error", error: "Copia vacía o demasiado pequeña: no sirve para restaurar." } : {}) })
        .onConflictDoNothing();
    } catch (e) {
      // Fichero ilegible (p. ej. copia previa creada por el instalador con otro propietario): se omite sin romper la lista
      console.error(`No se pudo registrar la copia ${nombre}:`, e instanceof Error ? e.message : e);
    }
  }
}

export async function listarCopias(ej: Ejecutor): Promise<CopiaDto[]> {
  await sincronizarCarpeta(ej);
  await marcarCopiasInvalidas(ej);
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

/** Guarda un `.dump` recibido por el navegador (flujo crudo, máx. 256 GB) y lo registra. */
export async function guardarSubida(ej: Ejecutor, cuerpo: ReadableStream | null, nombreOriginal: string, creadaPor: number): Promise<CopiaDto> {
  if (!cuerpo) throw new HttpError(400, "No se ha recibido ningún fichero");
  if (!nombreOriginal.toLowerCase().endsWith(".dump")) throw new HttpError(400, "El fichero debe terminar en .dump");
  const nombre = nombreNuevo("manual");
  copiasEnCurso().add(nombre);
  const ruta = path.join(/*turbopackIgnore: true*/ dirCopias(), nombre);
  let bytes = 0;
  try {
    await pipeline(Readable.fromWeb(cuerpo as never), limitarTamano((n) => (bytes = n)), createWriteStream(/*turbopackIgnore: true*/ ruta, { mode: 0o600 }));
  } catch (e) {
    copiasEnCurso().delete(nombre);
    await unlink(/*turbopackIgnore: true*/ ruta).catch(() => undefined);
    throw e instanceof HttpError ? e : new HttpError(400, "No se pudo guardar el fichero recibido");
  }
  try {
    const motivo = await motivoCopiaInvalida(ruta);
    if (motivo) {
      await unlink(/*turbopackIgnore: true*/ ruta).catch(() => undefined);
      throw new HttpError(400, `El fichero no es una copia válida: ${motivo}`);
    }
    const [fila] = await ej.insert(copiasSeguridad).values({ nombre, tipo: "manual", tamano: bytes, sha256: await sha256DeFichero(ruta), creadaPor }).returning();
    return aDto(fila, true);
  } finally {
    copiasEnCurso().delete(nombre);
  }
}

/* ------------------------------------------------------------------ */
/* Subida por trozos (reanudable)                                      */
/* ------------------------------------------------------------------ */

const SUBIDA_VALIDA = /^[0-9a-f]{32}$/;
const rutaParcial = (id: string) => path.join(/*turbopackIgnore: true*/ dirCopias(), `.subida-${id}.parcial`);

function comprobarIdSubida(id: string): void {
  if (!SUBIDA_VALIDA.test(id)) throw new HttpError(400, "Identificador de subida no válido");
}

/** Bytes que lleva recibidos una subida por trozos (0 si no ha empezado). */
export async function bytesDeSubida(id: string): Promise<number> {
  comprobarIdSubida(id);
  try {
    return (await stat(/*turbopackIgnore: true*/ rutaParcial(id))).size;
  } catch {
    return 0;
  }
}

/** Añade un trozo al final de la subida: `desde` debe coincidir con lo recibido hasta ahora (así un reintento no duplica nada). */
export async function anadirTrozoSubida(id: string, desde: number, cuerpo: ReadableStream | null): Promise<number> {
  const actual = await bytesDeSubida(id);
  if (desde !== actual) throw new HttpError(409, "El trozo no encaja con lo recibido");
  // Un trozo vacío (el navegador repite el cierre si se perdió la respuesta) no añade nada
  if (!cuerpo) return actual;
  let total = actual;
  try {
    await pipeline(
      Readable.fromWeb(cuerpo as never),
      async function* (fuente: AsyncIterable<Buffer>) {
        for await (const trozo of fuente) {
          total += trozo.length;
          if (total > LIMITE_SUBIDA_BYTES) throw new HttpError(413, "El fichero supera el límite de 256 GB");
          yield trozo;
        }
      },
      createWriteStream(/*turbopackIgnore: true*/ rutaParcial(id), { flags: "a", mode: 0o600 }),
    );
  } catch (e) {
    if (e instanceof HttpError && e.status === 413) await unlink(/*turbopackIgnore: true*/ rutaParcial(id)).catch(() => undefined);
    throw e instanceof HttpError ? e : new HttpError(400, "No se pudo guardar el trozo recibido");
  }
  return total;
}

/** Cierra una subida por trozos: comprueba que está completa y que es una copia válida, y la registra. */
export async function terminarSubida(ej: Ejecutor, id: string, nombreOriginal: string, total: number, creadaPor: number): Promise<CopiaDto> {
  comprobarIdSubida(id);
  if (!nombreOriginal.toLowerCase().endsWith(".dump")) throw new HttpError(400, "El fichero debe terminar en .dump");
  const parcial = rutaParcial(id);
  const recibidos = await bytesDeSubida(id);
  if (recibidos === 0) throw new HttpError(404, "No hay ninguna subida en curso con ese identificador");
  if (recibidos !== total) throw new HttpError(409, `El fichero llegó incompleto (${recibidos} de ${total} bytes). Vuelve a subirlo.`);
  const nombre = nombreNuevo("manual");
  const ruta = path.join(/*turbopackIgnore: true*/ dirCopias(), nombre);
  await rename(/*turbopackIgnore: true*/ parcial, /*turbopackIgnore: true*/ ruta);
  const motivo = await motivoCopiaInvalida(ruta);
  if (motivo) {
    await unlink(/*turbopackIgnore: true*/ ruta).catch(() => undefined);
    throw new HttpError(400, `El fichero no es una copia válida: ${motivo}`);
  }
  const [fila] = await ej.insert(copiasSeguridad).values({ nombre, tipo: "manual", tamano: recibidos, sha256: await sha256DeFichero(ruta), creadaPor }).returning();
  return aDto(fila, true);
}

/** Borra las subidas por trozos que se quedaron a medias hace más de un día. */
export async function limpiarSubidasAntiguas(): Promise<void> {
  try {
    const limite = Date.now() - 24 * 60 * 60 * 1000;
    for (const f of await readdir(/*turbopackIgnore: true*/ dirCopias())) {
      if (!/^\.subida-[0-9a-f]{32}\.parcial$/.test(f)) continue;
      const ruta = path.join(/*turbopackIgnore: true*/ dirCopias(), f);
      if ((await stat(/*turbopackIgnore: true*/ ruta)).mtimeMs < limite) await unlink(/*turbopackIgnore: true*/ ruta).catch(() => undefined);
    }
  } catch {
    /* sin carpeta o sin permiso: no pasa nada */
  }
}

/** Generador de paso que corta el flujo al superar el límite de tamaño. */
function limitarTamano(fijar: (n: number) => void) {
  let total = 0;
  return async function* (fuente: AsyncIterable<Buffer>) {
    for await (const trozo of fuente) {
      total += trozo.length;
      fijar(total);
      if (total > LIMITE_SUBIDA_BYTES) throw new HttpError(413, "El fichero supera el límite de 256 GB");
      yield trozo;
    }
  };
}

/**
 * Borra una copia. Con `aPapelera` (cuando la elimina una persona) no se destruye: el fichero pasa a la subcarpeta «papelera» de las copias, la ficha se
 * guarda en la Papelera (Herramientas › Papelera) y la copia de Google Drive se queda; allí se restaura o se purga. Sin ella (limpieza automática de
 * copias que sobran por retención o están rotas) se borra del todo, como siempre.
 */
export async function borrarCopia(ej: Ejecutor, id: number, aPapelera = false): Promise<{ driveFileId: string | null }> {
  const { fila, ruta } = await obtenerCopia(ej, id);
  if (aPapelera) {
    const carpeta = path.join(/*turbopackIgnore: true*/ dirCopias(), "papelera");
    mkdirSync(/*turbopackIgnore: true*/ carpeta, { recursive: true, mode: 0o700 });
    await ej.transaction(async (tx) => {
      const tieneFichero = existsSync(/*turbopackIgnore: true*/ ruta);
      await archivarElementos(tx, "copia", sql`t.id = ${id}`, { etiqueta: `Copia ${fila.nombre}`, detalle: `${fila.tipo} · ${(fila.tamano / 1048576).toFixed(0)} MB${tieneFichero ? "" : " · sin fichero"}` }, null, [], tieneFichero ? [{ tabla: TABLA_ARCHIVO_COPIA, fila: { nombre: fila.nombre } }] : []);
      await tx.delete(copiasSeguridad).where(eq(copiasSeguridad.id, id));
      if (tieneFichero) await rename(/*turbopackIgnore: true*/ ruta, path.join(/*turbopackIgnore: true*/ carpeta, fila.nombre));
    });
    return { driveFileId: null };
  }
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
  const autos = await ej.select().from(copiasSeguridad).where(and(eq(copiasSeguridad.tipo, "auto"), eq(copiasSeguridad.estado, "ok")));
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
  /** Cómo se localizó pg_dump (o por qué no se encuentra). */
  pgDetalle: string;
  /** Copias registradas pero vacías o rotas (no sirven para restaurar). */
  invalidas: number;
  /** Última copia válida y su antigüedad en minutos (null si no hay ninguna). */
  ultimaValida: { nombre: string; minutos: number } | null;
}

export async function estadoCopias(ej: Ejecutor, ahora = new Date()): Promise<EstadoCopias> {
  const lista = await listarCopias(ej);
  const a = await leerAjustesCopias(ej);
  const ultimaAuto = lista.find((c) => c.tipo === "auto") ?? null;
  const [err] = await ej.select().from(ajustes).where(eq(ajustes.clave, "backup_ultimo_error"));
  const pg = estadoHerramientasPg();
  const valida = lista.find((c) => c.estado === "ok" && c.archivoPresente && c.tamano >= TAMANO_MINIMO_COPIA) ?? null;
  return {
    ultima: lista[0] ?? null,
    ultimaAutomatica: ultimaAuto?.estado === "ok" ? ultimaAuto : (lista.find((c) => c.tipo === "auto" && c.estado === "ok") ?? null),
    avisoAntigua: a.automatica && !lista.some((c) => c.tipo === "auto" && c.estado === "ok" && ahora.getTime() - new Date(c.creadaEn).getTime() <= 48 * 3600 * 1000),
    ultimoError: err?.valor || null,
    pgDisponible: pg.disponible,
    pgDetalle: pg.detalle,
    invalidas: lista.filter((c) => c.estado !== "ok").length,
    ultimaValida: valida ? { nombre: valida.nombre, minutos: Math.max(0, Math.round((ahora.getTime() - new Date(valida.creadaEn).getTime()) / 60000)) } : null,
  };
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
  /** Solo si la copia viene de otra instalación: clave de recuperación (o APP_SECRET de origen) para volver a cifrar sus datos. */
  claveOrigen: z.string().max(500).optional(),
  /** Copia de otra instalación sin la clave: se restaura igualmente, sin los documentos ni el doble factor (que usan la clave de la otra instalación). */
  sinClave: z.boolean().optional(),
  /**
   * Qué usuarios quedan al restaurar. «conservar» (por defecto): los de ESTA instalación mantienen su contraseña, su doble factor, su rol y su estado
   * (la copia aporta los datos, no las cuentas de acceso). «copia»: se usan las cuentas tal como estaban en la copia.
   */
  usuarios: z.enum(["conservar", "copia"]).optional(),
});

async function pgRestore(ruta: string): Promise<void> {
  const c = conexion();
  const cmd = [...comando("PG_RESTORE_CMD", "pg_restore"), "--clean", "--if-exists", "--no-owner", "--no-privileges", "--single-transaction", ...argsConexion(c), "-d", c.bd];
  const r = await ejecutar(cmd, { stdin: ruta });
  if (r.codigo !== 0) {
    // El detalle completo va al registro del servidor (Configuración › BBDD › Registro); en el mensaje, las últimas líneas
    console.error(`pg_restore ha fallado (código ${r.codigo}):\n${r.stderr.trim().slice(-4000)}`);
    const ultimas = r.stderr.trim().split("\n").filter((l) => l.trim() !== "").slice(-3).join(" | ");
    throw new HttpError(500, `pg_restore ha fallado: ${ultimas || `código ${r.codigo}`}`);
  }
}

/** Pasos posteriores a restaurar: migraciones pendientes y vaciado de sesiones. */
/**
 * Las plantillas (de tarifas y de planes) son del administrador y no dependen de los datos: se guardan antes de restaurar una
 * copia y se reponen después las que la copia no traía (así restaurar una copia antigua no las hace desaparecer).
 */
/**
 * Las cuentas de acceso de ESTA instalación (contraseña, doble factor, rol…) se guardan antes de restaurar: la copia trae las suyas y, sin esto, restaurar
 * en otro equipo (por ejemplo, la copia del PC en el Mac) cambiaría las contraseñas y los códigos del doble factor de todos.
 */
async function guardarUsuarios(ej: Ejecutor) {
  return {
    usuarios: await ej.select().from(usuarios),
    emails: await ej.select().from(emailsUsuarios),
    telefonos: await ej.select().from(telefonosUsuarios),
    codigos: await ej.select().from(codigosRecuperacion),
  };
}

/**
 * Tras restaurar, devuelve a los usuarios de esta instalación sus credenciales y su configuración. Se emparejan por el correo de acceso: si la copia también
 * lo traía se actualiza su fila (así sigue enlazada a sus expedientes), y si no, se vuelve a crear. Los usuarios que solo están en la copia se quedan como
 * venían. Sus contactos y códigos de recuperación se reponen también.
 */
export async function reponerUsuarios(ej: Ejecutor, g: Awaited<ReturnType<typeof guardarUsuarios>>): Promise<{ actualizados: number; recreados: number }> {
  let actualizados = 0;
  let recreados = 0;
  await ej.transaction(async (tx) => {
    const traidos = new Map((await tx.select().from(usuarios)).map((u) => [u.loginEmail.toLowerCase(), u]));
    const idNuevo = new Map<number, number>();
    for (const u of g.usuarios) {
      const valores = {
        passwordHash: u.passwordHash,
        debeCambiarPassword: u.debeCambiarPassword,
        totpSecretoCifrado: u.totpSecretoCifrado,
        totpActivo: u.totpActivo,
        totpUltimoContador: u.totpUltimoContador,
        intentosFallidos: u.intentosFallidos,
        bloqueadoHasta: u.bloqueadoHasta,
        nombre: u.nombre,
        rol: u.rol,
        bloqueado: u.bloqueado,
        tipoVendedor: u.tipoVendedor,
        patronVo: u.patronVo,
      };
      const existente = traidos.get(u.loginEmail.toLowerCase());
      if (existente) {
        await tx.update(usuarios).set(valores).where(eq(usuarios.idUsuario, existente.idUsuario));
        idNuevo.set(u.idUsuario, existente.idUsuario);
        actualizados++;
      } else {
        const [n] = await tx.insert(usuarios).values({ loginEmail: u.loginEmail, creadoEn: u.creadoEn, fechaDeRegistro: u.fechaDeRegistro, ...valores }).returning({ id: usuarios.idUsuario });
        idNuevo.set(u.idUsuario, n.id);
        recreados++;
      }
    }
    const ids = [...idNuevo.values()];
    if (ids.length === 0) return;
    await tx.delete(emailsUsuarios).where(inArray(emailsUsuarios.idUsuario, ids));
    await tx.delete(telefonosUsuarios).where(inArray(telefonosUsuarios.idUsuario, ids));
    await tx.delete(codigosRecuperacion).where(inArray(codigosRecuperacion.idUsuario, ids));
    for (const e of g.emails) if (e.idUsuario !== null && idNuevo.has(e.idUsuario)) await tx.insert(emailsUsuarios).values({ idUsuario: idNuevo.get(e.idUsuario), email: e.email, tipoEmail: e.tipoEmail });
    for (const t of g.telefonos) if (t.idUsuario !== null && idNuevo.has(t.idUsuario)) await tx.insert(telefonosUsuarios).values({ idUsuario: idNuevo.get(t.idUsuario), telefono: t.telefono, tipoTelefono: t.tipoTelefono });
    for (const c of g.codigos) if (idNuevo.has(c.idUsuario)) await tx.insert(codigosRecuperacion).values({ idUsuario: idNuevo.get(c.idUsuario) as number, codigoHash: c.codigoHash, usadoEn: c.usadoEn });
  });
  return { actualizados, recreados };
}

async function guardarPlantillas(ej: Ejecutor) {
  return { tarifas: await ej.select().from(plantillasTarifasVn), planes: await ej.select().from(plantillasPlan) };
}

async function reponerPlantillas(ej: Ejecutor, g: Awaited<ReturnType<typeof guardarPlantillas>>): Promise<void> {
  // Las plantillas son un extra: si reponerlas falla (por ejemplo, una secuencia desfasada en la copia) la restauración de los datos
  // no debe fallar por eso. Se avisa en el registro con la causa real y se sigue.
  try {
    // Se alinean las secuencias con los datos restaurados antes de insertar sin identificador
    for (const tabla of ["plantillas_tarifas_vn", "plantillas_plan"]) {
      await ej.execute(sql.raw(`select setval(pg_get_serial_sequence('${tabla}', 'id'), greatest((select coalesce(max(id), 0) from ${tabla}), 1))`));
    }
    for (const t of g.tarifas) await ej.insert(plantillasTarifasVn).values({ nombre: t.nombre, descripcion: t.descripcion, sistema: t.sistema, datos: t.datos, creadaEn: t.creadaEn, actualizadaEn: t.actualizadaEn }).onConflictDoNothing();
    for (const p of g.planes) await ej.insert(plantillasPlan).values({ ambito: p.ambito, nombre: p.nombre, descripcion: p.descripcion, datos: p.datos, creadaEn: p.creadaEn, actualizadaEn: p.actualizadaEn }).onConflictDoNothing();
    // La plantilla genérica que trae la aplicación vuelve siempre, aunque la copia fuera de una versión anterior
    await sembrar(ej as never);
  } catch (e) {
    console.warn(`No se han podido reponer las plantillas tras restaurar (la restauración sigue adelante): ${mensajeConCausa(e)}`);
  }
}

/** Mensaje de un error con la causa de la base de datos (Drizzle solo dice «Failed query» y esconde el motivo en `cause`). */
export function mensajeConCausa(e: unknown): string {
  if (!(e instanceof Error)) return "Error desconocido";
  const causa = (e as { cause?: unknown }).cause;
  const detalle = causa instanceof Error ? causa.message : "";
  return detalle && !e.message.includes(detalle) ? `${e.message.split("\n")[0]} — causa: ${detalle}` : e.message;
}

async function posRestauracion(ej: Ejecutor, vaciarSesiones = true): Promise<void> {
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.join(/*turbopackIgnore: true*/ process.cwd(), "src", "db", "migrations") });
  } finally {
    await pool.end();
  }
  // Al volver atrás tras un fallo se conservan las sesiones: así el administrador sigue dentro y puede leer el motivo en pantalla
  if (vaciarSesiones) await ej.execute(sql`truncate table sesiones, login_intentos`);
}

/**
 * Restaura una copia: valida credenciales y confirmación, activa el modo mantenimiento, hace una copia
 * previa, restaura, migra y vacía sesiones. Si algo falla vuelve a la copia previa.
 */
export async function restaurarCopiaCompleta(ej: Ejecutor, idAdmin: number, entrada: z.infer<typeof esquemaRestaurar>, alAvanzar?: (fase: string) => void): Promise<{ previa: string; recifrado: boolean }> {
  const { ruta } = await obtenerCopia(ej, entrada.id);
  if (!existsSync(/*turbopackIgnore: true*/ ruta)) throw new HttpError(404, "El fichero de la copia ya no está en el servidor");
  const motivo = await motivoCopiaInvalida(ruta);
  if (motivo) throw new HttpError(400, `La copia no se puede restaurar: ${motivo}`);

  await writeFile(/*turbopackIgnore: true*/ ficheroMantenimiento(), new Date().toISOString());
  let previa: CopiaDto | null = null;
  let notaPrevia: string | null = null;
  let recifrado = false;
  try {
    notaPrevia = `Antes de restaurar la copia ${path.basename(ruta)}. Si algo sale mal, restaura esta para volver al estado anterior.`;
    alAvanzar?.("Guardando una copia previa del estado actual");
    previa = await crearCopia(ej, "previa", idAdmin, notaPrevia);
    const rutaPrevia = path.join(/*turbopackIgnore: true*/ dirCopias(), previa.nombre);
    const plantillas = await guardarPlantillas(ej);
    const cuentas = entrada.usuarios === "copia" ? null : await guardarUsuarios(ej);
    try {
      alAvanzar?.("Restaurando los datos de la copia (es lo que más tarda)");
      await pgRestore(ruta);
      alAvanzar?.("Ajustando los datos restaurados");
      await posRestauracion(ej);
      await reponerPlantillas(ej, plantillas);
      // Si la copia viene de otra instalación, sus datos cifrados se vuelven a cifrar con la clave de esta (o se deshace todo)
      recifrado = (await ajustarCifradoTrasRestaurar(ej, entrada.claveOrigen, entrada.sinClave === true)).recifrado;
      // Después de recifrar: las credenciales guardadas ya están cifradas con la clave de esta instalación
      if (cuentas) {
        alAvanzar?.("Devolviendo a los usuarios de esta instalación su contraseña y su doble factor");
        await reponerUsuarios(ej, cuentas);
      }
    } catch (e) {
      // Vuelta atrás: se restaura el estado anterior
      await pgRestore(rutaPrevia).catch(() => undefined);
      await posRestauracion(ej, false).catch(() => undefined);
      throw e instanceof HttpError ? new HttpError(500, `${e.message}. Se ha recuperado el estado anterior.`) : e;
    }
  } finally {
    await sincronizarCarpeta(ej).catch(() => undefined);
    // La base restaurada no conoce la copia previa (es posterior): se registra desde la carpeta y se le vuelve a poner su nota
    if (previa && notaPrevia) await ej.update(copiasSeguridad).set({ notas: notaPrevia }).where(and(eq(copiasSeguridad.nombre, previa.nombre), sql`${copiasSeguridad.notas} is null`)).catch(() => undefined);
    await rm(/*turbopackIgnore: true*/ ficheroMantenimiento(), { force: true });
  }
  return { previa: previa.nombre, recifrado };
}

/* ------------------------------------------------------------------ */
/* Restauración en segundo plano                                       */
/* ------------------------------------------------------------------ */

export interface EstadoRestauracion {
  estado: "en_curso" | "terminada" | "fallida";
  fase: string;
  mensaje: string | null;
  inicio: string;
  fin: string | null;
}

const ficheroRestauracion = () => path.join(/*turbopackIgnore: true*/ dirCopias(), ".restauracion.json");

async function guardarEstadoRestauracion(e: EstadoRestauracion): Promise<void> {
  await writeFile(/*turbopackIgnore: true*/ ficheroRestauracion(), JSON.stringify(e), { mode: 0o600 }).catch(() => undefined);
}

/**
 * Estado de la última restauración (lo lee `/api/salud` para que la pantalla lo vaya preguntando mientras dura, que en una
 * Raspberry con una copia grande son varios minutos). Si quedó «en curso» pero el servidor ya no está en mantenimiento, se
 * interrumpió (por ejemplo, el servidor se reinició).
 */
export async function leerEstadoRestauracion(): Promise<EstadoRestauracion | null> {
  try {
    const e = JSON.parse(await readFile(/*turbopackIgnore: true*/ ficheroRestauracion(), "utf8")) as EstadoRestauracion;
    if (e.estado === "en_curso" && !enMantenimiento() && Date.now() - new Date(e.inicio).getTime() > 30_000) {
      return { ...e, estado: "fallida", mensaje: "La restauración se interrumpió (el servidor se reinició). Comprueba el estado en Copias de seguridad.", fin: new Date().toISOString() };
    }
    return e;
  } catch {
    return null;
  }
}

/**
 * Empieza una restauración completa y devuelve enseguida: la petición no puede durar lo que dura la restauración (minutos con una
 * copia de un giga en una Raspberry), porque los túneles y los navegadores cortan las peticiones largas («Load failed»). El avance se
 * consulta con `leerEstadoRestauracion`.
 */
export async function iniciarRestauracion(ej: Ejecutor, idAdmin: number, entrada: z.infer<typeof esquemaRestaurar>): Promise<void> {
  const actual = await leerEstadoRestauracion();
  if (enMantenimiento() || actual?.estado === "en_curso") throw new HttpError(409, "Ya hay una restauración en curso.");
  const { ruta } = await obtenerCopia(ej, entrada.id);
  if (!existsSync(/*turbopackIgnore: true*/ ruta)) throw new HttpError(404, "El fichero de la copia ya no está en el servidor");
  const motivo = await motivoCopiaInvalida(ruta);
  if (motivo) throw new HttpError(400, `La copia no se puede restaurar: ${motivo}`);
  const inicio = new Date().toISOString();
  console.info(`Restauración de la copia ${path.basename(ruta)} iniciada`);
  await guardarEstadoRestauracion({ estado: "en_curso", fase: "Empezando", mensaje: null, inicio, fin: null });
  void restaurarCopiaCompleta(ej, idAdmin, entrada, (fase) => void guardarEstadoRestauracion({ estado: "en_curso", fase, mensaje: null, inicio, fin: null }))
    .then(() => console.info(`Restauración de la copia ${path.basename(ruta)} terminada`))
    .then(() => guardarEstadoRestauracion({ estado: "terminada", fase: "Terminada", mensaje: "Copia restaurada. Tendrás que volver a iniciar sesión.", inicio, fin: new Date().toISOString() }))
    .catch((e: unknown) => {
      console.error("Restauración fallida:", mensajeConCausa(e), e instanceof Error ? (e.stack ?? "") : "");
      // El mensaje completo solo lo ve un administrador (`/api/salud` lo filtra para el resto): puede traer nombres de tablas o consultas
      const mensaje = e instanceof Error ? mensajeConCausa(e) : "Error desconocido al restaurar";
      return guardarEstadoRestauracion({ estado: "fallida", fase: "Fallida", mensaje: mensaje.slice(0, 600), inicio, fin: new Date().toISOString() });
    });
}

/** Aviso de que hay más copias (o más GB) de los que el administrador quiere conservar. */
export async function avisoEspacioCopias(ej: Ejecutor): Promise<{ excede: boolean; copias: number; gb: number; motivo: string | null }> {
  const [a, lista] = await Promise.all([leerAjustesCopias(ej), listarCopias(ej)]);
  const copias = lista.length;
  const gb = lista.reduce((t, c) => t + c.tamano, 0) / 1024 ** 3;
  const motivos: string[] = [];
  if (a.avisoMaxCopias > 0 && copias > a.avisoMaxCopias) motivos.push(`hay ${copias} copias de seguridad (el aviso salta a partir de ${a.avisoMaxCopias})`);
  if (a.avisoMaxGb > 0 && gb > a.avisoMaxGb) motivos.push(`las copias ocupan ${gb.toFixed(1).replace(".", ",")} GB (el aviso salta a partir de ${a.avisoMaxGb} GB)`);
  return { excede: motivos.length > 0, copias, gb: Math.round(gb * 100) / 100, motivo: motivos.length ? `Borra copias antiguas: ${motivos.join(" y ")}.` : null };
}
