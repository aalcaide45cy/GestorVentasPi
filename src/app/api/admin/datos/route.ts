import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { INFO_SECCIONES, planesParaElegir, resumenSecciones } from "@/lib/servicios/intercambio";

export const dynamic = "force-dynamic";

/** Secciones de datos (con qué contiene cada una y cuántos registros tiene) y lista de planes para exportar. */
export const GET = manejar(async () => {
  await requireSession("administrador");
  const [resumen, planes] = await Promise.all([resumenSecciones(db), planesParaElegir(db)]);
  return NextResponse.json({ success: true, data: { secciones: resumen.map((r) => ({ ...r, ...INFO_SECCIONES[r.seccion] })), planes } });
});
