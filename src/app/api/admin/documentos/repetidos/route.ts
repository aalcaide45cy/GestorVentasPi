import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { crearCopia } from "@/lib/servicios/copias";
import { archivosRepetidos } from "@/lib/servicios/contenidos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Documentos repetidos (solo administrador): `{ accion: "ver" }` cuenta cuántos hay y cuánto espacio se liberaría; `{ accion: "quitar" }` hace antes una copia de seguridad y deja cada archivo
 * repetido guardado una sola vez. No cambia ni un byte de los archivos y deja fuera las rejillas.
 */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const { accion } = await leerJson(req, z.object({ accion: z.enum(["ver", "quitar"]) }));
  if (accion === "quitar") {
    // Como en las demás limpiezas: antes, una copia de seguridad completa; si no se puede hacer, no se toca nada
    try {
      await crearCopia(db, "previa", u.idUsuario, "Antes de quitar los documentos repetidos. Restáurala si algo no era lo que esperabas.");
    } catch (e) {
      throw new HttpError(500, `No se ha tocado nada: no se pudo crear la copia de seguridad previa (${e instanceof Error ? e.message : "error desconocido"}).`);
    }
  }
  const r = await archivosRepetidos(db, accion === "quitar");
  if (accion === "quitar") await auditar({ idUsuario: u.idUsuario, accion: "documentos_repetidos", entidad: "adjuntos", entidadId: "repetidos", detalle: { grupos: r.grupos, copias: r.copiasSobrantes, bytes: r.bytesLiberados } });
  return NextResponse.json({ success: true, data: r }, { headers: { "Cache-Control": "no-store" } });
});
