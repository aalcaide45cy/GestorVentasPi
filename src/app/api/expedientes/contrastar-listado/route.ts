import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { contrastarConExpedientes, esquemaContrastarListado } from "@/lib/servicios/contraste";

export const dynamic = "force-dynamic";

/** Compara un listado de ventas con los expedientes. Solo lectura. */
export const POST = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaContrastarListado);
  return NextResponse.json({ success: true, resultado: await contrastarConExpedientes(db, entrada) });
});
