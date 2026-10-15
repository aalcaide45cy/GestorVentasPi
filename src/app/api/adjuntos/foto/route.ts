import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { establecerFotoCliente } from "@/lib/servicios/adjuntos";

export const dynamic = "force-dynamic";

const esquema = z.object({ idCliente: z.number().int().positive(), idAdjunto: z.number().int().positive().nullable() });

/** Fija (o quita, con `idAdjunto: null`) la foto del cliente que se ve al pasar el ratón. */
export const PUT = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const e = await leerJson(req, esquema);
  await establecerFotoCliente(db, e.idCliente, e.idAdjunto);
  return NextResponse.json({ success: true });
});
