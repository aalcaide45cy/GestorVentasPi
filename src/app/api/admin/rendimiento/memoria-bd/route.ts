import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { aplicarMemoriaBd, leerMemoriaBd } from "@/lib/servicios/memoria-bd";

export const dynamic = "force-dynamic";

/** Memoria actual de la base de datos frente a la recomendada para este equipo (según su RAM y su tipo). Solo administrador. */
export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: await leerMemoriaBd(db) }, { headers: { "Cache-Control": "no-store" } });
});

/** Aplica la memoria recomendada en la configuración de PostgreSQL, si el arranque no la fija. */
export const POST = manejar(async () => {
  const u = await requireSession("administrador");
  const r = await aplicarMemoriaBd(db);
  await auditar({ idUsuario: u.idUsuario, accion: "memoria_bd", entidad: "ajustes", entidadId: "postgresql", detalle: { cambiados: r.cambiados } });
  return NextResponse.json({ success: true, data: r });
});
