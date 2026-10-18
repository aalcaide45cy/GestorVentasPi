import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { aplicarCompletado, esquemaAplicarCompletado } from "@/lib/servicios/completar-datos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Aplica los cambios elegidos de un listado. Queda en el log de importaciones y se puede deshacer. */
export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaAplicarCompletado);
  const r = await aplicarCompletado(db, usuario, entrada);
  await auditar({ idUsuario: usuario.idUsuario, accion: "completar_datos", entidad: "expedientes", detalle: { archivo: entrada.archivo, expedientes: r.expedientesCambiados, campos: r.camposCambiados } });
  return NextResponse.json({ success: true, data: r });
});
