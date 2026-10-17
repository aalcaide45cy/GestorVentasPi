import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, leerJson, manejar } from "@/lib/http";
import { esquemaComisionado, estadoComisionado, fijarComisionado } from "@/lib/servicios/comisionado";

export const dynamic = "force-dynamic";

/** Estado «comisionado» de un expediente (`?id=N`). */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta el expediente");
  return NextResponse.json({ success: true, data: await estadoComisionado(db, u, id) });
});

/** Marca el expediente como comisionado (pagado), reclamado o pendiente en un mes, o vuelve a lo que diga el Cotejo. */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaComisionado);
  const data = await fijarComisionado(db, u, entrada);
  await auditar({ idUsuario: u.idUsuario, accion: "comisionado_cambiado", entidad: "expedientes", entidadId: String(entrada.idExpediente), detalle: { mes: entrada.mes, estado: entrada.estado } });
  return NextResponse.json({ success: true, data });
});
