import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { fijarNoEnviar, leerNoEnviar } from "@/lib/servicios/correo";

export const dynamic = "force-dynamic";

const idDe = (req: Request): number => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0)
    throw new HttpError(400, "Falta el cliente");
  return id;
};

/** `?id=`: si el cliente está marcado como «no enviar correos». */
export const GET = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  return NextResponse.json({
    success: true,
    data: { no_enviar: await leerNoEnviar(db, idDe(req)) },
  });
});
export const PUT = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const e = await leerJson(req, z.object({ no_enviar: z.boolean() }));
  await fijarNoEnviar(db, idDe(req), e.no_enviar);
  return NextResponse.json({ success: true, data: e });
});
