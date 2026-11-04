import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import {
  ESTADOS_CORREO,
  esquemaCambioCorreo,
  esquemaCorreo,
} from "@/lib/correo";
import {
  borrarCorreo,
  cambiarCorreo,
  cancelarCorreo,
  crearCorreo,
  enviarCorreo,
  listarCorreos,
  pausarCorreo,
  programarCorreos,
} from "@/lib/servicios/correo";

export const dynamic = "force-dynamic";

/** `?estados=borrador,programado&id_expediente=&id_cliente=`: mis correos. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const p = new URL(req.url).searchParams;
  const estados = (p.get("estados") ?? "")
    .split(",")
    .filter((x): x is (typeof ESTADOS_CORREO)[number] =>
      (ESTADOS_CORREO as readonly string[]).includes(x),
    );
  const num = (k: string) =>
    Number(p.get(k)) > 0 ? Number(p.get(k)) : undefined;
  return NextResponse.json({
    success: true,
    data: await listarCorreos(db, u, {
      estados: estados.length ? estados : undefined,
      idExpediente: num("id_expediente"),
      idCliente: num("id_cliente"),
    }),
  });
});

/** Crea un correo (borrador); con `id_plantilla` y `id_expediente` se rellena solo. */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({
    success: true,
    data: await crearCorreo(db, u, await leerJson(req, esquemaCorreo), {
      origen: "manual",
    }),
  });
});

export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0)
    throw new HttpError(400, "Falta el correo");
  return NextResponse.json({
    success: true,
    data: await cambiarCorreo(
      db,
      u,
      id,
      await leerJson(req, esquemaCambioCorreo),
    ),
  });
});

const esquemaAccion = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  accion: z.enum(["enviar", "programar", "pausar", "cancelar", "borrar"]),
});
/** Acciones sobre uno o varios correos: enviar ya, programar (uno tras otro), pausar, cancelar o quitar del histórico. */
export const PATCH = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const { ids, accion } = await leerJson(req, esquemaAccion);
  if (accion === "programar")
    return NextResponse.json({
      success: true,
      data: { hechos: await programarCorreos(db, u, ids) },
    });
  let hechos = 0;
  const fallos: string[] = [];
  for (const id of ids) {
    try {
      if (accion === "enviar") await enviarCorreo(db, u, id);
      else if (accion === "pausar") await pausarCorreo(db, u, id);
      else if (accion === "cancelar") await cancelarCorreo(db, u, id);
      else await borrarCorreo(db, u, id);
      hechos++;
    } catch (e) {
      fallos.push(e instanceof Error ? e.message : "Error");
    }
  }
  return NextResponse.json({ success: true, data: { hechos, fallos } });
});
