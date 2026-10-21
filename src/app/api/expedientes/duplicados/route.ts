import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { detectarDuplicados } from "@/lib/servicios/duplicados";

export const dynamic = "force-dynamic";

/** Grupos de expedientes que parecen duplicados (mismo bastidor, misma matrícula, mismo cliente+modelo…). Solo lee: no cambia nada. */
export const GET = manejar(async () => {
  await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await detectarDuplicados(db) });
});
