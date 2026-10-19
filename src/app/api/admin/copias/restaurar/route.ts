import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaRestaurar, iniciarRestauracion } from "@/lib/servicios/copias";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * Empieza a restaurar una copia completa (solo administrador; la confirmación se pide en pantalla) y responde enseguida: la restauración
 * sigue en segundo plano y su avance se pregunta en `/api/salud`. Al terminar se cierran todas las sesiones.
 */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const entrada = await leerJson(req, esquemaRestaurar);
  await iniciarRestauracion(db, admin.idUsuario, entrada);
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_restaurada_completa", entidad: "copias_seguridad", entidadId: entrada.id, detalle: { iniciada: true } });
  return NextResponse.json({ success: true, message: "Restauración iniciada." }, { status: 202 });
});
