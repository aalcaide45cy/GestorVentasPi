import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, manejar } from "@/lib/http";
import { MAX_BYTES_ADJUNTO } from "@/lib/servicios/adjuntos";
import { listarPagos, subirPago } from "@/lib/servicios/pagos-rci";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Lista los pagos de la financiera subidos (los tuyos; el administrador, todos). */
export const GET = manejar(async () => {
  const usuario = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await listarPagos(db, usuario) });
});

/** Sube un pago (cuerpo = el fichero). `?nombre=`; con `&idExpediente=` se aplica a ese expediente (y `&forzar=1` si el documento no coincide). */
export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const q = new URL(req.url).searchParams;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES_ADJUNTO) throw new HttpError(413, "El fichero es demasiado grande (máximo 500 MB).");
  const datos = Buffer.from(await req.arrayBuffer());
  const pago = await subirPago(db, usuario, { datos, nombre: q.get("nombre") ?? "pago", idExpediente: leerIdQuery(req, "idExpediente") ?? undefined, forzar: q.get("forzar") === "1" });
  return NextResponse.json({ success: true, data: pago }, { status: 201 });
});
