import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { usuarioObjetivo } from "@/lib/servicios/alcance-comisiones";
import { datosCotejo } from "@/lib/servicios/cotejo";

export const dynamic = "force-dynamic";

/** Expedientes del vendedor y rejillas guardadas, para cotejar los pagos. Solo lectura. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await datosCotejo(db, usuarioObjetivo(u, req)) });
});
