import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { count, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { usuarios } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { hashPassword, validarPassword } from "@/lib/auth/password";
import { carpetaCopias } from "@/lib/mantenimiento";
import { bloqueadoHasta, clavesLimite, registrarIntento } from "./autenticacion";

/**
 * Primer arranque: una instalación nueva, sin ningún usuario, deja crear al primer administrador desde una pantalla en vez de con un
 * comando. Protecciones: solo funciona mientras no exista NINGÚN usuario (se comprueba dentro de la transacción, con un bloqueo, así
 * que dos peticiones a la vez no crean dos); hace falta un «código de primer arranque» que solo se ve en el equipo (en el registro del
 * servidor y en un archivo de la carpeta de copias), para que nadie que alcance la dirección antes que el propietario pueda quedarse
 * con la instalación; los intentos fallidos se limitan; y la cuenta nace sin doble factor, que se activa a continuación como siempre.
 */

const ARCHIVO_CODIGO = ".primer-arranque.txt";
/** Clave del bloqueo de la base de datos que serializa la creación del primer administrador. */
const BLOQUEO_PRIMER_ARRANQUE = 7_310_001;

const rutaCodigo = (): string => path.join(/*turbopackIgnore: true*/ carpetaCopias(), ARCHIVO_CODIGO);

/** ¿Hay algún usuario (de cualquier rol, también suspendido)? Si lo hay, la pantalla de primer arranque no existe. */
export async function hayUsuarios(ej: Ejecutor): Promise<boolean> {
  const [{ n }] = await ej.select({ n: count() }).from(usuarios);
  return n > 0;
}

function generarCodigo(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const letras = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
  return `${letras.slice(0, 4)}-${letras.slice(4)}`;
}

/**
 * Código de primer arranque: se crea la primera vez que se pide (y se guarda en un archivo para que sobreviva a los reinicios). Solo se
 * llama si no hay usuarios; en cuanto se crea el primero, el archivo se borra.
 */
export function codigoPrimerArranque(): string {
  const ruta = rutaCodigo();
  try {
    if (existsSync(/*turbopackIgnore: true*/ ruta)) {
      const guardado = readFileSync(/*turbopackIgnore: true*/ ruta, "utf8").trim();
      if (/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(guardado)) return guardado;
    }
  } catch {
    /* se genera uno nuevo */
  }
  const nuevo = generarCodigo();
  try {
    writeFileSync(/*turbopackIgnore: true*/ ruta, `${nuevo}\n`, { mode: 0o600 });
  } catch {
    /* sin carpeta: el código solo vive en memoria de este arranque */
  }
  return nuevo;
}

/** Al arrancar el servidor: si no hay usuarios, deja el código a la vista en el registro (y lo crea si hace falta). */
export async function anunciarPrimerArranque(ej: Ejecutor): Promise<void> {
  try {
    if (await hayUsuarios(ej)) return;
    const c = codigoPrimerArranque();
    console.warn(`PRIMER ARRANQUE: esta instalación no tiene ningún usuario. Abre la aplicación en el navegador y crea el administrador con el código ${c} (también está en ${rutaCodigo()}).`);
  } catch {
    /* la base de datos puede no estar lista todavía: se vuelve a comprobar al abrir la pantalla */
  }
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a.trim().toUpperCase());
  const y = Buffer.from(b.trim().toUpperCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface EntradaPrimerAdministrador {
  nombre: string;
  email: string;
  password: string;
  codigo: string;
  ip: string | null;
}

export type ResultadoPrimerAdministrador = { estado: "ok"; idUsuario: number } | { estado: "codigo" } | { estado: "bloqueado"; hasta: Date };

/** Crea el primer administrador. Lanza 409 si ya existe algún usuario y 400 si los datos no valen. */
export async function crearPrimerAdministrador(ej: Ejecutor, entrada: EntradaPrimerAdministrador, ahora = new Date()): Promise<ResultadoPrimerAdministrador> {
  const nombre = entrada.nombre.trim();
  const email = entrada.email.trim().toLowerCase();
  if (nombre.length < 2) throw new HttpError(400, "Escribe tu nombre.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) throw new HttpError(400, "El correo electrónico no es válido.");
  const error = validarPassword(entrada.password);
  if (error) throw new HttpError(400, error);

  // Sin usuarios no hay nada que proteger con una cuenta, así que el límite es por IP y para toda la pantalla
  const claves = clavesLimite(entrada.ip, "primer-arranque");
  const hasta = await bloqueadoHasta(ej, claves, ahora);
  if (hasta) return { estado: "bloqueado", hasta };
  if (await hayUsuarios(ej)) throw new HttpError(409, "Esta instalación ya tiene usuarios: inicia sesión.");
  if (!iguales(entrada.codigo, codigoPrimerArranque())) {
    await registrarIntento(ej, claves, false, ahora);
    return { estado: "codigo" };
  }

  const passwordHash = await hashPassword(entrada.password);
  const idUsuario = await ej.transaction(async (tx) => {
    // Un solo creador a la vez: el segundo espera, ve que ya hay un usuario y se rechaza
    await tx.execute(sql`select pg_advisory_xact_lock(${BLOQUEO_PRIMER_ARRANQUE})`);
    if (await hayUsuarios(tx)) throw new HttpError(409, "Esta instalación ya tiene usuarios: inicia sesión.");
    const [u] = await tx
      .insert(usuarios)
      .values({ loginEmail: email, passwordHash, debeCambiarPassword: false, nombre, rol: "administrador", fechaDeRegistro: ahora.toISOString().slice(0, 10) })
      .returning({ id: usuarios.idUsuario });
    return u.id;
  });
  // Desaparece para siempre: sin usuarios no vuelve a haber pantalla y el código ya no sirve
  try {
    rmSync(/*turbopackIgnore: true*/ rutaCodigo(), { force: true });
  } catch {
    /* ya no está */
  }
  return { estado: "ok", idUsuario };
}
