import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { leerEstadoRestauracion } from "@/lib/servicios/copias";

export const dynamic = "force-dynamic";

/**
 * Comprobación de vida para Docker. No revela datos. Además lleva el estado de la restauración de una copia (solo la fase y si ha
 * terminado): es la única ruta que responde mientras la aplicación está en mantenimiento, así que la pantalla la pregunta desde aquí.
 */
export async function GET() {
  const restauracion = await leerEstadoRestauracion();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, restauracion });
  } catch {
    return NextResponse.json({ ok: false, restauracion }, { status: 503 });
  }
}
