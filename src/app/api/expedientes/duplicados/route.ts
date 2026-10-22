import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { detectarDuplicados } from "@/lib/servicios/duplicados";

export const dynamic = "force-dynamic";

/** Grupos de expedientes que parecen duplicados (mismo bastidor, misma matrícula, mismo cliente+modelo…). Solo lee: no cambia nada. */
export const GET = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  // `?anulados=1`: también los anulados en el listado de la intranet (por defecto se dejan fuera)
  const incluirAnulados = new URL(req.url).searchParams.get("anulados") === "1";
  return NextResponse.json({ success: true, data: await detectarDuplicados(db, { incluirAnulados, incluirDeshabilitados: new URL(req.url).searchParams.get("deshabilitados") === "1" }) });
});
