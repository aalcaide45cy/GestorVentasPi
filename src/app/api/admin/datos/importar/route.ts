import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { asegurarCopiaReciente } from "@/lib/servicios/copias";
import { SECCIONES, importarSeccion } from "@/lib/servicios/intercambio";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const esquema = z.object({
  paquete: z.unknown(),
  modo: z.enum(["anadir", "actualizar", "sustituir"]),
  /** false = solo vista previa (no cambia nada). */
  aplicar: z.boolean().default(false),
  seccion: z.enum(SECCIONES).optional(),
  /** Para aplicar: «IMPORTAR», o «SUSTITUIR» si el modo es sustituir. */
  confirmacion: z.string().optional(),
});

/**
 * Importa una sección. Sin `aplicar` devuelve la vista previa exacta de lo que cambiaría. Al aplicar, antes se hace una copia de
 * seguridad del estado actual (siempre nueva si el modo es «sustituir») y se exige la confirmación escrita.
 */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const e = await leerJson(req, esquema);
  let copia: { nombre: string; creadaAhora: boolean } | null = null;
  if (e.aplicar) {
    const esperada = e.modo === "sustituir" ? "SUSTITUIR" : "IMPORTAR";
    if ((e.confirmacion ?? "").trim() !== esperada) throw new HttpError(400, `Escribe ${esperada} para confirmar.`);
    try {
      const c = await asegurarCopiaReciente(db, admin.idUsuario, e.modo === "anadir" ? 15 : 0);
      copia = { nombre: c.nombre, creadaAhora: c.creadaAhora };
    } catch (err) {
      throw new HttpError(409, `No se ha importado nada porque no se pudo hacer la copia de seguridad previa. ${err instanceof Error ? err.message : ""}`.trim());
    }
  }
  const informe = await importarSeccion(db, admin.idUsuario, e.paquete, e.modo, e.aplicar, e.seccion);
  if (e.aplicar) {
    await auditar({ idUsuario: admin.idUsuario, accion: "datos_importados", entidad: informe.seccion, detalle: { modo: e.modo, nuevos: informe.nuevos, actualizados: informe.actualizados, eliminados: informe.eliminados, omitidos: informe.omitidos } });
  }
  return NextResponse.json({ success: true, informe, copia });
});

