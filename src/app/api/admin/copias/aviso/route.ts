import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { avisoEspacioCopias } from "@/lib/servicios/copias";

export const dynamic = "force-dynamic";

/** ¿Hay demasiadas copias (o pesan demasiado)? Alimenta el punto rojo de «Configuración». */
export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: await avisoEspacioCopias(db) });
});
