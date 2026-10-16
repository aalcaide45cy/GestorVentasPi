import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { MAX_BYTES_ADJUNTO } from "@/lib/servicios/adjuntos";
import { leerDni, leerPedido } from "@/lib/servicios/documentos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Lee un documento con OCR local y devuelve los datos para rellenar la ficha (no guarda ninguna ficha).
 * `?tipo=dni|pedido&nombre=…`, cuerpo = el fichero tal cual. El fichero queda como adjunto pendiente de vincular.
 */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const q = new URL(req.url).searchParams;
  const tipo = q.get("tipo");
  if (tipo !== "dni" && tipo !== "pedido") throw new HttpError(400, "Tipo de documento no válido");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES_ADJUNTO) throw new HttpError(413, "El fichero es demasiado grande (máximo 15 MB).");
  const datos = Buffer.from(await req.arrayBuffer());
  const nombre = q.get("nombre") ?? "documento";
  const resultado = tipo === "dni" ? await leerDni(db, u.idUsuario, nombre, datos) : await leerPedido(db, u.idUsuario, nombre, datos, q.get("duplicados") === "permitir");
  return NextResponse.json({ success: true, data: resultado });
});
