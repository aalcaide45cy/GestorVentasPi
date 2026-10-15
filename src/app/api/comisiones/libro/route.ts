import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { usuarioObjetivo, mesDeQuery } from "@/lib/servicios/alcance-comisiones";
import { leerLibro } from "@/lib/servicios/comisiones-gestion";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await leerLibro(db, usuarioObjetivo(u, req), mesDeQuery(req)) });
});
