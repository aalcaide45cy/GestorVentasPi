import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { alertas, expedientes, expedientesNoSeCobra, rejillaFilas, rejillas, validacionesComision } from "@/db/schema";
import { esAnulado } from "@/lib/anulados";
import { cotejarPagos, mesesEsperados, type CocheCotejo, type PagoRejilla } from "@/lib/cotejo-pagos";
import { nombreMes } from "@/lib/formato";
import type { ExpedienteDto } from "@/lib/dto";
import { normalizarMatricula } from "@/lib/rejilla/analizar";
import { HttpError } from "@/lib/auth/sesion";
import { aDto, relacionesExpediente } from "./expedientes";
import { guardarRejilla } from "./rejillas";

const mesRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export const esquemaGuardarRejillaCotejo = z.object({
  mes: z.string().regex(mesRegex, "Mes no válido (AAAA-MM)"),
  nombreArchivo: z.string().trim().max(255).nullish(),
  origen: z.enum(["pdf", "imagen"]).default("pdf"),
  matriculas: z.array(z.string().trim().min(1).max(20)).min(1, "La rejilla no tiene ninguna matrícula").max(500),
});
export type EntradaGuardarRejillaCotejo = z.infer<typeof esquemaGuardarRejillaCotejo>;

export const esquemaResolverLectura = z.object({
  mes: z.string().regex(mesRegex, "Mes no válido (AAAA-MM)"),
  /** «corregir»: la hoja decía otra cosa y la lectura se cambia; «confirmar»: la lectura es correcta tal cual. */
  accion: z.enum(["corregir", "confirmar"]),
  /** Matrícula leída (la que hay en la rejilla guardada). */
  de: z.string().trim().min(1).max(20),
  /** Matrícula correcta (solo al corregir). */
  a: z.string().trim().min(1).max(20).optional(),
});

/**
 * Resuelve una lectura dudosa de una rejilla ya guardada: se corrige la matrícula (aunque la rejilla esté confirmada) o se
 * confirma que está bien leída. En ambos casos la fila queda marcada como revisada (confianza 100).
 */
export async function resolverLectura(ej: Ejecutor, idUsuario: number, entrada: z.infer<typeof esquemaResolverLectura>): Promise<number> {
  const [h] = await ej.select({ id: rejillas.id }).from(rejillas).where(and(eq(rejillas.idUsuario, idUsuario), eq(rejillas.mes, entrada.mes)));
  if (!h) throw new HttpError(404, "No hay rejilla guardada de ese mes");
  const filas = (await ej.select({ id: rejillaFilas.id, matricula: rejillaFilas.matricula }).from(rejillaFilas).where(eq(rejillaFilas.idRejilla, h.id))).filter((f) => normalizarMatricula(f.matricula) === normalizarMatricula(entrada.de));
  if (filas.length === 0) throw new HttpError(404, "Esa matrícula no está en la rejilla de ese mes");
  if (entrada.accion === "corregir") {
    if (!entrada.a) throw new HttpError(400, "Falta la matrícula correcta");
    await ej.update(rejillaFilas).set({ matricula: entrada.a.toUpperCase(), confianza: 100 }).where(inArray(rejillaFilas.id, filas.map((f) => f.id)));
  } else {
    await ej.update(rejillaFilas).set({ confianza: 100 }).where(inArray(rejillaFilas.id, filas.map((f) => f.id)));
  }
  return filas.length;
}

export interface RejillaGuardada {
  id: number;
  mes: string;
  nombreArchivo: string | null;
  creadaEn: string;
  filas: number;
}

export interface DatosCotejo {
  coches: CocheCotejo[];
  pagos: PagoRejilla[];
  rejillas: RejillaGuardada[];
}

