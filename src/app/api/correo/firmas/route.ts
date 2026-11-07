import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaFirma } from "@/lib/correo";
import {
  eliminarFirma,
  guardarFirma,
  listarFirmas,
} from "@/lib/servicios/correo";

export const dynamic = "force-dynamic";

const idDe = (req: Request): number => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0)
    throw new HttpError(400, "Falta la firma");
  return id;
};

/** Gestor de firmas (las comparten todos los usuarios, como las plantillas). */
export const GET = manejar(async () => {
  await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await listarFirmas(db) });
});
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({
    success: true,
    data: await guardarFirma(db, u, null, await leerJson(req, esquemaFirma)),
  });
});
export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({
    success: true,
    data: await guardarFirma(
      db,
      u,
      idDe(req),
      await leerJson(req, esquemaFirma),
    ),
  });
});
export const DELETE = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  await eliminarFirma(db, idDe(req));
  return NextResponse.json({ success: true, data: null });
});
