import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { expedientes, expedientesNoSeCobra } from "@/db/schema";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";

/** «No se cobra»: coches que nunca van a venir en una rejilla (p. ej. ventas internas); dejan de salir como pendientes de cobro. */
export const esquemaNoSeCobra = z.object({
  idExpediente: z.number().int().positive(),
  /** true: marcar «no se cobra»; false: volver a contarlo como pendiente de cobro. */
  noSeCobra: z.boolean(),
  motivo: z.string().trim().max(300).nullish(),
});

export async function fijarNoSeCobra(ej: Ejecutor, u: UsuarioActual, entrada: z.infer<typeof esquemaNoSeCobra>): Promise<void> {
  const [e] = await ej.select({ idUsuario: expedientes.idUsuario }).from(expedientes).where(and(eq(expedientes.idExpediente, entrada.idExpediente), isNull(expedientes.eliminadoEn)));
  if (!e) throw new HttpError(404, "Expediente no encontrado");
  if (!esAdministrador(u.rol) && e.idUsuario !== u.idUsuario) throw new HttpError(403, "Solo el administrador o el vendedor del expediente pueden cambiar si se cobra");
  if (entrada.noSeCobra) {
    await ej
      .insert(expedientesNoSeCobra)
      .values({ idExpediente: entrada.idExpediente, motivo: entrada.motivo || null, creadoPor: u.idUsuario })
      .onConflictDoUpdate({ target: expedientesNoSeCobra.idExpediente, set: { motivo: entrada.motivo || null, creadoPor: u.idUsuario, creadoEn: new Date() } });
  } else {
    await ej.delete(expedientesNoSeCobra).where(eq(expedientesNoSeCobra.idExpediente, entrada.idExpediente));
  }
}
