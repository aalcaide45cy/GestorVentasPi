import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaTiendaPredeterminada, establecerTiendaPredeterminada } from "@/lib/servicios/usuarios";

export const dynamic = "force-dynamic";

export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession();
  const { id_tienda } = await leerJson(req, esquemaTiendaPredeterminada);
  await establecerTiendaPredeterminada(db, usuario.idUsuario, id_tienda ?? null);
  return NextResponse.json({ success: true, message: "Tienda predeterminada actualizada correctamente" });
});
