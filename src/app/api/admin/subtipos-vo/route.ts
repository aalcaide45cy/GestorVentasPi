import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { crearSubtipo, eliminarSubtipo, listarSubtipos, renombrarSubtipo } from "@/lib/servicios/subtipos-vo";

export const dynamic = "force-dynamic";

const nombre = z.string().min(1).max(30);

export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: await listarSubtipos(db) });
});

export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const e = await leerJson(req, z.object({ nombre }));
  await crearSubtipo(db, e.nombre);
  await auditar({ idUsuario: admin.idUsuario, accion: "subtipo_vo_creado", entidad: "ajustes" });
  return NextResponse.json({ success: true, data: await listarSubtipos(db) });
});

export const PUT = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const e = await leerJson(req, z.object({ de: nombre, a: nombre }));
  await renombrarSubtipo(db, e.de, e.a);
  await auditar({ idUsuario: admin.idUsuario, accion: "subtipo_vo_renombrado", entidad: "ajustes" });
  return NextResponse.json({ success: true, data: await listarSubtipos(db) });
});

export const DELETE = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const e = await leerJson(req, z.object({ nombre }));
  await eliminarSubtipo(db, e.nombre);
  await auditar({ idUsuario: admin.idUsuario, accion: "subtipo_vo_eliminado", entidad: "ajustes" });
  return NextResponse.json({ success: true, data: await listarSubtipos(db) });
});
