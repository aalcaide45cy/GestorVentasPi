import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJsonCrudo, manejar } from "@/lib/http";
import { esquemaGuardarPreferencias, guardarPreferencias, leerPreferencias } from "@/lib/servicios/preferencias";

export const dynamic = "force-dynamic";

/** Las preferencias de pantalla del usuario de la sesión (las mismas en cualquier equipo). */
export const GET = manejar(async () => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: { valores: await leerPreferencias(db, u.idUsuario) } });
});

/** Guarda una o varias preferencias del usuario de la sesión: `{ valores: { clave: "valor" } }`. Las claves no permitidas se ignoran. */
export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const { valores } = esquemaGuardarPreferencias.parse(await leerJsonCrudo(req));
  const guardadas = await guardarPreferencias(db, u.idUsuario, valores);
  return NextResponse.json({ success: true, data: { guardadas } });
});
