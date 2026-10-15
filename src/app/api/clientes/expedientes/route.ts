import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, manejar } from "@/lib/http";
import { expedientesDeCliente } from "@/lib/servicios/expedientes-lectura";

export const dynamic = "force-dynamic";

/** Expedientes de un cliente (modal «Expedientes de …»). */
export const GET = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta el ID del cliente");
  return NextResponse.json({ success: true, data: await expedientesDeCliente(db, id) });
});
