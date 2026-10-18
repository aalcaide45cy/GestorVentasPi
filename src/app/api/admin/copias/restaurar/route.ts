import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaRestaurar, restaurarCopiaCompleta } from "@/lib/servicios/copias";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/** Restaura una copia completa (solo administrador; la confirmación se pide en pantalla). Cierra todas las sesiones. */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const entrada = await leerJson(req, esquemaRestaurar);
  const r = await restaurarCopiaCompleta(db, admin.idUsuario, entrada);
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_restaurada_completa", entidad: "copias_seguridad", entidadId: entrada.id, detalle: { previa: r.previa } });
  return NextResponse.json({ success: true, message: "Copia restaurada. Tendrás que volver a iniciar sesión.", data: r });
});
