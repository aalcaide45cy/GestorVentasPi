import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { SECCIONES, contenidoSeccion, type Seccion } from "@/lib/servicios/intercambio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Lo que se exportaría de una sección, como tablas para verlo antes (`?seccion=clientes`). No descarga ni cambia nada. */
export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const seccion = new URL(req.url).searchParams.get("seccion") as Seccion | null;
  if (!seccion || !SECCIONES.includes(seccion)) throw new HttpError(400, "Sección no válida");
  return NextResponse.json({ success: true, data: await contenidoSeccion(db, seccion) });
});
