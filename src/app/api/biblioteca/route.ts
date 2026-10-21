import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, leerIdsParaBorrar, leerJson, manejar } from "@/lib/http";
import { CATEGORIAS, MAX_BYTES_BIBLIOTECA, cambiarArchivos, eliminarArchivos, guardarArchivo, leerArchivo, listarArchivos, resumenBiblioteca, type CategoriaBiblioteca } from "@/lib/servicios/biblioteca";

export const dynamic = "force-dynamic";

const nombreSeguro = (n: string) => n.replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, "_");

/** `?id=N` descarga el archivo; sin `id`, lista (`?categorias=pedido,rejilla` para filtrar) y da el total ocupado. */
export const GET = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (id) {
    const r = await leerArchivo(db, id);
    if (!r) return errorJson(404, "Archivo no encontrado");
    // `ver=1`: se enseña en la propia página (PDF, imágenes y texto); el resto de tipos siempre se descargan, nunca se ejecutan en el navegador
    const enLinea = new URL(req.url).searchParams.get("ver") === "1" && /^(application\/pdf|image\/(png|jpe?g|webp|gif|bmp|tiff?)|text\/(plain|csv))$/.test(r.meta.mime);
    return new NextResponse(new Uint8Array(r.datos), {
      headers: {
        "Content-Type": r.meta.mime,
        "Content-Length": String(r.datos.length),
        "Content-Disposition": `${enLinea ? "inline" : "attachment"}; filename="${nombreSeguro(r.meta.nombre)}"`,
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const pedidas = (new URL(req.url).searchParams.get("categorias") ?? "").split(",").filter((c): c is CategoriaBiblioteca => (CATEGORIAS as readonly string[]).includes(c));
  return NextResponse.json({ success: true, data: { archivos: await listarArchivos(db, pedidas), resumen: await resumenBiblioteca(db) } });
});

/** Guarda un archivo (cuerpo = el archivo tal cual). `?nombre=&categoria=` (sin categoría se propone por el nombre). */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const q = new URL(req.url).searchParams;
  const categoria = q.get("categoria");
  if (categoria && !(CATEGORIAS as readonly string[]).includes(categoria)) throw new HttpError(400, "Categoría no válida");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES_BIBLIOTECA) throw new HttpError(413, "El archivo es demasiado grande (máximo 200 MB).");
  const datos = Buffer.from(await req.arrayBuffer());
  const r = await guardarArchivo(db, { datos, nombre: q.get("nombre") ?? "archivo", mime: req.headers.get("content-type") ?? "", categoria: (categoria as CategoriaBiblioteca | null) ?? undefined, creadoPor: u.idUsuario });
  return NextResponse.json({ success: true, data: r }, { status: r.repetido ? 200 : 201 });
});

const esquemaCambio = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
  nombre: z.string().trim().min(1).max(200).optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  /** null = sin asignar. */
  idCliente: z.number().int().positive().nullable().optional(),
  idExpediente: z.number().int().positive().nullable().optional(),
});

/** Cambia el nombre, el tipo o la asignación (cliente o expediente) de uno o varios archivos. */
export const PATCH = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const { ids, ...cambios } = await leerJson(req, esquemaCambio);
  const n = await cambiarArchivos(db, ids, cambios);
  return NextResponse.json({ success: true, modificados: n });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const ids = await leerIdsParaBorrar(req);
  const n = await eliminarArchivos(db, ids);
  await auditar({ idUsuario: u.idUsuario, accion: "biblioteca_eliminados", entidad: "biblioteca", detalle: { ids } });
  return NextResponse.json({ success: true, message: n === 1 ? "Archivo eliminado" : `${n} archivos eliminados` });
});
