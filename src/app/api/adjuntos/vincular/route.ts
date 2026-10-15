import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { vincularPendientes } from "@/lib/servicios/adjuntos";

export const dynamic = "force-dynamic";

const esquema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(20),
  idCliente: z.number().int().positive().nullish(),
  idExpediente: z.number().int().positive().nullish(),
});

/** Vincula adjuntos subidos antes de guardar (cliente o expediente nuevo) al registro ya creado. */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const e = await leerJson(req, esquema);
  if (!e.idCliente && !e.idExpediente) throw new HttpError(400, "Indica el cliente o el expediente");
  const n = await vincularPendientes(db, e.ids, { idCliente: e.idCliente, idExpediente: e.idExpediente }, u.idUsuario);
  return NextResponse.json({ success: true, data: { vinculados: n } });
});
