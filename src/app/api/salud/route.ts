import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/sesion";
import { leerEstadoRestauracion } from "@/lib/servicios/copias";

export const dynamic = "force-dynamic";

/**
 * Comprobación de vida para Docker. No revela datos. Además lleva el estado de la restauración de una copia (solo la fase y si ha
 * terminado): es la única ruta que responde mientras la aplicación está en mantenimiento, así que la pantalla la pregunta desde aquí.
 */
export async function GET() {
  let restauracion = await leerEstadoRestauracion();
  // El detalle de un fallo (puede traer nombres de tablas) solo se enseña a un administrador con sesión
  if (restauracion?.estado === "fallida" && restauracion.mensaje) {
    const u = await getCurrentUser().catch(() => null);
    if (u?.rol !== "administrador") restauracion = { ...restauracion, mensaje: "La restauración ha fallado." };
  }
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, restauracion, modo: process.env.NODE_ENV === "production" ? "normal" : "desarrollo" });
  } catch {
    return NextResponse.json({ ok: false, restauracion }, { status: 503 });
  }
}
