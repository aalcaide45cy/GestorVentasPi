import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ajustes } from "@/db/schema";
import { requireSession } from "@/lib/auth/sesion";
import { fijarNombreEquipo } from "@/lib/equipo";
import { leerJson, manejar } from "@/lib/http";
import { recursosRapidos } from "@/lib/rendimiento";

const CLAVE_NOMBRE = "nombre_equipo";
let nombreLeidoEn = 0;

/** El nombre puesto en la aplicación se lee de la base de datos como mucho cada 30 s. */
async function cargarNombre(): Promise<void> {
  if (Date.now() - nombreLeidoEn < 30_000) return;
  nombreLeidoEn = Date.now();
  try {
    const [f] = await db.select().from(ajustes).where(eq(ajustes.clave, CLAVE_NOMBRE));
    fijarNombreEquipo(f?.valor ?? "");
  } catch {
    /* sin base de datos un momento: se sigue con el nombre que hubiera */
  }
}

export const dynamic = "force-dynamic";

/** Uso del equipo en este momento (CPU, memoria, temperatura, disco) para el indicador de la barra superior. Solo administrador. */
export const GET = manejar(async () => {
  await requireSession("administrador");
  await cargarNombre();
  return NextResponse.json({ success: true, data: recursosRapidos() }, { headers: { "Cache-Control": "no-store" } });
});

/** Pone nombre a este equipo (por ejemplo «Raspberry de la tienda»); vacío para volver al nombre detectado. */
export const PUT = manejar(async (req: Request) => {
  await requireSession("administrador");
  const { nombre } = await leerJson(req, z.object({ nombre: z.string().trim().max(60) }));
  if (nombre === "") await db.delete(ajustes).where(eq(ajustes.clave, CLAVE_NOMBRE));
  else await db.insert(ajustes).values({ clave: CLAVE_NOMBRE, valor: nombre }).onConflictDoUpdate({ target: ajustes.clave, set: { valor: nombre } });
  fijarNombreEquipo(nombre);
  nombreLeidoEn = Date.now();
  return NextResponse.json({ success: true, data: recursosRapidos() }, { headers: { "Cache-Control": "no-store" } });
});
