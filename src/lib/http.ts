import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { HttpError } from "@/lib/auth/sesion";

/** Respuesta de error con el formato del original: `{ message }`. */
export function errorJson(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status });
}

/** Convierte cualquier excepción en una respuesta JSON sin filtrar detalles internos. */
export function responderError(e: unknown): NextResponse {
  if (e instanceof HttpError) return errorJson(e.status, e.message);
  if (e instanceof ZodError) {
    const primero = e.issues[0];
    return errorJson(400, primero ? primero.message : "Datos no válidos");
  }
  console.error("Error no controlado en la API:", e instanceof Error ? e.message : e);
  return errorJson(500, "Error interno del servidor");
}

/** Envuelve un manejador para devolver siempre JSON coherente ante errores. */
export function manejar<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      return responderError(e);
    }
  };
}

const LIMITE_JSON_BYTES = 25 * 1024 * 1024;

/** Lee y valida el cuerpo JSON con Zod. */
export async function leerJson<T>(req: Request, esquema: ZodType<T>): Promise<T> {
  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > LIMITE_JSON_BYTES) throw new HttpError(413, "El cuerpo de la petición es demasiado grande");
  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    throw new HttpError(400, "El cuerpo de la petición no es un JSON válido");
  }
  return esquema.parse(crudo);
}

/** Lee el cuerpo JSON sin validar (para adaptar contratos antiguos antes de validar con Zod). */
export async function leerJsonCrudo(req: Request): Promise<Record<string, unknown>> {
  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    throw new HttpError(400, "El cuerpo de la petición no es un JSON válido");
  }
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) {
    throw new HttpError(400, "El cuerpo de la petición no es válido");
  }
  return crudo as Record<string, unknown>;
}

/** Ids a borrar: `?id=` o `{ ids: [...] }` en el cuerpo (como la app original). */
export async function leerIdsParaBorrar(req: Request): Promise<number[]> {
  const unico = leerIdQuery(req);
  if (unico) return [unico];
  let ids: unknown;
  try {
    ids = ((await req.json()) as { ids?: unknown }).ids;
  } catch {
    ids = undefined;
  }
  const lista = Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (lista.length === 0) throw new HttpError(400, "Faltan los identificadores a eliminar");
  return lista;
}

export function leerIdQuery(req: Request, nombre = "id"): number | null {
  const v = new URL(req.url).searchParams.get(nombre);
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}
