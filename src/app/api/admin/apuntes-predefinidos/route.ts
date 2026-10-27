import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, leerJson, manejar } from "@/lib/http";
import { actualizarPredefinido, crearPredefinido, eliminarPredefinido, esquemaPredefinido, listarPredefinidos } from "@/lib/servicios/apuntes";

export const dynamic = "force-dynamic";

/** Los apuntes predefinidos (los ven todos, para los botones rápidos del expediente). */
export const GET = manejar(async () => {
  await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await listarPredefinidos(db) });
});

export const POST = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  return NextResponse.json({ success: true, data: await crearPredefinido(db, u, await leerJson(req, esquemaPredefinido)) }, { status: 201 });
});

export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta el apunte predefinido");
  return NextResponse.json({ success: true, data: await actualizarPredefinido(db, u, id, await leerJson(req, esquemaPredefinido)) });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta el apunte predefinido");
  await eliminarPredefinido(db, u, id);
  return NextResponse.json({ success: true, data: { eliminado: true } });
});
