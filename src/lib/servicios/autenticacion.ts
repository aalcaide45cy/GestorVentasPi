import { createHash } from "node:crypto";
import { and, count, desc, eq, gt, isNull, lt, ne, or } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { codigosRecuperacion, loginIntentos, sesiones, usuarios } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { cifrar, descifrar } from "@/lib/auth/cifrado";
import { hashPassword, validarPassword, verificarPassword } from "@/lib/auth/password";
import {
  generarCodigosRecuperacion,
  huellaCodigoRecuperacion,
  parecidoACodigoRecuperacion,
} from "@/lib/auth/recuperacion";
import { generarSecreto, urlOtpauth, verificarTotp } from "@/lib/auth/totp";

/** Fallos que activan el bloqueo y duración base (5.6). */
const FALLOS_PARA_BLOQUEO = 5;
const BLOQUEO_BASE_MINUTOS = 15;
const BLOQUEO_MAXIMO_MINUTOS = 24 * 60;
const VENTANA_FALLOS_MS = 24 * 60 * 60 * 1000;

function huellaClave(clave: string): string {
  return createHash("sha256").update(clave).digest("hex");
}

/** Claves de limitación: (IP + email) y la IP sola. Sin IP de confianza se usa «local». */
export function clavesLimite(ip: string | null, email: string): string[] {
  const origen = ip ?? "local";
  return [huellaClave(`ip-email|${origen}|${email}`), huellaClave(`ip|${origen}`)];
}

/** Minutos de bloqueo para `fallos` fallos acumulados: 15, 30, 60… hasta 24 h. */
export function minutosDeBloqueo(fallos: number): number {
  if (fallos < FALLOS_PARA_BLOQUEO) return 0;
  const grupos = Math.floor(fallos / FALLOS_PARA_BLOQUEO);
  return Math.min(BLOQUEO_BASE_MINUTOS * 2 ** (grupos - 1), BLOQUEO_MAXIMO_MINUTOS);
}

/** Momento hasta el que está bloqueada alguna de las claves, o `null` si no lo está. */
export async function bloqueadoHasta(ej: Ejecutor, claves: string[], ahora = new Date()): Promise<Date | null> {
  let hasta: Date | null = null;
  for (const clave of claves) {
    const desde = new Date(ahora.getTime() - VENTANA_FALLOS_MS);
    const fallos = await ej
      .select({ en: loginIntentos.en })
      .from(loginIntentos)
      .where(and(eq(loginIntentos.clave, clave), eq(loginIntentos.exito, false), gt(loginIntentos.en, desde)))
      .orderBy(desc(loginIntentos.en));
    const minutos = minutosDeBloqueo(fallos.length);
    if (minutos === 0) continue;
    const fin = new Date(fallos[0].en.getTime() + minutos * 60_000);
    if (fin > ahora && (!hasta || fin > hasta)) hasta = fin;
  }
  return hasta;
}

export async function registrarIntento(ej: Ejecutor, claves: string[], exito: boolean, ahora = new Date()): Promise<void> {
  await ej.insert(loginIntentos).values(claves.map((clave) => ({ clave, exito, en: ahora })));
}

/** Tras un acceso correcto se olvidan los fallos de esa combinación IP + email. */
export async function olvidarFallos(ej: Ejecutor, clave: string): Promise<void> {
  await ej.delete(loginIntentos).where(and(eq(loginIntentos.clave, clave), eq(loginIntentos.exito, false)));
}

/* ------------------------------------------------------------------ */
/* Contraseña                                                          */
/* ------------------------------------------------------------------ */

export type ResultadoLogin =
  | { estado: "ok"; idUsuario: number; requiere: "2fa" | "activar_2fa" }
  | { estado: "credenciales" }
  | { estado: "suspendida" }
  | { estado: "bloqueado"; hasta: Date };

/** Hash de relleno para igualar el tiempo de respuesta cuando el usuario no existe. */
let hashFalso: Promise<string> | null = null;

/**
 * Primer paso del inicio de sesión: valida correo y contraseña con límite de intentos.
 * No crea la sesión (lo hace la ruta); el mismo resultado para usuario inexistente y contraseña errónea.
 */
