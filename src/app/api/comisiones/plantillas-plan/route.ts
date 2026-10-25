import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { AMBITOS, type Ambito } from "@/lib/plantillas-plan/fragmentos";
import { errorJson, leerIdQuery, leerJson, leerJsonCrudo, manejar } from "@/lib/http";
import { actualizarPlantillaPlan, borrarPlantillaPlan, crearPlantillaPlan, listarPlantillasPlan, marcarPlantillaPlanBase } from "@/lib/servicios/plantillas-plan";

export const dynamic = "force-dynamic";

/** Plantillas de partes de un plan; con `?ambito=` solo las de esa pestaña (o «global»). */
export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const a = new URL(req.url).searchParams.get("ambito");
  const ambito = a && (AMBITOS as readonly string[]).includes(a) ? (a as Ambito) : undefined;
  return NextResponse.json({ success: true, data: await listarPlantillasPlan(db, ambito) });
});

export const POST = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const p = await crearPlantillaPlan(db, await leerJsonCrudo(req));
  await auditar({ idUsuario: u.idUsuario, accion: "plantilla_plan_creada", entidad: "plantillas_plan", entidadId: String(p.id), detalle: { ambito: p.ambito } });
  return NextResponse.json({ success: true, data: p }, { status: 201 });
});

export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta la plantilla");
  const p = await actualizarPlantillaPlan(db, id, await leerJsonCrudo(req));
  await auditar({ idUsuario: u.idUsuario, accion: "plantilla_plan_modificada", entidad: "plantillas_plan", entidadId: String(id) });
  return NextResponse.json({ success: true, data: p });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta la plantilla");
  await borrarPlantillaPlan(db, id);
  await auditar({ idUsuario: u.idUsuario, accion: "plantilla_plan_borrada", entidad: "plantillas_plan", entidadId: String(id) });
  return NextResponse.json({ success: true });
});

/** `?id=N` con `{ base: true | false }`: marca o desmarca la plantilla como base (viene de serie y «Borrar absolutamente todo» la conserva). */
export const PATCH = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta la plantilla");
  const { base } = await leerJson(req, z.object({ base: z.boolean() }));
  const p = await marcarPlantillaPlanBase(db, id, base);
  await auditar({ idUsuario: u.idUsuario, accion: "plantilla_plan_base", entidad: "plantillas_plan", entidadId: String(id), detalle: { base } });
  return NextResponse.json({ success: true, data: p });
});
