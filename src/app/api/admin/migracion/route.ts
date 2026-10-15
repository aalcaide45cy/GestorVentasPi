import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { analizarCopiaV1, convertirCopiaV1, esquemaCopiaV1, SECCIONES_V1 } from "@/lib/servicios/migracion-v1";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const esquema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("analizar"), copia: esquemaCopiaV1 }),
  z.object({ accion: z.literal("convertir"), copia: esquemaCopiaV1, confirmacion: z.string(), secciones: z.array(z.enum(SECCIONES_V1)).min(1).optional() }),
]);

/** Migración desde la copia JSON (v1.0) de la app antigua: análisis previo y conversión repetible (solo administrador). */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const entrada = await leerJson(req, esquema);
  if (entrada.accion === "analizar") {
    const actuales = (await db.select({ id: usuarios.idUsuario, nombre: usuarios.nombre }).from(usuarios)).map((u) => ({ id: u.id, nombre: u.nombre }));
    return NextResponse.json({ success: true, data: analizarCopiaV1(entrada.copia, { actuales, idAdmin: admin.idUsuario }) });
  }
  const r = await convertirCopiaV1(db, admin.idUsuario, { copia: entrada.copia, confirmacion: entrada.confirmacion, secciones: entrada.secciones });
  await auditar({ idUsuario: admin.idUsuario, accion: "migracion_v1", entidad: "migracion", detalle: { expedientes: r.expedientes, planes: r.planes, liquidaciones: r.liquidaciones } });
  return NextResponse.json({ success: true, data: r });
});
