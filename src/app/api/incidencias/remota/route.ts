import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError } from "@/lib/auth/sesion";
import { errorJson, leerJson, manejar } from "@/lib/http";
import { esquemaRemota, recibirReporteRemoto } from "@/lib/servicios/incidencias-remotas";

export const dynamic = "force-dynamic";

/** Freno a quien prueba claves: 20 intentos fallidos cada 10 minutos por origen. */
const fallos = new Map<string, { desde: number; n: number }>();
const VENTANA = 10 * 60_000;

function origenDe(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "directo";
}

/**
 * Recibe un reporte de fallo (con su captura) de OTRO equipo: el servidor secundario lo manda aquí, al principal, con la clave de recepción en
 * `Authorization: Bearer …`. No usa sesión (no es una persona la que llama). Si la clave no vale, 401; si este servidor no recibe reportes, 404.
 */
export const POST = manejar(async (req: Request) => {
  const origen = origenDe(req);
  const f = fallos.get(origen);
  if (f && Date.now() - f.desde < VENTANA && f.n >= 20) return errorJson(429, "Demasiados intentos con una clave incorrecta. Espera unos minutos.");
  const clave = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const entrada = await leerJson(req, esquemaRemota);
  try {
    const r = await recibirReporteRemoto(db, clave, entrada);
    return NextResponse.json({ success: true, id: r.id, repetido: r.repetido }, { status: r.repetido ? 200 : 201 });
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) {
      const v = fallos.get(origen);
      fallos.set(origen, !v || Date.now() - v.desde >= VENTANA ? { desde: Date.now(), n: 1 } : { desde: v.desde, n: v.n + 1 });
    }
    throw e;
  }
});
