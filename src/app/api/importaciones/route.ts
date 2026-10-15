import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, manejar } from "@/lib/http";
import { eliminarBloques, listarBloques } from "@/lib/servicios/importaciones";

export const dynamic = "force-dynamic";

export const GET = manejar(async () => {
  await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await listarBloques(db) });
});

export const DELETE = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "ID del bloque es requerido");
  await eliminarBloques(db, [id]);
  return NextResponse.json({ success: true, message: "Bloque de importación eliminado correctamente de los registros." });
});
