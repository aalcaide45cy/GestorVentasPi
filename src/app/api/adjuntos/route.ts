import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, leerIdsParaBorrar, manejar } from "@/lib/http";
import { MAX_BYTES_ADJUNTO, TIPOS_ADJUNTO, eliminarAdjunto, existeAdjunto, guardarAdjunto, leerAdjunto, listarAdjuntos, type TipoAdjunto } from "@/lib/servicios/adjuntos";

export const dynamic = "force-dynamic";

const nombreSeguro = (n: string) => n.replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, "_");

/**
 * `?id=N` devuelve el fichero (en línea, para la vista previa; `&miniatura=1` para la miniatura).
 * Sin `id`, lista los adjuntos de `?idCliente=` o `?idExpediente=`.
 */
export const GET = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const id = leerIdQuery(req);
  const q = new URL(req.url).searchParams;
  if (id) {
    const r = await leerAdjunto(db, id, q.get("miniatura") === "1");
    if (!r) return errorJson(404, "Adjunto no encontrado");
    return new NextResponse(new Uint8Array(r.datos), {
      headers: {
        "Content-Type": r.mime,
        "Content-Length": String(r.datos.length),
        "Content-Disposition": `inline; filename="${nombreSeguro(r.meta.nombre)}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        // La vista previa se muestra dentro de la propia aplicación (iframe del mismo origen)
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "frame-ancestors 'self'",
      },
    });
  }
  const idCliente = leerIdQuery(req, "idCliente") ?? undefined;
  const idExpediente = leerIdQuery(req, "idExpediente") ?? undefined;
  return NextResponse.json({ success: true, data: await listarAdjuntos(db, { idCliente, idExpediente }) });
});

/** `HEAD ?id=N`: dice si el fichero sigue guardado (200 o 404) sin leerlo ni descifrarlo. */
export const HEAD = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const id = leerIdQuery(req);
  const hay = id ? await existeAdjunto(db, id) : false;
  return new NextResponse(null, { status: hay ? 200 : 404 });
});

/** Sube un fichero (cuerpo = el fichero tal cual). `?tipo=&nombre=&idCliente=&idExpediente=`. */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const q = new URL(req.url).searchParams;
  const tipo = (q.get("tipo") ?? "otro") as TipoAdjunto;
  if (!TIPOS_ADJUNTO.includes(tipo) || tipo === "foto_cliente") throw new HttpError(400, "Tipo de adjunto no válido");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES_ADJUNTO) throw new HttpError(413, "El fichero es demasiado grande (máximo 500 MB).");
  const datos = Buffer.from(await req.arrayBuffer());
  const adjunto = await guardarAdjunto(db, {
    datos,
    nombre: q.get("nombre") ?? "adjunto",
    tipo,
    idCliente: leerIdQuery(req, "idCliente"),
    idExpediente: leerIdQuery(req, "idExpediente"),
    creadoPor: u.idUsuario,
  });
  return NextResponse.json({ success: true, data: adjunto }, { status: 201 });
});

/** `?id=N` quita uno; con un cuerpo `{ ids: [...] }` quita varios en una sola petición (devuelve cuántos y cuáles no se han podido quitar). */
export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (id) {
    await eliminarAdjunto(db, u, id);
    return NextResponse.json({ success: true });
  }
  const ids = [...new Set(await leerIdsParaBorrar(req))];
  let borrados = 0;
  const fallos: string[] = [];
  for (const unico of ids) {
    try {
      await eliminarAdjunto(db, u, unico);
      borrados++;
    } catch (e) {
      fallos.push(e instanceof Error ? e.message : "Error desconocido");
    }
  }
  return NextResponse.json({ success: true, data: { borrados, fallos } });
});
