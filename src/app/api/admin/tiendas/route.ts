import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { actualizarTienda, crearTienda, eliminarTienda, esquemaTienda } from "@/lib/servicios/catalogos";

export const dynamic = "force-dynamic";

export const POST = manejar(async (req: Request) => {
  await requireSession("administrador");
  const data = await crearTienda(db, await leerJson(req, esquemaTienda));
  return NextResponse.json({ success: true, data }, { status: 201 });
});

export const PUT = manejar(async (req: Request) => {
  await requireSession("administrador");
  const data = await actualizarTienda(db, await leerJson(req, esquemaTienda));
  return NextResponse.json({ success: true, data });
});

export const DELETE = manejar(async (req: Request) => {
  await requireSession("administrador");
  const { id_tienda } = await leerJson(req, z.object({ id_tienda: z.coerce.number().int().positive("Falta id_tienda") }));
  await eliminarTienda(db, id_tienda);
  return NextResponse.json({ success: true, message: "Tienda eliminada correctamente" });
});
