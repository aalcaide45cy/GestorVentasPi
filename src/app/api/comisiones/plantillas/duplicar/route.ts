import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, manejar } from "@/lib/http";
import { duplicarPlantilla } from "@/lib/servicios/plantillas-tarifas";

export const dynamic = "force-dynamic";

/** Hace una copia editable de una plantilla (por ejemplo, de la genérica que viene con la aplicación). */
export const POST = manejar(async (req: Request) => {
  await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta la plantilla");
  return NextResponse.json({ success: true, data: await duplicarPlantilla(db, id) }, { status: 201 });
});
