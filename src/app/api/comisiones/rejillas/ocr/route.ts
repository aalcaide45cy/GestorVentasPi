import { NextResponse } from "next/server";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { MAX_BYTES_OCR, reconocerRejilla } from "@/lib/servicios/ocr";
import { leerMatriculasDeFichero } from "@/lib/servicios/ocr-rejilla";

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
  // La hoja escaneada «Resultado PROPIO» no se deja leer línea a línea (colores, cuadrícula, apuntes): si no ha salido ninguna fila se
  // leen al menos las matrículas, celda a celda, con el lector de la cuadrícula; los importes se escriben a mano en la revisión
  if (r.filas.length === 0) {
    const hojas = await leerMatriculasDeFichero(datos).catch(() => []);
    const matriculas = hojas.flatMap((h) => h.matriculas);
    if (matriculas.length > 0)
      return NextResponse.json({
        success: true,
        data: {
          filas: matriculas.map((m) => ({ matricula: m.matricula, cliente: null, financiacion: null, concepto: null, importe: m.importe ?? null, textoOriginal: null, confianza: m.valida ? m.confianza : 0 })),
          metodo: "ocr",
          paginas: r.paginas,
          aviso: matriculas.some((m) => m.importe != null)
            ? "Hoja escaneada: se han leído las matrículas y el importe de cada fila, celda a celda. Compruébalos con la hoja antes de guardar (fondo ámbar = poca confianza; importe vacío = no se ha podido leer)."
            : "De esta hoja solo se han podido leer las matrículas (las de fondo ámbar, con poca confianza). Compruébalas con la hoja y escribe el importe de cada una antes de guardar.",
        },
      });
  }
  const aviso =
    r.aviso ??
    (r.metodo === "ocr"
      ? "Texto reconocido por OCR: revisa las matrículas y los importes (las filas con fondo ámbar tienen poca confianza)."
      : null);
  return NextResponse.json({ success: true, data: { filas: r.filas, metodo: r.metodo, paginas: r.paginas, aviso } });
});
