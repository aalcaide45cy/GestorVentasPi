import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import {
  cotejarPotenciales,
  listarPotenciales,
} from "@/lib/servicios/potenciales";

export const dynamic = "force-dynamic";

/** Vuelve a cotejar con los expedientes (solo lectura) los potenciales que ve esta persona. */
export const POST = manejar(async () => {
  const u = await requireSession("no_invitado");
  const ids = (await listarPotenciales(db, u)).map((p) => p.id);
  return NextResponse.json({
    success: true,
    data: await cotejarPotenciales(db, ids),
  });
});
