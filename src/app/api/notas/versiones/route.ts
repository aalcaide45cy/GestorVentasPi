import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, manejar } from "@/lib/http";
import { listarVersiones, restaurarVersion } from "@/lib/servicios/notas";

export const dynamic = "force-dynamic";

/** Los puntos de restauración del texto de una nota (`?id=`). */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta la nota");
  return NextResponse.json({ success: true, data: await listarVersiones(db, u, id) });
});

/** Vuelve a una versión: `?id=` de la nota y `&version=`. */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  const version = leerIdQuery(req, "version");
  if (!id || !version) throw new HttpError(400, "Falta la nota o la versión");
  return NextResponse.json({ success: true, data: await restaurarVersion(db, u, id, version) });
});
