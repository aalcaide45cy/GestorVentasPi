import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { mesDeQuery, usuarioObjetivo } from "@/lib/servicios/alcance-comisiones";
import { calcularVendedorMes } from "@/lib/servicios/liquidaciones";

export const dynamic = "force-dynamic";

/** Puntos, tramo y comisiones estimadas del mes (sin guardar). Alimenta «Detalle y Resumen Estadístico» y el Dashboard. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const r = await calcularVendedorMes(db, usuarioObjetivo(u, req), mesDeQuery(req));
  return NextResponse.json({ success: true, data: r });
});
