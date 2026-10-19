import { NextResponse } from "next/server";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { MAX_BYTES_OCR, reconocerRejilla } from "@/lib/servicios/ocr";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Lee una rejilla en PDF o imagen (cuerpo = el fichero tal cual) y devuelve las filas candidatas.
 * No guarda nada: el usuario las revisa y las envía después a `PUT /api/comisiones/rejillas`.
 */
export const POST = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES_OCR) throw new HttpError(413, "El fichero es demasiado grande (máximo 500 MB).");
  const datos = Buffer.from(await req.arrayBuffer());
  const r = await reconocerRejilla(datos);
  const aviso =
    r.aviso ??
    (r.metodo === "ocr"
      ? "Texto reconocido por OCR: revisa las matrículas y los importes (las filas con fondo ámbar tienen poca confianza)."
      : null);
  return NextResponse.json({ success: true, data: { filas: r.filas, metodo: r.metodo, paginas: r.paginas, aviso } });
});
