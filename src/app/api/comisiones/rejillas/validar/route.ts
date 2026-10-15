import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { usuarioObjetivo } from "@/lib/servicios/alcance-comisiones";
import { comprobarRejilla, esquemaValidar, validarCoche } from "@/lib/servicios/rejillas";

export const dynamic = "force-dynamic";

/** Marca un coche como pagado, pendiente o reclamado y devuelve el cruce actualizado. */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const idUsuario = usuarioObjetivo(u, req);
  const entrada = await leerJson(req, esquemaValidar);
  await validarCoche(db, idUsuario, entrada);
  return NextResponse.json({ success: true, data: await comprobarRejilla(db, idUsuario, entrada.mes) });
});
