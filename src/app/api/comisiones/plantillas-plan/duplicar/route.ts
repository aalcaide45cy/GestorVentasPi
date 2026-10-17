import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, manejar } from "@/lib/http";
import { duplicarPlantillaPlan } from "@/lib/servicios/plantillas-plan";

export const dynamic = "force-dynamic";

/** Hace una copia de una plantilla de plan. */
export const POST = manejar(async (req: Request) => {
  await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta la plantilla");
  return NextResponse.json({ success: true, data: await duplicarPlantillaPlan(db, id) }, { status: 201 });
});
