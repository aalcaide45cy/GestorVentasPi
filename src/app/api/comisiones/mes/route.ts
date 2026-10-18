import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { mesDeQuery, usuarioObjetivo } from "@/lib/servicios/alcance-comisiones";
import { describirExpedientes } from "@/lib/servicios/escenario";
import { calcularVendedorMes } from "@/lib/servicios/liquidaciones";

export const dynamic = "force-dynamic";

/** Puntos, tramo y comisiones estimadas del mes (sin guardar). Alimenta «Detalle y Resumen Estadístico» y el Dashboard. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const r = await calcularVendedorMes(db, usuarioObjetivo(u, req), mesDeQuery(req));
  // Cliente, vehículo y matrícula de los expedientes que aparecen, aunque no estén en la lista cargada en pantalla
  const expedientes = r ? await describirExpedientes(db, [...r.lineas.map((l) => l.idExpediente), ...r.financiacionesFueraDeMes.map((f) => f.idExpediente)]) : {};
  return NextResponse.json({ success: true, data: r ? { ...r, expedientes } : r });
});
