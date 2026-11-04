import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, leerJson, manejar } from "@/lib/http";
import { AMBITOS_GRUPO, esquemaGrupo } from "@/lib/notas";
import { actualizarGrupo, crearGrupo, eliminarGrupo, listarGrupos } from "@/lib/servicios/notas";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const a = new URL(req.url).searchParams.get("ambito");
  const ambito = (AMBITOS_GRUPO as readonly string[]).includes(a ?? "") ? (a as (typeof AMBITOS_GRUPO)[number]) : undefined;
  return NextResponse.json({ success: true, data: await listarGrupos(db, u, ambito) });
});

export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await crearGrupo(db, u, await leerJson(req, esquemaGrupo)) }, { status: 201 });
});

export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta el grupo");
  const e = await leerJson(req, z.object({ nombre: esquemaGrupo.shape.nombre, color: esquemaGrupo.shape.color }));
  return NextResponse.json({ success: true, data: await actualizarGrupo(db, u, id, e) });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta el grupo");
  await eliminarGrupo(db, u, id);
  return NextResponse.json({ success: true, data: { ok: true } });
});
