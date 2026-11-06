import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaLote, prepararLote } from "@/lib/servicios/potenciales-envios";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Prepara un lote de correos a clientes potenciales: `modo` previsualizar (cuántos y un ejemplo), borradores (a la cola para revisar) o programar (salen solos con su pausa). */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({
    success: true,
    data: await prepararLote(db, u, await leerJson(req, esquemaLote)),
  });
});