export async function iniciarLogin(
  ej: Ejecutor,
  entrada: { email: string; password: string; ip: string | null },
  ahora = new Date(),
): Promise<ResultadoLogin> {
  const email = entrada.email.trim().toLowerCase();
  const claves = clavesLimite(entrada.ip, email);

  const hasta = await bloqueadoHasta(ej, claves, ahora);
  if (hasta) return { estado: "bloqueado", hasta };

  const [usuario] = await ej.select().from(usuarios).where(eq(usuarios.loginEmail, email));
  const hashComparar = usuario?.passwordHash ?? (await (hashFalso ??= hashPassword("relleno-no-valido-123")));
  const correcta = await verificarPassword(hashComparar, entrada.password);

  if (!usuario || !correcta) {
    await registrarIntento(ej, claves, false, ahora);
    return { estado: "credenciales" };
  }
  await olvidarFallos(ej, claves[0]);
  if (usuario.bloqueado) return { estado: "suspendida" };
  return { estado: "ok", idUsuario: usuario.idUsuario, requiere: usuario.totpActivo ? "2fa" : "activar_2fa" };
}

/** Cambia la contraseña y revoca el resto de sesiones del usuario (5.5). */
export async function cambiarPassword(
  ej: Ejecutor,
  idUsuario: number,
  actual: string,
  nueva: string,
  sesionActualId: string | null,
): Promise<void> {
  const [u] = await ej.select().from(usuarios).where(eq(usuarios.idUsuario, idUsuario));
  if (!u) throw new HttpError(404, "Usuario no encontrado");
  if (!(await verificarPassword(u.passwordHash, actual))) throw new HttpError(400, "La contraseña actual no es correcta.");
  const error = validarPassword(nueva);
  if (error) throw new HttpError(400, error);
  if (nueva === actual) throw new HttpError(400, "La nueva contraseña debe ser distinta de la actual.");
  const passwordHash = await hashPassword(nueva);
  await ej.transaction(async (tx) => {
    await tx.update(usuarios).set({ passwordHash, debeCambiarPassword: false }).where(eq(usuarios.idUsuario, idUsuario));
    await revocarSesiones(tx, idUsuario, sesionActualId);
  });
}

/** Revoca todas las sesiones del usuario, salvo (opcionalmente) la indicada. */
export async function revocarSesiones(ej: Ejecutor, idUsuario: number, excepto: string | null = null): Promise<number> {
  const filas = await ej
    .update(sesiones)
    .set({ revocadaEn: new Date() })
    .where(and(eq(sesiones.idUsuario, idUsuario), isNull(sesiones.revocadaEn), excepto ? ne(sesiones.id, excepto) : undefined))
    .returning({ id: sesiones.id });
  return filas.length;
}

/* ------------------------------------------------------------------ */
/* Segundo factor                                                      */
/* ------------------------------------------------------------------ */

export interface PreparacionTotp {
  secreto: string;
  url: string;
}

/** Genera y guarda (cifrado) un secreto nuevo; no queda activo hasta confirmar con un código. */
export async function prepararTotp(ej: Ejecutor, idUsuario: number): Promise<PreparacionTotp> {
  const [u] = await ej.select().from(usuarios).where(eq(usuarios.idUsuario, idUsuario));
  if (!u) throw new HttpError(404, "Usuario no encontrado");
  if (u.totpActivo) throw new HttpError(409, "El doble factor ya está activado. Pide a un administrador que lo restablezca.");
  const secreto = generarSecreto();
  await ej.update(usuarios).set({ totpSecretoCifrado: cifrar(secreto, "totp"), totpUltimoContador: null }).where(eq(usuarios.idUsuario, idUsuario));
  return { secreto, url: urlOtpauth(u.loginEmail, secreto) };
}

/** Confirma el secreto pendiente con un código, activa el 2FA y devuelve los códigos de recuperación (una sola vez). */
export async function activarTotp(ej: Ejecutor, idUsuario: number, codigo: string, ahora = Date.now()): Promise<string[]> {
  const [u] = await ej.select().from(usuarios).where(eq(usuarios.idUsuario, idUsuario));
  if (!u) throw new HttpError(404, "Usuario no encontrado");
  if (u.totpActivo) throw new HttpError(409, "El doble factor ya está activado.");
  if (!u.totpSecretoCifrado) throw new HttpError(400, "Primero genera el código QR.");

  const contador = verificarTotp(descifrar(u.totpSecretoCifrado, "totp"), codigo, ahora, null);
  if (contador === null) throw new HttpError(400, "El código no es correcto. Comprueba la hora de tu móvil e inténtalo de nuevo.");

  const codigos = generarCodigosRecuperacion();
  await ej.transaction(async (tx) => {
    await tx.update(usuarios).set({ totpActivo: true, totpUltimoContador: contador }).where(eq(usuarios.idUsuario, idUsuario));
    await tx.delete(codigosRecuperacion).where(eq(codigosRecuperacion.idUsuario, idUsuario));
    await tx.insert(codigosRecuperacion).values(codigos.map((c) => ({ idUsuario, codigoHash: huellaCodigoRecuperacion(c) })));
  });
  return codigos;
}

export type ResultadoSegundoFactor = { estado: "ok"; conRecuperacion: boolean; quedanCodigos?: number } | { estado: "incorrecto" } | { estado: "bloqueado"; hasta: Date };

