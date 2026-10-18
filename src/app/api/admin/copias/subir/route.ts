import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { origenValido } from "@/lib/origen";
import { enMantenimiento } from "@/lib/mantenimiento";
import { LIMITE_SUBIDA_BYTES, guardarSubida } from "@/lib/servicios/copias";
import { errorJson, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/** Recibe un `.dump` como cuerpo crudo (cabecera `x-nombre-fichero`), máx. 256 GB, y lo registra como copia. */
export const POST = manejar(async (req: Request) => {
  // Esta ruta no pasa por el proxy (recibe el fichero en flujo): comprueba aquí el origen y el modo mantenimiento
  if (!origenValido(req)) return errorJson(403, "Origen no permitido");
  if (enMantenimiento()) return errorJson(503, "Restauración en curso. Inténtalo en unos minutos.");
  const admin = await requireSession("administrador");
  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > LIMITE_SUBIDA_BYTES) return errorJson(413, "El fichero supera el límite de 256 GB");
  const nombre = decodeURIComponent(req.headers.get("x-nombre-fichero") ?? "");
  const copia = await guardarSubida(db, req.body, nombre, admin.idUsuario);
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_subida", entidad: "copias_seguridad", entidadId: copia.id });
  return NextResponse.json({ success: true, data: copia }, { status: 201 });
});
