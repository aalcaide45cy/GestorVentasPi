import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { errorJson, manejar } from "@/lib/http";
import { MAX_BYTES_BIBLIOTECA } from "@/lib/servicios/biblioteca";

export const dynamic = "force-dynamic";

/**
 * Vista previa de un PDF que todavía NO está en la biblioteca (el que se acaba de elegir en el equipo): el navegador no puede enseñar un PDF
 * propio dentro de la aplicación sin una dirección del servidor, así que se deja unos minutos en memoria (nunca en la base de datos ni en disco)
 * y se sirve con una dirección temporal que solo conoce quien la pidió.
 */
interface Previa {
  datos: Buffer;
  idUsuario: number;
  caduca: number;
}

const G = globalThis as unknown as { __previasBiblioteca?: Map<string, Previa> };
const previas = (): Map<string, Previa> => (G.__previasBiblioteca ??= new Map());
const MINUTOS = 10;
const MAX_PREVIAS = 12;

function limpiar(): void {
  const ahora = Date.now();
  for (const [id, p] of previas()) if (p.caduca < ahora) previas().delete(id);
  // Con demasiadas, se van las más antiguas
  while (previas().size > MAX_PREVIAS) previas().delete(previas().keys().next().value as string);
}

/** Deja un PDF en memoria y devuelve su dirección temporal (`{ id }`). */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES_BIBLIOTECA) throw new HttpError(413, "El archivo es demasiado grande para verlo (máximo 200 MB).");
  const datos = Buffer.from(await req.arrayBuffer());
  if (datos.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(415, "Solo se puede previsualizar así un PDF.");
  limpiar();
  const id = randomUUID();
  previas().set(id, { datos, idUsuario: u.idUsuario, caduca: Date.now() + MINUTOS * 60_000 });
  return NextResponse.json({ success: true, data: { id } });
});

/** `?id=` devuelve el PDF dejado antes (solo a quien lo dejó). */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  limpiar();
  const p = previas().get(new URL(req.url).searchParams.get("id") ?? "");
  if (!p || p.idUsuario !== u.idUsuario) return errorJson(404, "La vista previa ha caducado: vuelve a pulsar el ojo.");
  return new NextResponse(new Uint8Array(p.datos), {
    headers: { "Content-Type": "application/pdf", "Content-Length": String(p.datos.length), "Content-Disposition": 'inline; filename="previa.pdf"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});
