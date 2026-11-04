import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaEtiqueta } from "@/lib/notas";
import { eliminarEtiqueta, guardarEtiqueta, listarEtiquetas } from "@/lib/servicios/notas";

export const dynamic = "force-dynamic";

/** Mis etiquetas con su color y su emoticono. */
export const GET = manejar(async () => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await listarEtiquetas(db, u) });
});

/** Crea o cambia una etiqueta (con `nuevo_nombre`, la renombra en todas mis notas). */
export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await guardarEtiqueta(db, u, await leerJson(req, esquemaEtiqueta)) });
});

/** `?nombre=`: la quita de la lista y de todas mis notas. */
export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const nombre = new URL(req.url).searchParams.get("nombre")?.trim();
  if (!nombre) throw new HttpError(400, "Falta la etiqueta");
  return NextResponse.json({ success: true, data: { notas: await eliminarEtiqueta(db, u, nombre) } });
});
