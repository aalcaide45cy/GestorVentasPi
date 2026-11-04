import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, leerJson, manejar } from "@/lib/http";
import { esquemaComparticion } from "@/lib/notas";
import { fijarComparticion, leerComparticion } from "@/lib/servicios/notas";

export const dynamic = "force-dynamic";

/** Con quién se comparte una nota (solo lo ve su propietario), y las personas con las que se puede compartir. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta la nota");
  return NextResponse.json({ success: true, data: await leerComparticion(db, u, id) });
});

export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta la nota");
  await fijarComparticion(db, u, id, await leerJson(req, esquemaComparticion));
  return NextResponse.json({ success: true, data: { ok: true } });
});
