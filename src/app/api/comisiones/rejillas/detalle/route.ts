import { NextResponse } from "next/server";
import { db } from "@/db";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { cambiarMesRejilla, detalleRejilla, esquemaCambiarMes } from "@/lib/servicios/rejillas-visor";

export const dynamic = "force-dynamic";

/** Filas de una rejilla guardada, para verlas, ordenarlas y buscar en ellas. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Falta la rejilla");
  const d = await detalleRejilla(db, id);
  if (d.rejilla.idUsuario !== u.idUsuario && !esAdministrador(u.rol)) throw new HttpError(403, "No tienes permiso para ver esta rejilla");
  return NextResponse.json({ success: true, data: d });
});

/** Cambia el mes de una rejilla guardada. */
export const PATCH = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const e = await leerJson(req, esquemaCambiarMes);
  const d = await detalleRejilla(db, e.id);
  if (d.rejilla.idUsuario !== u.idUsuario && !esAdministrador(u.rol)) throw new HttpError(403, "No tienes permiso para cambiar esta rejilla");
  await cambiarMesRejilla(db, e);
  return NextResponse.json({ success: true });
});
