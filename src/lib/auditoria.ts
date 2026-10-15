import { db } from "@/db";
import { auditoria } from "@/db/schema";
import { ipCliente } from "@/lib/auth/sesion";

/** Anota una acción sensible en la tabla `auditoria`. Nunca incluir contraseñas ni tokens en `detalle`. */
export async function auditar(entrada: {
  idUsuario?: number | null;
  accion: string;
  entidad?: string;
  entidadId?: string | number;
  detalle?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditoria).values({
      idUsuario: entrada.idUsuario ?? null,
      accion: entrada.accion,
      entidad: entrada.entidad ?? null,
      entidadId: entrada.entidadId === undefined ? null : String(entrada.entidadId),
      detalle: entrada.detalle ?? null,
      ip: await ipCliente(),
    });
  } catch (e) {
    console.error("No se pudo registrar la auditoría:", e instanceof Error ? e.message : e);
  }
}
