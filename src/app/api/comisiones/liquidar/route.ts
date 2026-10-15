import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaLiquidar, liquidar } from "@/lib/servicios/comisiones-gestion";

export const dynamic = "force-dynamic";

/** Calcular / Recalcular liquidación (solo administrador). */
export const POST = manejar(async (req: Request) => {
  await requireSession("administrador");
  const entrada = await leerJson(req, esquemaLiquidar);
  const resumenes = await liquidar(db, entrada);
  return NextResponse.json({ success: true, data: resumenes });
});
