import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { mesDeQuery } from "@/lib/servicios/alcance-comisiones";
import { planDelMes } from "@/lib/servicios/liquidaciones";

export const dynamic = "force-dynamic";

/** Promociones de puntos del plan que se aplica al mes (para el selector del expediente). */
export const GET = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const plan = await planDelMes(db, mesDeQuery(req));
  return NextResponse.json({
    success: true,
    data: { plan: plan ? { idPlan: plan.idPlan, nombre: plan.nombre ?? "" } : null, promociones: plan?.promociones ?? [], puntosPorDefecto: plan?.puntosPorDefectoModelo ?? {} },
  });
});
