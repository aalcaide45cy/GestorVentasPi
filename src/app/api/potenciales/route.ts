import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import {
  cambiarPotencial,
  eliminarPotencial,
  leerPotencial,
  listarPotenciales,
  resumenPotenciales,
  type EstadoPotencial,
} from "@/lib/servicios/potenciales";

export const dynamic = "force-dynamic";

const idDe = (req: Request): number => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0)
    throw new HttpError(400, "Falta el cliente potencial");
  return id;
};

/** `?id=`: una ficha. Sin id: la lista (`?estado=activo|baja|compro|posible&q=`) y el resumen por estado. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const p = new URL(req.url).searchParams;
  if (p.get("id"))
    return NextResponse.json({
      success: true,
      data: await leerPotencial(db, u, idDe(req)),
    });
  const estado = p.get("estado");
  const e = ["activo", "baja", "compro", "posible"].includes(estado ?? "")
    ? (estado as EstadoPotencial)
    : undefined;
  return NextResponse.json({
    success: true,
    data: {
      lista: await listarPotenciales(db, u, {
        estado: e,
        q: p.get("q") ?? undefined,
      }),
      resumen: await resumenPotenciales(db, u),
    },
  });
});

const esquemaCambio = z.object({
  nombre: z.string().max(255).optional(),
  email: z.string().max(255).optional(),
  telefono: z.string().max(30).optional(),
  notas: z.string().max(5000).optional(),
  accion: z
    .enum(["baja", "reactivar", "no_es_comprador", "si_es_comprador"])
    .optional(),
});
export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({
    success: true,
    data: await cambiarPotencial(
      db,
      u,
      idDe(req),
      await leerJson(req, esquemaCambio),
    ),
  });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  await eliminarPotencial(db, u, idDe(req));
  return NextResponse.json({ success: true, data: null });
});
