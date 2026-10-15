import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, leerJsonCrudo, manejar } from "@/lib/http";
import { usuarioObjetivo } from "@/lib/servicios/alcance-comisiones";
import { actualizarPendiente, crearPendiente, eliminarPendiente, listarPendientes } from "@/lib/servicios/comisiones-gestion";

export const dynamic = "force-dynamic";

const mesActual = () => new Date().toISOString().slice(0, 7);

export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await listarPendientes(db, usuarioObjetivo(u, req), mesActual()) });
});

export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await crearPendiente(db, usuarioObjetivo(u, req), await leerJsonCrudo(req)) }, { status: 201 });
});

export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta el ID");
  return NextResponse.json({ success: true, data: await actualizarPendiente(db, usuarioObjetivo(u, req), id, await leerJsonCrudo(req)) });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta el ID");
  await eliminarPendiente(db, usuarioObjetivo(u, req), id);
  return NextResponse.json({ success: true });
});
