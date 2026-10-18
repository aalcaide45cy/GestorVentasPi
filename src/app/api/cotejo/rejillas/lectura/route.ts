import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { usuarioObjetivo } from "@/lib/servicios/alcance-comisiones";
import { esquemaResolverLectura, resolverLectura } from "@/lib/servicios/cotejo";

export const dynamic = "force-dynamic";

/** Corrige o confirma una lectura dudosa de una rejilla guardada. */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaResolverLectura);
  const n = await resolverLectura(db, usuarioObjetivo(u, req), entrada);
  return NextResponse.json({ success: true, filas: n });
});
