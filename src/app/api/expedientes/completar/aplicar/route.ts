import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { HttpError } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { crearCopia } from "@/lib/servicios/copias";
import { aplicarCompletado, esquemaAplicarCompletado } from "@/lib/servicios/completar-datos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Aplica los cambios elegidos de un listado. Queda en el log de importaciones y se puede deshacer. */
export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaAplicarCompletado);
  // Un relleno grande (por ejemplo la facturación de muchos usados con la «Fra. prevista» del Excel) mueve comisiones: antes se guarda una copia de seguridad
  let copiaPrevia: string | null = null;
  if (entrada.cambios.length >= 20) {
    try {
      copiaPrevia = (await crearCopia(db, "previa", usuario.idUsuario, `Antes de completar ${entrada.cambios.length} expedientes desde «${entrada.archivo}». Restáurala si algo no era lo que esperabas.`)).nombre;
    } catch (e) {
      throw new HttpError(500, `No se ha aplicado nada: no se pudo crear la copia de seguridad previa (${e instanceof Error ? e.message : "error desconocido"}).`);
    }
  }
  const r = { ...(await aplicarCompletado(db, usuario, entrada)), copiaPrevia };
  await auditar({ idUsuario: usuario.idUsuario, accion: "completar_datos", entidad: "expedientes", detalle: { archivo: entrada.archivo, expedientes: r.expedientesCambiados, campos: r.camposCambiados } });
  return NextResponse.json({ success: true, data: r });
});