/** Un expediente como «coche» a cotejar con las rejillas. */
export function aCocheCotejo(e: ExpedienteDto): CocheCotejo {
  return {
    origen: "app",
    id_expediente: e.id_expediente,
    cliente: e.cliente?.nombre ?? "",
    tipo_pago: e.tipoDeVenta?.nombre_tipo_venta ?? "",
    marca: e.modelo?.marca?.nombre ?? "",
    modelo: e.modelo?.nombre_modelo ?? "",
    matricula: e.matricula ?? "",
    f_expediente: e.fecha_expediente,
    f_afectacion: e.fecha_afectacion,
    f_matriculacion: e.fecha_matriculacion,
    f_entrega: e.fecha_entrega,
    // Si se importó el listado de la intranet, su estado (Anulado, Archivado…) permite revisar a mano lo que no se paga
    estado: e.estado_intranet ?? e.estadoVehiculo?.nombre_estado_vehiculo ?? "",
    usado: e.estadoVehiculo?.clase === "VO",
    deshabilitado: e.deshabilitado,
    f_facturacion: e.fecha_facturacion,
    cobrado_otra_fecha: e.cobrado_otra_fecha,
    f_cobro: e.fecha_cobrado,
  };
}

/** Expedientes del vendedor como «coches» a cotejar, y todas sus rejillas guardadas. Solo lee. */
export async function datosCotejo(ej: Ejecutor, idUsuario: number): Promise<DatosCotejo> {
  const filas = await ej.query.expedientes.findMany({
    where: and(eq(expedientes.idUsuario, idUsuario), isNull(expedientes.eliminadoEn)),
    with: relacionesExpediente,
  });
  const noSeCobra = new Map((await ej.select({ id: expedientesNoSeCobra.idExpediente, motivo: expedientesNoSeCobra.motivo }).from(expedientesNoSeCobra)).map((x) => [x.id, x.motivo]));
  const manuales = await ej.select({ id: validacionesComision.idExpediente, estado: validacionesComision.estado }).from(validacionesComision).where(eq(validacionesComision.idUsuario, idUsuario));
  const coches: CocheCotejo[] = filas.map(aDto).map(aCocheCotejo).map((c) => {
    const id = c.id_expediente;
    if (id === null) return c;
    const mias = manuales.filter((m) => m.id === id);
    return {
      ...c,
      ...(noSeCobra.has(id) ? { no_se_cobra: true, motivo_no_se_cobra: noSeCobra.get(id) ?? null } : {}),
      ...(mias.some((m) => m.estado === "pagado") ? { cobrado_manual: true } : {}),
      ...(mias.some((m) => m.estado === "reclamado") ? { reclamado_manual: true } : {}),
    };
  });

  const hojas = await ej.select().from(rejillas).where(eq(rejillas.idUsuario, idUsuario)).orderBy(desc(rejillas.mes));
  const pagos: PagoRejilla[] = [];
  const guardadas: RejillaGuardada[] = [];
  for (const h of hojas) {
    const f = await ej.select().from(rejillaFilas).where(eq(rejillaFilas.idRejilla, h.id));
    for (const x of f) pagos.push({ mes: h.mes, matricula: x.matricula, importe: x.importe, confirmada: (x.confianza ?? 0) >= 100 });
    guardadas.push({ id: h.id, mes: h.mes, nombreArchivo: h.nombreArchivo, creadaEn: h.creadaEn.toISOString(), filas: f.length });
  }
  return { coches, pagos, rejillas: guardadas };
}

/** Guarda (sustituyendo la del mismo mes) las matrículas de una rejilla ya revisadas por el usuario. */
export async function guardarRejillaCotejo(ej: Ejecutor, idUsuario: number, creadaPor: number, entrada: EntradaGuardarRejillaCotejo): Promise<number> {
  const unicas = [...new Set(entrada.matriculas.map(normalizarMatricula).filter(Boolean))];
  const id = await guardarRejilla(ej, idUsuario, creadaPor, {
    mes: entrada.mes,
    origen: entrada.origen,
    nombreArchivo: entrada.nombreArchivo ?? null,
    filas: unicas.map((matricula) => ({ matricula, importe: null })),
  });
  await avisarCochesQueFaltan(ej, idUsuario, entrada.mes);
  return id;
}

const PREFIJO_AVISO = "💶 Cobros · rejilla de ";

