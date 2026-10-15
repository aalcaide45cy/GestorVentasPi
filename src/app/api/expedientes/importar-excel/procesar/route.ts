import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaProcesarExcel, procesarActualizacionesExcel } from "@/lib/servicios/importaciones";

export const dynamic = "force-dynamic";

export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaProcesarExcel);
  const r = await procesarActualizacionesExcel(db, usuario, entrada);
  return NextResponse.json({ success: true, processedCount: r.procesados, message: r.mensaje });
});
