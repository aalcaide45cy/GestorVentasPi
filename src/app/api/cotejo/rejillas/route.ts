import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { mesDeQuery, usuarioObjetivo } from "@/lib/servicios/alcance-comisiones";
import { esquemaGuardarRejillaCotejo, guardarRejillaCotejo } from "@/lib/servicios/cotejo";
import { eliminarRejilla } from "@/lib/servicios/rejillas";

export const dynamic = "force-dynamic";

/** Guarda la rejilla de un mes (sustituye la anterior de ese mes). */
export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaGuardarRejillaCotejo);
  const id = await guardarRejillaCotejo(db, usuarioObjetivo(u, req), u.idUsuario, entrada);
  return NextResponse.json({ success: true, id });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  await eliminarRejilla(db, usuarioObjetivo(u, req), mesDeQuery(req));
  return NextResponse.json({ success: true });
});
