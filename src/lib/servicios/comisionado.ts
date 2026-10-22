import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { expedientes, rejillas, validacionesComision } from "@/db/schema";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import { sumarMeses } from "@/lib/formato";
import { comprobarRejilla } from "./rejillas";
import { archivarElementos } from "./papelera-elementos";

/**
 * «Comisionado» de un expediente: lo que dice el Cotejo de pagos (coche que cuadra con una hoja guardada o marcado a mano como
 * pagado o reclamado). Aquí se consulta y se cambia desde el propio expediente, con las mismas marcas manuales del Cotejo.
 */

export interface EstadoComisionado {
  /** Estado global: pagado gana sobre reclamado; si no hay ninguno, pendiente. */
  estado: "pagado" | "reclamado" | "pendiente";
  mes: string | null;
  /** Mes en el que cuenta este coche (por sus fechas), para proponerlo al marcar. */
  mesSugerido: string;
  /** Cómo se decide en cada mes con información: marca manual o lo que dice una hoja del Cotejo. */
  meses: { mes: string; estado: "pagado" | "reclamado" | "pendiente"; origen: "manual" | "cotejo"; nota: string | null }[];
}

export const esquemaComisionado = z.object({
  idExpediente: z.number().int().positive(),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes no válido (AAAA-MM)"),
  /** «automatico» quita la marca manual de ese mes y vuelve a lo que diga el Cotejo. */
  estado: z.enum(["pagado", "reclamado", "pendiente", "automatico"]),
  nota: z.string().trim().max(1000).nullish(),
});

async function cargar(ej: Ejecutor, idExpediente: number) {
  const [e] = await ej
    .select({ idUsuario: expedientes.idUsuario, mat: expedientes.fechaMatriculacion, fac: expedientes.fechaFacturacion, otra: expedientes.cobradoOtraFecha, cobro: expedientes.fechaCobrado })
    .from(expedientes)
    .where(and(eq(expedientes.idExpediente, idExpediente), isNull(expedientes.eliminadoEn)));
  if (!e) throw new HttpError(404, "Expediente no encontrado");
  return e;
}

function comprobarPermiso(u: UsuarioActual, idVendedor: number | null): void {
  if (!esAdministrador(u.rol) && idVendedor !== u.idUsuario) throw new HttpError(403, "Solo el administrador o el vendedor del expediente pueden cambiar si está comisionado");
}

export async function estadoComisionado(ej: Ejecutor, u: UsuarioActual, idExpediente: number): Promise<EstadoComisionado> {
  const e = await cargar(ej, idExpediente);
  comprobarPermiso(u, e.idUsuario);
  const base = (e.otra ? e.cobro : (e.fac ?? e.mat))?.slice(0, 7) ?? null;
  const hoy = new Date().toISOString().slice(0, 7);
  const mesSugerido = base ?? sumarMeses(hoy, -1);

  const meses = new Map<string, EstadoComisionado["meses"][number]>();
  if (e.idUsuario !== null) {
    const hojas = await ej.select({ mes: rejillas.mes }).from(rejillas).where(eq(rejillas.idUsuario, e.idUsuario));
    for (const h of hojas) {
      const r = await comprobarRejilla(ej, e.idUsuario, h.mes).catch(() => null);
      const f = r?.filas.find((x) => x.idExpediente === idExpediente);
      if (f) meses.set(h.mes, { mes: h.mes, estado: f.validacion, origen: f.validacionManual ? "manual" : "cotejo", nota: f.notaValidacion });
    }
  }
  const manuales = await ej.select().from(validacionesComision).where(eq(validacionesComision.idExpediente, idExpediente)).orderBy(desc(validacionesComision.mes));
  for (const v of manuales) meses.set(v.mes, { mes: v.mes, estado: v.estado as "pagado" | "reclamado" | "pendiente", origen: "manual", nota: v.nota });

  const lista = [...meses.values()].sort((a, b) => b.mes.localeCompare(a.mes));
  const pagado = lista.find((m) => m.estado === "pagado");
  const reclamado = lista.find((m) => m.estado === "reclamado");
  const dec = pagado ?? reclamado ?? null;
  return { estado: dec ? (dec.estado as "pagado" | "reclamado") : "pendiente", mes: dec?.mes ?? null, mesSugerido, meses: lista };
}

export async function fijarComisionado(ej: Ejecutor, u: UsuarioActual, entrada: z.infer<typeof esquemaComisionado>): Promise<EstadoComisionado> {
  const e = await cargar(ej, entrada.idExpediente);
  comprobarPermiso(u, e.idUsuario);
  if (e.idUsuario === null) throw new HttpError(400, "El expediente no tiene vendedor");
  if (entrada.estado === "automatico") {
    // Volver a «automático» quita la marca manual de pagado/reclamado: se guarda antes en la Papelera
    await archivarElementos(ej, "validacion", sql`t.id_expediente = ${entrada.idExpediente} and t.mes = ${entrada.mes}`, { etiqueta: `Marca de ${entrada.mes} del expediente #EXP-${String(entrada.idExpediente).padStart(4, "0")}`, detalle: "Vuelta a automático" });
    await ej.delete(validacionesComision).where(and(eq(validacionesComision.idExpediente, entrada.idExpediente), eq(validacionesComision.mes, entrada.mes)));
  } else {
    await ej
      .insert(validacionesComision)
      .values({ idUsuario: e.idUsuario, mes: entrada.mes, idExpediente: entrada.idExpediente, estado: entrada.estado, nota: entrada.nota ?? null })
      .onConflictDoUpdate({ target: [validacionesComision.idUsuario, validacionesComision.mes, validacionesComision.idExpediente], set: { estado: entrada.estado, nota: entrada.nota ?? null, actualizadoEn: new Date() } });
  }
  return estadoComisionado(ej, u, entrada.idExpediente);
}
