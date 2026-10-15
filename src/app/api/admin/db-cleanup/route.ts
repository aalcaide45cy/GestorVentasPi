import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { analizarBbdd, esquemaLimpieza, limpiarBbdd } from "@/lib/servicios/mantenimiento";

export const dynamic = "force-dynamic";

/** Analiza registros huérfanos o anómalos. */
export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, ...(await analizarBbdd(db)) });
});

/** Elimina los huérfanos indicados (la interfaz descarga antes una copia JSON). */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const entrada = await leerJson(req, esquemaLimpieza);
  const borrados = await limpiarBbdd(db, entrada);
  await auditar({ idUsuario: admin.idUsuario, accion: "bbdd_limpiada", entidad: "backup", detalle: { borrados } });
  return NextResponse.json({ success: true, message: `Limpieza completada: ${borrados} registro(s) eliminados.` });
});
