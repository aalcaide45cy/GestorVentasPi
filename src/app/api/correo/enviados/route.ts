import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { expedientesConCorreoEnviado } from "@/lib/servicios/correo";

export const dynamic = "force-dynamic";

const CAMPOS = [
  "fecha_afectacion",
  "fecha_rci",
  "fecha_matriculacion",
  "fecha_facturacion",
  "fecha_entrega",
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
