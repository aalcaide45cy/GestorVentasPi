import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { asegurarCopiaReciente } from "@/lib/servicios/copias";
import { crearCopiaInterna } from "@/lib/servicios/copias-seccion";
import { SECCIONES, importarSeccion, type Seccion } from "@/lib/servicios/intercambio";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const esquema = z.object({
  paquete: z.unknown(),
  modo: z.enum(["anadir", "actualizar", "sustituir"]),
  /** false = solo vista previa (no cambia nada). */
  aplicar: z.boolean().default(false),
  seccion: z.enum(SECCIONES).optional(),
  /** Opciones de la importación (por ejemplo, crear las marcas y modelos que faltan al importar planes). */
  opciones: z.object({ crearCatalogo: z.boolean().default(false) }).default({ crearCatalogo: false }),
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
      const c = await asegurarCopiaReciente(db, admin.idUsuario, e.modo === "anadir" ? 15 : 0, "Antes de importar datos desde un archivo (sección «Datos»).");
      copia = { nombre: c.nombre, creadaAhora: c.creadaAhora };
      // Además, una copia interna de la sección tal como está ahora, para poder volver atrás solo con esta parte
      const seccion = (e.paquete as { seccion?: string } | null)?.seccion;
      if (seccion && (SECCIONES as readonly string[]).includes(seccion)) await crearCopiaInterna(db, seccion as Seccion, admin.idUsuario, "Estado anterior a una importación", "automatica");
    } catch (err) {
      throw new HttpError(409, `No se ha importado nada porque no se pudo hacer la copia de seguridad previa. ${err instanceof Error ? err.message : ""}`.trim());
    }
  }
  const informe = await importarSeccion(db, admin.idUsuario, e.paquete, e.modo, e.aplicar, e.seccion, e.opciones);
  if (e.aplicar) {
    await auditar({ idUsuario: admin.idUsuario, accion: "datos_importados", entidad: informe.seccion, detalle: { modo: e.modo, nuevos: informe.nuevos, actualizados: informe.actualizados, eliminados: informe.eliminados, omitidos: informe.omitidos } });
  }
  return NextResponse.json({ success: true, informe, copia });
});

