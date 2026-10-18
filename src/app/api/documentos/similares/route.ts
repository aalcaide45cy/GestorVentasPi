import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { buscarExpedientesSimilares } from "@/lib/servicios/documentos";
import type { DatosPedido } from "@/lib/documentos/pedido";

export const dynamic = "force-dynamic";

const texto = z.string().max(300).nullish();
const esquema = z.object({
  vin: texto,
  matricula: texto,
  dni: texto,
  cliente: texto,
  fechaExpediente: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  idModelo: z.number().int().positive().nullish(),
});

/**
 * Expedientes que ya existen y parecen ser el de este pedido. Se consulta justo antes de crear un expediente desde un pedido
 * (otro pedido de la cola puede haberlo creado hace un momento), para no duplicarlo.
 */
export const POST = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const e = await leerJson(req, esquema);
  const datos = { vin: e.vin ?? null, matricula: e.matricula ?? null, dni: e.dni ?? null, cliente: e.cliente ?? null, fechaExpediente: e.fechaExpediente ?? null, idModelo: e.idModelo ?? null } as DatosPedido;
  return NextResponse.json({ success: true, data: await buscarExpedientesSimilares(db, datos) });
});
