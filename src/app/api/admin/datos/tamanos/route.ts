import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { tamanosSecciones } from "@/lib/servicios/intercambio";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Lo que pesaría hoy el archivo de cada sección al exportarla (en bytes). Va aparte del resto para que las cajitas salgan sin esperarlo. */
export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const fresco = new URL(req.url).searchParams.get("fresco") === "1";
  return NextResponse.json({ success: true, data: await tamanosSecciones(db, fresco) });
});