/**
 * Al guardar la rejilla de un mes, mira qué coches debían venir en ella (por su fecha de facturación) y no están en ninguna rejilla guardada:
 * si faltan, deja un aviso en la campana (sustituye al anterior de ese mes); si ya no falta ninguno, retira el aviso.
 * Devuelve cuántos coches faltan.
 */
export async function avisarCochesQueFaltan(ej: Ejecutor, idUsuario: number, mes: string): Promise<number> {
  const datos = await datosCotejo(ej, idUsuario);
  const r = cotejarPagos(datos.coches.filter((c) => !c.deshabilitado && !esAnulado(c.estado)), datos.pagos);
  const faltan = r.filas.filter((f) => f.coche && f.estado === "no_pagado" && mesesEsperados(f.coche).includes(mes));
  const prefijo = `${PREFIJO_AVISO}${nombreMes(mes)}:`;
  await ej
    .update(alertas)
    .set({ estado: "resuelta", motivo: "automatica", resueltaEn: new Date(), pospuestaHasta: null })
    .where(and(eq(alertas.idUsuario, idUsuario), sql`${alertas.mensaje} like ${prefijo + "%"}`, sql`${alertas.estado} <> 'resuelta'`));
  if (faltan.length === 0) return 0;
  const lista = faltan.slice(0, 6).map((f) => `${f.matricula}${f.coche?.cliente ? ` (${f.coche.cliente})` : ""}`).join(", ");
  const mensaje = `${prefijo} faltan ${faltan.length} coche${faltan.length === 1 ? "" : "s"} que debían venir y no están en ninguna rejilla: ${lista}${faltan.length > 6 ? "…" : ""}. Míralos en Cotejo de pagos › Pendientes de cobro.`;
  await ej.insert(alertas).values({ idUsuario, mensaje });
  return faltan.length;
}

export const esquemaCorregirRejilla = z.object({
  mes: z.string().regex(mesRegex, "Mes no válido (AAAA-MM)"),
  /** La lista completa de matrículas tal como debe quedar. */
  matriculas: z.array(z.string().trim().min(1).max(20)).min(1, "La rejilla no puede quedarse sin matrículas: si sobra entera, quítala").max(500),
});

/**
 * Corrige a mano las matrículas de una rejilla YA guardada: quita las que sobran y añade las que faltan, dejando intactas las demás filas
 * (con su importe, cliente o concepto si venían de un Excel). Las añadidas quedan como revisadas (confianza 100). Devuelve cuántas se han
 * añadido y quitado.
 */
export async function corregirRejillaCotejo(ej: Ejecutor, idUsuario: number, entrada: z.infer<typeof esquemaCorregirRejilla>): Promise<{ anadidas: number; quitadas: number }> {
  return ej.transaction(async (tx) => {
    const [h] = await tx.select({ id: rejillas.id }).from(rejillas).where(and(eq(rejillas.idUsuario, idUsuario), eq(rejillas.mes, entrada.mes)));
    if (!h) throw new HttpError(404, "No hay rejilla guardada de ese mes");
    const quiere = new Set(entrada.matriculas.map(normalizarMatricula).filter(Boolean));
    if (quiere.size === 0) throw new HttpError(400, "La rejilla no puede quedarse sin matrículas");
    const filas = await tx.select({ id: rejillaFilas.id, matricula: rejillaFilas.matricula }).from(rejillaFilas).where(eq(rejillaFilas.idRejilla, h.id));
    const sobran = filas.filter((f) => !quiere.has(normalizarMatricula(f.matricula)));
    const tiene = new Set(filas.map((f) => normalizarMatricula(f.matricula)));
    const faltan = [...quiere].filter((m) => !tiene.has(m));
    if (sobran.length > 0) await tx.delete(rejillaFilas).where(inArray(rejillaFilas.id, sobran.map((f) => f.id)));
    if (faltan.length > 0) await tx.insert(rejillaFilas).values(faltan.map((matricula) => ({ idRejilla: h.id, matricula, importe: null, confianza: 100 })));
    return { anadidas: faltan.length, quitadas: sobran.length };
  });
}
