import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { buscarCoincidencias, esquemaCoincidencias } from "@/lib/servicios/clientes";

export const dynamic = "force-dynamic";

/** Clientes que podrían ser el mismo que un pedido o documento (por DNI/NIE y por nombre). */
export const POST = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaCoincidencias);
  return NextResponse.json({ success: true, data: await buscarCoincidencias(db, entrada) });
});
