import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { usuarioObjetivo } from "@/lib/servicios/alcance-comisiones";
import { calcularEscenario, esquemaEscenario } from "@/lib/servicios/escenario";

export const dynamic = "force-dynamic";

/**
 * Laboratorio de comisiones: calcula un mes con el plan real y con cambios hipotéticos (objetivo, puntos, tasas, reglas,
 * promociones, tarifas). Solo lee: no modifica el plan ni guarda nada. `?usuario=` solo para el administrador.
 */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaEscenario);
  const r = await calcularEscenario(db, usuarioObjetivo(u, req), entrada.mes, entrada.cambios);
  return NextResponse.json({ success: true, data: r });
});
