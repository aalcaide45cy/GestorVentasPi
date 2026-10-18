import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/db";
import { sesiones, usuarios } from "@/db/schema";
import { fijarUsuarioHistorial } from "@/lib/historial/contexto";
import { cumplePermiso, normalizarRol, type Permiso, type Rol } from "./permisos";

const INACTIVIDAD_MS = 12 * 60 * 60 * 1000;
const CADUCIDAD_ABSOLUTA_MS = 30 * 24 * 60 * 60 * 1000;
const RENOVAR_CADA_MS = 5 * 60 * 1000;

const COOKIE_SEGURA = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === "true"
  : process.env.NODE_ENV === "production";

/** Con `__Host-` el navegador exige Secure + Path=/; en desarrollo por http se usa un nombre simple. */
export const NOMBRE_COOKIE = COOKIE_SEGURA ? "__Host-gv_session" : "gv_session";

export interface UsuarioActual {
  idUsuario: number;
  loginEmail: string;
  nombre: string | null;
  rol: Rol;
  fechaDeRegistro: string | null;
  bloqueado: boolean;
  tipoVendedor: string;
  tiendaPredeterminadaId: number | null;
  debeCambiarPassword: boolean;
  totpActivo: boolean;
}

/** Sesión válida; con `mfaVerificado = false` solo puede usar las rutas `/api/auth/*` y `/cuenta/*`. */
export interface SesionActual {
  sesionId: string;
  mfaVerificado: boolean;
  usuario: UsuarioActual;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** IP del cliente: solo se confía en las cabeceras de reenvío si `TRUST_PROXY=true`. */
export async function ipCliente(): Promise<string | null> {
  if (process.env.TRUST_PROXY !== "true") return null;
  const h = await headers();
  const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || h.get("x-real-ip") || null;
}

async function ponerCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(NOMBRE_COOKIE, token, {
    httpOnly: true,
    secure: COOKIE_SEGURA,
    sameSite: "lax",
    path: "/",
    maxAge: CADUCIDAD_ABSOLUTA_MS / 1000,
  });
}

/** Crea una sesión nueva (parcial si `mfaVerificado` es falso) y su cookie. Devuelve el id de sesión. */
export async function crearSesion(idUsuario: number, mfaVerificado: boolean): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const [fila] = await db
    .insert(sesiones)
    .values({
      idUsuario,
      tokenHash: hashToken(token),
      caducaEn: new Date(Date.now() + CADUCIDAD_ABSOLUTA_MS),
      ip: await ipCliente(),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      mfaVerificado,
    })
    .returning({ id: sesiones.id });
  await ponerCookie(token);
  return fila.id;
}

/** Rotación del identificador (nuevo token) al completar el segundo factor. */
export async function rotarSesion(sesionId: string, mfaVerificado: boolean): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await db.update(sesiones).set({ tokenHash: hashToken(token), mfaVerificado, ultimoUso: new Date() }).where(eq(sesiones.id, sesionId));
  await ponerCookie(token);
}

export async function cerrarSesionActual(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(NOMBRE_COOKIE)?.value;
  if (token) {
    await db.update(sesiones).set({ revocadaEn: new Date() }).where(eq(sesiones.tokenHash, hashToken(token)));
  }
  jar.delete(NOMBRE_COOKIE);
}

async function sesionDeToken(token: string): Promise<SesionActual | null> {
  const ahora = new Date();
  const [fila] = await db
    .select({ sesionId: sesiones.id, ultimoUso: sesiones.ultimoUso, mfa: sesiones.mfaVerificado, u: usuarios })
    .from(sesiones)
    .innerJoin(usuarios, eq(usuarios.idUsuario, sesiones.idUsuario))
    .where(and(eq(sesiones.tokenHash, hashToken(token)), isNull(sesiones.revocadaEn), gt(sesiones.caducaEn, ahora)));
  if (!fila) return null;
  if (ahora.getTime() - fila.ultimoUso.getTime() > INACTIVIDAD_MS) return null;
  if (ahora.getTime() - fila.ultimoUso.getTime() > RENOVAR_CADA_MS) {
    await db.update(sesiones).set({ ultimoUso: ahora }).where(eq(sesiones.id, fila.sesionId));
  }
  const u = fila.u;
  return {
    sesionId: fila.sesionId,
    mfaVerificado: fila.mfa,
    usuario: {
      idUsuario: u.idUsuario,
      loginEmail: u.loginEmail,
      nombre: u.nombre,
      rol: normalizarRol(u.rol),
      fechaDeRegistro: u.fechaDeRegistro,
      bloqueado: u.bloqueado ?? false,
      tipoVendedor: u.tipoVendedor,
      tiendaPredeterminadaId: u.tiendaPredeterminadaId,
      debeCambiarPassword: u.debeCambiarPassword,
      totpActivo: u.totpActivo,
    },
  };
}

/** Sesión de la cookie actual, completa o parcial (cacheada por petición). */
export const getSesionActual = cache(async (): Promise<SesionActual | null> => {
  const jar = await cookies();
  const token = jar.get(NOMBRE_COOKIE)?.value;
  if (!token) return null;
  return sesionDeToken(token);
});

/** Usuario con sesión completa (segundo factor superado) o `null`. Para páginas del servidor. */
export async function getCurrentUser(): Promise<UsuarioActual | null> {
  const sesion = await getSesionActual();
  return sesion?.mfaVerificado ? sesion.usuario : null;
}

/**
 * Exige sesión completa y el permiso indicado (para Route Handlers).
 * Una sesión parcial (sin segundo factor) recibe 401; las cuentas suspendidas, 403.
 */
export async function requireSession(permiso: Permiso = "sesion"): Promise<UsuarioActual> {
  const usuario = await getCurrentUser();
  if (!usuario) throw new HttpError(401, "No autenticado");
  if (usuario.bloqueado) throw new HttpError(403, "Cuenta suspendida");
  if (!usuario.totpActivo) throw new HttpError(403, "Activa el doble factor para continuar");
  if (!cumplePermiso(usuario.rol, permiso)) throw new HttpError(403, "No tienes permisos para realizar esta acción");
  fijarUsuarioHistorial(usuario.idUsuario);
  return usuario;
}

/** Para las rutas `/api/auth/*`: acepta también la sesión parcial. */
export async function requireSesionParcial(): Promise<SesionActual> {
  const sesion = await getSesionActual();
  if (!sesion) throw new HttpError(401, "No autenticado");
  if (sesion.usuario.bloqueado) throw new HttpError(403, "Cuenta suspendida");
  return sesion;
}
