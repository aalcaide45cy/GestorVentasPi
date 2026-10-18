import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, manejar } from "@/lib/http";
import { detalleCopia } from "@/lib/servicios/copias-detalle";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Detalle de una copia de seguridad: datos de su cabecera y cuánto ocupa cada tabla dentro del archivo. */
export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta la copia");
  return NextResponse.json({ success: true, data: await detalleCopia(db, id) });
});
