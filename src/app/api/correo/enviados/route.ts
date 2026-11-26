import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { expedientesConCorreoEnviado, fijarSobre } from "@/lib/servicios/correo";

export const dynamic = "force-dynamic";

const CAMPOS = [
  "fecha_expediente",
  "fecha_afectacion",
  "fecha_rci",
  "fecha_matriculacion",
  "fecha_facturacion",
  "fecha_entrega",
  // El botón de WhatsApp de la fecha de matrícula
  "whatsapp",
];

/** `?campo=fecha_entrega`: los expedientes a los que ya se ha enviado el correo de esa fecha (con el botón ✉️), con cuándo. */
export const GET = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const campo = new URL(req.url).searchParams.get("campo") ?? "";
  if (!CAMPOS.includes(campo)) throw new HttpError(400, "Fecha no válida");
  return NextResponse.json({
    success: true,
    data: await expedientesConCorreoEnviado(db, campo),
  });
});

const esquema = z.object({
  idExpediente: z.number().int().positive(),
  campo: z.string().refine((c) => CAMPOS.includes(c), "Fecha no válida"),
  verde: z.boolean(),
});

/** Pone a mano un sobre en verde o lo devuelve a azul. */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  await fijarSobre(db, u, await leerJson(req, esquema));
  return NextResponse.json({ success: true });
});
