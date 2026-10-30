import { NextResponse } from "next/server";
import { db } from "@/db";
import { esquemaEvento } from "@/lib/calendario";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, leerJson, manejar } from "@/lib/http";
import { actualizarEvento, crearEvento, eliminarEvento, leerCalendario } from "@/lib/servicios/calendario";

export const dynamic = "force-dynamic";

/** Mis notas y las que otros comparten, entre `desde` y `hasta` (AAAA-MM-DD); con `expedientes=1`, también las fechas de mis expedientes. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const q = new URL(req.url).searchParams;
  const desde = q.get("desde") ?? "";
  const hasta = q.get("hasta") ?? "";
  return NextResponse.json({ success: true, data: await leerCalendario(db, u, desde, hasta, q.get("expedientes") === "1") });
});

export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await crearEvento(db, u, await leerJson(req, esquemaEvento)) }, { status: 201 });
});

export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta la nota");
  return NextResponse.json({ success: true, data: await actualizarEvento(db, u, id, await leerJson(req, esquemaEvento)) });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta la nota");
  await eliminarEvento(db, u, id);
  return NextResponse.json({ success: true, data: { eliminada: true } });
});
