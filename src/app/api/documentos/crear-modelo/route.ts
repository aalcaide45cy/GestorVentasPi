import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { crearModeloDePedido, esquemaCrearModeloPedido } from "@/lib/servicios/documentos";

export const dynamic = "force-dynamic";

/** Crea la marca y el modelo de un pedido que no estaban en el catálogo (tras revisarlos el usuario). */
export const POST = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaCrearModeloPedido);
  return NextResponse.json({ success: true, data: await crearModeloDePedido(db, entrada) });
});
