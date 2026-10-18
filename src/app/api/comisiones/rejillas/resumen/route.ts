import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { mesDeQuery, usuarioObjetivo } from "@/lib/servicios/alcance-comisiones";
import { resumenLiquidacionMes } from "@/lib/servicios/rejillas-visor";

export const dynamic = "force-dynamic";

/** Lo que dice tu liquidación del mes (créditos, preference, tramo, objetivo, bonus, comisión por coche) para cotejarlo con la rejilla. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await resumenLiquidacionMes(db, usuarioObjetivo(u, req), mesDeQuery(req)) });
});
