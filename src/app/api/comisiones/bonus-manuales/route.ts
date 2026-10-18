import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { listarBonusManuales } from "@/lib/servicios/planes";

export const dynamic = "force-dynamic";

/** Bonus del plan con evento «Manual», para elegirlos en cada expediente. */
export const GET = manejar(async () => {
  await requireSession("sesion");
  return NextResponse.json({ success: true, data: await listarBonusManuales(db) });
});
