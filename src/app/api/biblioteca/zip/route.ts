import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { leerArchivo } from "@/lib/servicios/biblioteca";
import { crearZip } from "@/lib/zip";

export const dynamic = "force-dynamic";

/** Descarga varios archivos de la biblioteca juntos en un .zip: `?ids=1,2,3`. */
export const GET = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) throw new HttpError(400, "Faltan los archivos a descargar");
  const entradas: { nombre: string; datos: Buffer }[] = [];
  for (const id of ids) {
    const r = await leerArchivo(db, id);
    if (r) entradas.push({ nombre: r.meta.nombre, datos: r.datos });
  }
  if (entradas.length === 0) throw new HttpError(404, "Archivos no encontrados");
  const zip = crearZip(entradas);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.length),
      "Content-Disposition": `attachment; filename="biblioteca_${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
