import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, manejar } from "@/lib/http";
import { contarUsosCatalogo, expedientesDeCatalogo } from "@/lib/servicios/usos-catalogo";

export const dynamic = "force-dynamic";

/**
 * Qué expedientes usan cada marca y cada modelo (solo administrador). Sin parámetros: cuántos usan cada uno (vigentes y en la Papelera). Con `?marca=ID` o
 * `?modelo=ID`: la lista de esos expedientes.
 */
export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const q = new URL(req.url).searchParams;
  const marca = Number(q.get("marca"));
  const modelo = Number(q.get("modelo"));
  if (Number.isInteger(modelo) && modelo > 0) return NextResponse.json({ success: true, data: await expedientesDeCatalogo(db, { idModelo: modelo }) }, { headers: { "Cache-Control": "no-store" } });
  if (Number.isInteger(marca) && marca > 0) return NextResponse.json({ success: true, data: await expedientesDeCatalogo(db, { idMarca: marca }) }, { headers: { "Cache-Control": "no-store" } });
  if (q.has("marca") || q.has("modelo")) return errorJson(400, "Indica una marca o un modelo válido");
  return NextResponse.json({ success: true, data: await contarUsosCatalogo(db) }, { headers: { "Cache-Control": "no-store" } });
});
