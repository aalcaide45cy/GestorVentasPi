import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, manejar } from "@/lib/http";
import { compararConAntigua } from "@/lib/servicios/comisiones-gestion";

export const dynamic = "force-dynamic";

/** «Comparar con liquidación antigua» (solo administrador). */
export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta el ID de la liquidación");
  return NextResponse.json({ success: true, data: await compararConAntigua(db, id) });
});
