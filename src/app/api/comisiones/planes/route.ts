import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, leerJsonCrudo, manejar } from "@/lib/http";
import { eliminarPlan, guardarPlan, leerPlan, listarPlanes } from "@/lib/servicios/planes";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) return NextResponse.json({ success: true, data: await listarPlanes(db) });
  const plan = await leerPlan(db, id);
  if (!plan) return errorJson(404, "Plan no encontrado");
  return NextResponse.json({ success: true, data: plan });
});

export const POST = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const r = await guardarPlan(db, null, await leerJsonCrudo(req));
  await auditar({ idUsuario: u.idUsuario, accion: "plan_creado", entidad: "commission_plans", entidadId: String(r.plan.idPlan) });
  return NextResponse.json({ success: true, data: r.plan, impactos: r.impactos }, { status: 201 });
});

export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta el ID del plan");
  const r = await guardarPlan(db, id, await leerJsonCrudo(req));
  await auditar({ idUsuario: u.idUsuario, accion: "plan_modificado", entidad: "commission_plans", entidadId: String(id) });
  return NextResponse.json({ success: true, data: r.plan, impactos: r.impactos });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta el ID del plan");
  await eliminarPlan(db, id);
  await auditar({ idUsuario: u.idUsuario, accion: "plan_eliminado", entidad: "commission_plans", entidadId: String(id) });
  return NextResponse.json({ success: true });
});
