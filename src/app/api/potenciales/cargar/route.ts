import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/sesion";
import { HttpError } from "@/lib/auth/sesion";
import { db } from "@/db";
import { manejar } from "@/lib/http";
import { MAX_BYTES_ADJUNTO } from "@/lib/servicios/adjuntos";
import { cargarPresupuesto } from "@/lib/servicios/potenciales";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Lee un presupuesto (cuerpo = el PDF o la imagen tal cual, `?nombre=`) y lo guarda con su cliente potencial. Lo que no sea un presupuesto se descarta (422). */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES_ADJUNTO)
    throw new HttpError(413, "El fichero es demasiado grande (máximo 500 MB).");
  const datos = Buffer.from(await req.arrayBuffer());
  const nombre =
    new URL(req.url).searchParams.get("nombre") ?? "presupuesto.pdf";
  return NextResponse.json({
    success: true,
    data: await cargarPresupuesto(db, u, nombre, datos),
  });
});
