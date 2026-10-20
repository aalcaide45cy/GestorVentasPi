import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { releerPedido } from "@/lib/servicios/documentos";
import { MOTORES, type MotorOcr } from "@/lib/servicios/ocr-ajustes";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vuelve a leer un pedido ya guardado (`{idAdjunto}`) con el lector actual y devuelve los datos nuevos; no crea ningún documento. Con `motor`
 * se lee con ese motor de OCR solo esta vez.
 */
export const POST = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const e = await leerJson(req, z.object({ idAdjunto: z.number().int().positive(), duplicados: z.boolean().optional(), motor: z.enum(MOTORES as [MotorOcr, ...MotorOcr[]]).optional() }));
  return NextResponse.json({ success: true, data: await releerPedido(db, e.idAdjunto, e.duplicados === true, e.motor) });
});
