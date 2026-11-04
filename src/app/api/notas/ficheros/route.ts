import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, manejar } from "@/lib/http";
import { MAX_BYTES_FICHERO_NOTA } from "@/lib/notas";
import { eliminarFichero, leerFichero, subirFichero } from "@/lib/servicios/notas";

export const dynamic = "force-dynamic";

const nombreSeguro = (n: string) => n.replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, "_");
/** Solo las imágenes y los PDF se ven dentro de la aplicación; cualquier otra cosa (por ejemplo un HTML o un SVG) se descarga, para que nunca se ejecute. */
const EN_LINEA = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

/** `?id=N` devuelve el fichero (`&miniatura=1` la miniatura; `&descargar=1` fuerza la descarga). */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta el fichero");
  const q = new URL(req.url).searchParams;
  const f = await leerFichero(db, u, id, q.get("miniatura") === "1");
  const enLinea = EN_LINEA.has(f.mime) && q.get("descargar") !== "1";
  return new NextResponse(new Uint8Array(f.datos), {
    headers: {
      "Content-Type": enLinea ? f.mime : "application/octet-stream",
      "Content-Length": String(f.datos.length),
      "Content-Disposition": `${enLinea ? "inline" : "attachment"}; filename="${nombreSeguro(f.nombre)}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "frame-ancestors 'self'; sandbox",
    },
  });
});

/** Sube un fichero a una nota (cuerpo = el fichero tal cual): `?idNota=&nombre=`. */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const q = new URL(req.url).searchParams;
  const idNota = leerIdQuery(req, "idNota");
  if (!idNota) throw new HttpError(400, "Falta la nota");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES_FICHERO_NOTA) throw new HttpError(413, "El fichero es demasiado grande (máximo 500 MB).");
  const datos = Buffer.from(await req.arrayBuffer());
  return NextResponse.json({ success: true, data: await subirFichero(db, u, idNota, q.get("nombre") ?? "archivo", datos) }, { status: 201 });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta el fichero");
  await eliminarFichero(db, u, id);
  return NextResponse.json({ success: true, data: { ok: true } });
});