/**
 * Valida el código de 6 dígitos (o un código de recuperación). Los fallos cuentan para el límite
 * de intentos y un TOTP ya usado no se acepta dos veces.
 */
export async function verificarSegundoFactor(
  ej: Ejecutor,
  idUsuario: number,
  codigo: string,
  ip: string | null,
  ahora = new Date(),
): Promise<ResultadoSegundoFactor> {
  const claves = clavesLimite(ip, `2fa:${idUsuario}`);
  const hasta = await bloqueadoHasta(ej, claves, ahora);
  if (hasta) return { estado: "bloqueado", hasta };

  const [u] = await ej.select().from(usuarios).where(eq(usuarios.idUsuario, idUsuario));
  if (!u || !u.totpActivo || !u.totpSecretoCifrado) return { estado: "incorrecto" };

  const limpio = codigo.trim();
  if (/^\d[\d\s]*$/.test(limpio)) {
    const contador = verificarTotp(descifrar(u.totpSecretoCifrado, "totp"), limpio, ahora.getTime(), u.totpUltimoContador);
    if (contador !== null) {
      // Actualización condicionada: si dos peticiones llevan el mismo código, solo una gana.
      const filas = await ej
        .update(usuarios)
        .set({ totpUltimoContador: contador })
        .where(and(eq(usuarios.idUsuario, idUsuario), or(isNull(usuarios.totpUltimoContador), lt(usuarios.totpUltimoContador, contador))))
        .returning({ id: usuarios.idUsuario });
      if (filas.length > 0) {
        await olvidarFallos(ej, claves[0]);
        return { estado: "ok", conRecuperacion: false };
      }
    }
  } else if (parecidoACodigoRecuperacion(limpio)) {
    const usados = await ej
      .update(codigosRecuperacion)
      .set({ usadoEn: ahora })
      .where(and(eq(codigosRecuperacion.idUsuario, idUsuario), eq(codigosRecuperacion.codigoHash, huellaCodigoRecuperacion(limpio)), isNull(codigosRecuperacion.usadoEn)))
      .returning({ id: codigosRecuperacion.id });
    if (usados.length > 0) {
      await olvidarFallos(ej, claves[0]);
      const [{ n }] = await ej
        .select({ n: count() })
        .from(codigosRecuperacion)
        .where(and(eq(codigosRecuperacion.idUsuario, idUsuario), isNull(codigosRecuperacion.usadoEn)));
      return { estado: "ok", conRecuperacion: true, quedanCodigos: n };
    }
  }

  await registrarIntento(ej, claves, false, ahora);
  return { estado: "incorrecto" };
}

/** Quita el 2FA (script de emergencia o administrador) y cierra todas las sesiones del usuario. */
export async function resetear2fa(ej: Ejecutor, idUsuario: number): Promise<void> {
  await ej.transaction(async (tx) => {
    const filas = await tx
      .update(usuarios)
      .set({ totpActivo: false, totpSecretoCifrado: null, totpUltimoContador: null })
      .where(eq(usuarios.idUsuario, idUsuario))
      .returning({ id: usuarios.idUsuario });
    if (filas.length === 0) throw new HttpError(404, "Usuario no encontrado");
    await tx.delete(codigosRecuperacion).where(eq(codigosRecuperacion.idUsuario, idUsuario));
    await revocarSesiones(tx, idUsuario);
  });
}

/* ------------------------------------------------------------------ */
/* Mantenimiento                                                       */
/* ------------------------------------------------------------------ */

/** Borra sesiones caducadas o revocadas hace más de 7 días e intentos de acceso de más de 30 días. */
export async function limpiarCaducadas(ej: Ejecutor, ahora = new Date()): Promise<{ sesiones: number; intentos: number }> {
  const hace7 = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
  const hace30 = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
  const s = await ej
    .delete(sesiones)
    .where(or(lt(sesiones.caducaEn, ahora), lt(sesiones.revocadaEn, hace7)))
    .returning({ id: sesiones.id });
  const i = await ej.delete(loginIntentos).where(lt(loginIntentos.en, hace30)).returning({ id: loginIntentos.id });
  return { sesiones: s.length, intentos: i.length };
}

/** Sesiones activas de un usuario (para mostrar o cerrar desde la administración). */
export async function contarSesionesActivas(ej: Ejecutor, idUsuario: number, ahora = new Date()): Promise<number> {
  const [{ n }] = await ej
    .select({ n: count() })
    .from(sesiones)
    .where(and(eq(sesiones.idUsuario, idUsuario), isNull(sesiones.revocadaEn), gt(sesiones.caducaEn, ahora)));
  return n;
}

