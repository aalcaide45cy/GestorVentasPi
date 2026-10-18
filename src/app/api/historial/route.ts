import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { leerHistorial } from "@/lib/servicios/historial";

export const dynamic = "force-dynamic";

/** Historial de cambios del usuario para deshacer y rehacer. */
export const GET = manejar(async () => {
  const u = await requireSession("sesion");
  return NextResponse.json({ success: true, data: await leerHistorial(db, u.idUsuario) });
});
