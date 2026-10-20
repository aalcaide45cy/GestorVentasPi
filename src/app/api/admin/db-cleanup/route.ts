import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { encolar, type ContextoTarea } from "@/lib/servicios/tareas";
import { analizarBbdd, esquemaLimpieza, limpiarBbdd } from "@/lib/servicios/mantenimiento";

export const dynamic = "force-dynamic";

/** Analiza registros huérfanos o anómalos. */
export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, ...(await analizarBbdd(db)) });
});

/**
 * Elimina los huérfanos indicados; antes se guarda una copia de seguridad «previa» completa (si falla, no se borra nada). Con `?asincrono=1`
 * se pone en la cola de segundo plano y devuelve `{ tarea }`.
 */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const entrada = await leerJson(req, esquemaLimpieza);
  const trabajo = async (ctx?: ContextoTarea) => {
    const borrados = await limpiarBbdd(db, entrada, admin.idUsuario, ctx);
    await auditar({ idUsuario: admin.idUsuario, accion: "bbdd_limpiada", entidad: "backup", detalle: { borrados } });
    return { borrados, message: `Limpieza completada: ${borrados} registro(s) eliminados.` };
  };
  if (new URL(req.url).searchParams.get("asincrono") === "1") {
    const tarea = encolar({ tipo: "limpieza", titulo: "Limpiar la base de datos", idUsuario: admin.idUsuario }, (ctx) => trabajo(ctx));
    return NextResponse.json({ success: true, tarea: tarea.id }, { status: 202 });
  }
  const r = await trabajo();
  return NextResponse.json({ success: true, message: r.message });
});
