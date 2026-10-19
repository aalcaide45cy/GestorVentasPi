import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { recursosRapidos } from "@/lib/rendimiento";

export const dynamic = "force-dynamic";

/** Uso del equipo en este momento (CPU, memoria, temperatura, disco) para el indicador de la barra superior. Solo administrador. */
export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: recursosRapidos() }, { headers: { "Cache-Control": "no-store" } });
});
