import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { mesDeQuery, usuarioObjetivo } from "@/lib/servicios/alcance-comisiones";
import { corregirRejillaCotejo, esquemaCorregirRejilla, esquemaGuardarRejillaCotejo, guardarRejillaCotejo } from "@/lib/servicios/cotejo";
import { eliminarRejilla } from "@/lib/servicios/rejillas";

export const dynamic = "force-dynamic";

/** Guarda la rejilla de un mes (sustituye la anterior de ese mes). */
export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaGuardarRejillaCotejo);
  const id = await guardarRejillaCotejo(db, usuarioObjetivo(u, req), u.idUsuario, entrada);
  return NextResponse.json({ success: true, id });
});

/** Corrige a mano las matrículas de la rejilla guardada de un mes (añade las que faltan y quita las que sobran; el resto no se toca). */
export const PATCH = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaCorregirRejilla);
  const r = await corregirRejillaCotejo(db, usuarioObjetivo(u, req), entrada);
  return NextResponse.json({ success: true, data: r });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  await eliminarRejilla(db, usuarioObjetivo(u, req), mesDeQuery(req));
  return NextResponse.json({ success: true });
});
