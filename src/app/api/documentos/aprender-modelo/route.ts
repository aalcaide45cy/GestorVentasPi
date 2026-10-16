import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { aprenderModelo, esquemaAprenderModelo } from "@/lib/servicios/documentos";

export const dynamic = "force-dynamic";

/** Guarda la corrección «este texto de pedido es este modelo» para reconocerlo solo la próxima vez. */
export const POST = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaAprenderModelo);
  return NextResponse.json({ success: true, data: await aprenderModelo(db, entrada) });
});
