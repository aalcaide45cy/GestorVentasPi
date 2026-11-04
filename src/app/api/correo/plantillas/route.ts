import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaPlantilla } from "@/lib/correo";
import {
  eliminarPlantilla,
  guardarPlantilla,
  listarPlantillas,
} from "@/lib/servicios/correo";

export const dynamic = "force-dynamic";

const idDe = (req: Request): number => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0)
    throw new HttpError(400, "Falta la plantilla");
  return id;
};

/** Plantillas de correo (las comparten todos los usuarios). */
export const GET = manejar(async () => {
  await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await listarPlantillas(db) });
});
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({
    success: true,
    data: await guardarPlantilla(
      db,
      u,
      null,
      await leerJson(req, esquemaPlantilla),
    ),
  });
});
export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({
    success: true,
    data: await guardarPlantilla(
      db,
      u,
      idDe(req),
      await leerJson(req, esquemaPlantilla),
    ),
  });
});
export const DELETE = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  await eliminarPlantilla(db, idDe(req));
  return NextResponse.json({ success: true, data: null });
});
