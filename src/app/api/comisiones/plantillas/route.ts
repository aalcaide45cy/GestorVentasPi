import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, leerJsonCrudo, manejar } from "@/lib/http";
import { actualizarPlantilla, borrarPlantilla, crearPlantilla, leerPlantilla, listarPlantillas } from "@/lib/servicios/plantillas-tarifas";

export const dynamic = "force-dynamic";

/** Lista de plantillas de tarifas VN; con `?id=N` devuelve una completa (con sus tarifas). */
export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const id = leerIdQuery(req);
  if (id) return NextResponse.json({ success: true, data: await leerPlantilla(db, id) });
  return NextResponse.json({ success: true, data: await listarPlantillas(db) });
});

export const POST = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const p = await crearPlantilla(db, await leerJsonCrudo(req));
  await auditar({ idUsuario: u.idUsuario, accion: "plantilla_tarifas_creada", entidad: "plantillas_tarifas_vn", entidadId: String(p.id) });
  return NextResponse.json({ success: true, data: p }, { status: 201 });
});

export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta la plantilla");
  const p = await actualizarPlantilla(db, id, await leerJsonCrudo(req));
  await auditar({ idUsuario: u.idUsuario, accion: "plantilla_tarifas_modificada", entidad: "plantillas_tarifas_vn", entidadId: String(id) });
  return NextResponse.json({ success: true, data: p });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta la plantilla");
  await borrarPlantilla(db, id);
  await auditar({ idUsuario: u.idUsuario, accion: "plantilla_tarifas_borrada", entidad: "plantillas_tarifas_vn", entidadId: String(id) });
  return NextResponse.json({ success: true });
});
