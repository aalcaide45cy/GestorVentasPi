import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { MAX_BYTES_ADJUNTO } from "@/lib/servicios/adjuntos";
import { esAdministrador } from "@/lib/auth/permisos";
import { accionLecturas, encolarLectura, esquemaAccionLecturas, esquemaDestinoLectura, listarLecturas, registroLecturas } from "@/lib/servicios/lecturas-pedidos";

export const dynamic = "force-dynamic";

/** Lista de pedidos subidos para leer (pendientes, en curso, leídos sin recoger, descartados y con error) y el resumen. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  // ?registro=1: el registro de lecturas de los últimos tres meses (el administrador ve las de todos)
  if (new URL(req.url).searchParams.get("registro") === "1") return NextResponse.json({ success: true, data: await registroLecturas(db, u.idUsuario, esAdministrador(u.rol)) });
  return NextResponse.json({ success: true, data: await listarLecturas(db, u.idUsuario) });
});

/**
 * Sube un pedido (cuerpo = el fichero) a la lista de lectura: se guarda al momento y los lectores en paralelo lo leen después.
 * `?nombre=…&duplicados=permitir&destino={json}`.
 */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const q = new URL(req.url).searchParams;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES_ADJUNTO) throw new HttpError(413, "El fichero es demasiado grande (máximo 15 MB).");
  let destino = null;
  const crudo = q.get("destino");
  if (crudo) {
    try {
      destino = esquemaDestinoLectura.parse(JSON.parse(crudo));
    } catch {
      throw new HttpError(400, "El destino de la lectura no es válido");
    }
  }
  const datos = Buffer.from(await req.arrayBuffer());
  const r = await encolarLectura(db, u.idUsuario, q.get("nombre") ?? "pedido", datos, destino, q.get("duplicados") === "permitir");
  return NextResponse.json({ success: true, data: r }, { status: 201 });
});

/** recoger | limpiar | reintentar | cancelar. */
export const PATCH = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const e = await leerJson(req, esquemaAccionLecturas);
  return NextResponse.json({ success: true, data: { afectadas: await accionLecturas(db, u.idUsuario, e) } });
});
