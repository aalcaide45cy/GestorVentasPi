import { NextResponse } from "next/server";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { MAX_BYTES_OCR } from "@/lib/servicios/ocr";
import { leerMatriculasDeFichero } from "@/lib/servicios/ocr-rejilla";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Lee las matrículas de una rejilla escaneada (PDF o imagen; el cuerpo es el fichero tal cual). No guarda nada: el usuario
 * revisa lo leído y lo envía después a `PUT /api/cotejo/rejillas`.
 */
export const POST = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES_OCR) throw new HttpError(413, "El fichero es demasiado grande (máximo 500 MB).");
  const datos = Buffer.from(await req.arrayBuffer());
  if (datos.length === 0) throw new HttpError(400, "El fichero está vacío.");
  if (datos.length > MAX_BYTES_OCR) throw new HttpError(413, "El fichero es demasiado grande (máximo 500 MB).");
  const paginas = await leerMatriculasDeFichero(datos);
  return NextResponse.json({ success: true, data: { paginas } });
});
