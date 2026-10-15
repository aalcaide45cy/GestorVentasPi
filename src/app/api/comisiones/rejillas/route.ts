import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { mesDeQuery, usuarioObjetivo } from "@/lib/servicios/alcance-comisiones";
import { comprobarRejilla, eliminarRejilla, esquemaGuardarRejilla, guardarRejilla } from "@/lib/servicios/rejillas";

export const dynamic = "force-dynamic";

/** Cruce de la rejilla de un vendedor y mes con su liquidación. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await comprobarRejilla(db, usuarioObjetivo(u, req), mesDeQuery(req)) });
});

/** Guarda (sustituyendo la anterior) la rejilla ya revisada y devuelve el cruce. */
export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const idUsuario = usuarioObjetivo(u, req);
  const entrada = await leerJson(req, esquemaGuardarRejilla);
  await guardarRejilla(db, idUsuario, u.idUsuario, entrada);
  return NextResponse.json({ success: true, data: await comprobarRejilla(db, idUsuario, entrada.mes) });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  await eliminarRejilla(db, usuarioObjetivo(u, req), mesDeQuery(req));
  return NextResponse.json({ success: true });
});
