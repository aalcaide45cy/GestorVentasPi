import { NextResponse } from "next/server";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { reiniciarRendimiento } from "@/lib/rendimiento";

export const dynamic = "force-dynamic";

/**
 * «Contar desde ahora» (solo administrador): borra el historial de mediciones, las peticiones y consultas lentas anotadas y pone a cero los contadores de PostgreSQL
 * (acierto de caché…). No toca ningún dato de la aplicación.
 */
export const POST = manejar(async () => {
  const u = await requireSession("administrador");
  const r = await reiniciarRendimiento();
  await auditar({ idUsuario: u.idUsuario, accion: "rendimiento_reiniciado", entidad: "ajustes", entidadId: "rendimiento", detalle: r });
  return NextResponse.json({ success: true, data: r }, { headers: { "Cache-Control": "no-store" } });
});
