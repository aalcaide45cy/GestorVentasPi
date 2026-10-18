import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaPrevisualizarCompletar, previsualizarCompletado } from "@/lib/servicios/completar-datos";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Qué se rellenaría o corregiría con un listado del fabricante. No guarda nada y nunca crea expedientes. */
export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const { filas, referencias } = await leerJson(req, esquemaPrevisualizarCompletar);
  return NextResponse.json({ success: true, data: await previsualizarCompletado(db, usuario, filas, referencias) });
});
