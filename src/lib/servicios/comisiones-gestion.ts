import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import {
  commissionLiquidationLineItems,
  commissionLiquidationLines,
  commissionLiquidationVersions,
  commissionLiquidations,
  commissionPlanPending,
  commissionPlanVendedores,
  expedientes,
  libroPuntos,
  pendientesCobro,
  usuarios,
} from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { calcularVendedorMes, planDelMes, recalcularMes, type ResumenRecalculo, type SnapshotLiquidacion } from "./liquidaciones";

/* ------------------------------------------------------------------ */
/* Liquidaciones                                                       */
/* ------------------------------------------------------------------ */

export const esquemaLiquidar = z.object({
  idPlan: z.number().int().positive(),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes no válido (AAAA-MM)"),
  /** Un vendedor o, si falta, todos los del plan. */
  idVendedor: z.number().int().positive().optional(),
});

/** «Calcular / Recalcular liquidación»: guarda cabecera, líneas y conceptos en una transacción por vendedor. */
export async function liquidar(ej: Ejecutor, entrada: z.infer<typeof esquemaLiquidar>): Promise<ResumenRecalculo[]> {
  const plan = await planDelMes(ej, entrada.mes);
  if (!plan) throw new HttpError(409, `No hay plan para ${entrada.mes}`);
  if (plan.idPlan !== entrada.idPlan) throw new HttpError(409, `Para ${entrada.mes} se aplica otro plan («${plan.nombre ?? plan.idPlan}»)`);
  const vendedores = entrada.idVendedor
    ? [entrada.idVendedor]
    : (await ej.select({ id: commissionPlanVendedores.idUsuario }).from(commissionPlanVendedores).where(eq(commissionPlanVendedores.idPlan, entrada.idPlan))).map((v) => v.id);
  const res: ResumenRecalculo[] = [];
  for (const v of vendedores) res.push(await ej.transaction((tx) => recalcularMes(tx, v, entrada.mes, "Recálculo manual")));
  return res;
}

export const ESTADOS_LIQUIDACION = ["borrador", "calculada", "revisada", "cerrada"] as const;

/** Cambia el estado (calculada → revisada → cerrada). Cerrar es solo del administrador (lo comprueba la ruta). */
export async function cambiarEstadoLiquidacion(ej: Ejecutor, idLiquidation: number, estado: (typeof ESTADOS_LIQUIDACION)[number]): Promise<void> {
  await ej.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.recalculo', 'on', true)`);
    const filas = await tx.update(commissionLiquidations).set({ estado }).where(eq(commissionLiquidations.idLiquidation, idLiquidation)).returning({ id: commissionLiquidations.idLiquidation });
    if (filas.length === 0) throw new HttpError(404, "Liquidación no encontrada");
  });
}

export interface LiquidacionResumen {
  idLiquidation: number;
  idPlan: number;
  idUsuario: number;
  vendedor: string | null;
  mes: string;
  estado: string;
  version: number;
  objetivoX: number;
  puntosMes: number;
  tramo: number;
  bruto: number;
  penalizacion: number;
  neto: number;
  mesPago: string;
  origen: string;
  calculadaEn: string;
}

export async function listarLiquidaciones(ej: Ejecutor, filtro: { idPlan?: number; idUsuario?: number; mes?: string }): Promise<LiquidacionResumen[]> {
  const condiciones = [
    filtro.idPlan ? eq(commissionLiquidations.idPlan, filtro.idPlan) : undefined,
    filtro.idUsuario ? eq(commissionLiquidations.idUsuario, filtro.idUsuario) : undefined,
    filtro.mes ? eq(commissionLiquidations.mes, filtro.mes) : undefined,
  ].filter((c) => c !== undefined);
  const filas = await ej
    .select({ l: commissionLiquidations, vendedor: usuarios.nombre })
    .from(commissionLiquidations)
    .leftJoin(usuarios, eq(usuarios.idUsuario, commissionLiquidations.idUsuario))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(commissionLiquidations.mes), asc(usuarios.nombre));
  return filas.map(({ l, vendedor }) => ({
    idLiquidation: l.idLiquidation,
    idPlan: l.idPlan,
    idUsuario: l.idUsuario,
    vendedor,
    mes: l.mes,
    estado: l.estado,
    version: l.version,
    objetivoX: l.objetivoX,
    puntosMes: l.puntosMes,
    tramo: l.tramo,
    bruto: l.bruto,
    penalizacion: l.penalizacion,
    neto: l.neto,
    mesPago: l.mesPago,
    origen: l.origen,
    calculadaEn: l.calculadaEn.toISOString(),
  }));
}

export async function leerLiquidacion(ej: Ejecutor, idLiquidation: number) {
  const [l] = await ej.select().from(commissionLiquidations).where(eq(commissionLiquidations.idLiquidation, idLiquidation));
  if (!l) return null;
  const lineas = await ej.select().from(commissionLiquidationLines).where(eq(commissionLiquidationLines.idLiquidation, idLiquidation)).orderBy(asc(commissionLiquidationLines.idLine));
  const items = lineas.length
    ? await ej.select().from(commissionLiquidationLineItems).where(inArray(commissionLiquidationLineItems.idLine, lineas.map((x) => x.idLine))).orderBy(asc(commissionLiquidationLineItems.idLine), asc(commissionLiquidationLineItems.orden))
    : [];
  const versiones = await ej
    .select({ id: commissionLiquidationVersions.id, version: commissionLiquidationVersions.version, motivo: commissionLiquidationVersions.motivo, creadaEn: commissionLiquidationVersions.creadaEn, netoAnterior: commissionLiquidationVersions.netoAnterior, netoNuevo: commissionLiquidationVersions.netoNuevo })
    .from(commissionLiquidationVersions)
    .where(eq(commissionLiquidationVersions.idLiquidation, idLiquidation))
    .orderBy(desc(commissionLiquidationVersions.id));
  return {
    liquidacion: l,
    lineas: lineas.map((x) => ({ ...x, conceptos: items.filter((i) => i.idLine === x.idLine) })),
    versiones: versiones.map((v) => ({ ...v, creadaEn: v.creadaEn.toISOString(), diferencia: v.netoNuevo - v.netoAnterior })),
  };
}

export async function leerVersion(ej: Ejecutor, idVersion: number) {
  const [v] = await ej.select().from(commissionLiquidationVersions).where(eq(commissionLiquidationVersions.id, idVersion));
  return v ?? null;
}

/* ------------------------------------------------------------------ */
/* Libro de puntos                                                     */
/* ------------------------------------------------------------------ */

export async function leerLibro(ej: Ejecutor, idUsuario: number, mes: string) {
  const filas = await ej.select().from(libroPuntos).where(and(eq(libroPuntos.idUsuario, idUsuario), eq(libroPuntos.mes, mes))).orderBy(asc(libroPuntos.id));
  return filas.map((f) => ({ ...f, creadoEn: f.creadoEn.toISOString() }));
}

/* ------------------------------------------------------------------ */
/* Pendientes de cobro («lo que me deben»)                              */
/* ------------------------------------------------------------------ */

export const esquemaPendiente = z.object({
  concepto: z.string().trim().min(1, "Falta el concepto").max(300),
  importe: z.number().int(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  mesNominaPrevisto: z.string().regex(/^\d{4}-\d{2}$/).nullable().default(null),
  cobrado: z.boolean().default(false),
  fechaCobro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  notas: z.string().max(2000).nullable().default(null),
});

export async function listarPendientes(ej: Ejecutor, idUsuario: number, hoyMes: string) {
  const filas = await ej.select().from(pendientesCobro).where(eq(pendientesCobro.idUsuario, idUsuario)).orderBy(asc(pendientesCobro.mesNominaPrevisto), asc(pendientesCobro.id));
  return filas.map((f) => ({ ...f, atrasado: !f.cobrado && f.mesNominaPrevisto !== null && f.mesNominaPrevisto < hoyMes }));
}

export async function crearPendiente(ej: Ejecutor, idUsuario: number, entrada: unknown) {
  const d = esquemaPendiente.parse(entrada);
  const [x] = await ej.insert(pendientesCobro).values({ idUsuario, ...d }).returning();
  return x;
}

export async function actualizarPendiente(ej: Ejecutor, idUsuario: number, id: number, entrada: unknown) {
  const d = esquemaPendiente.parse(entrada);
  const [x] = await ej.update(pendientesCobro).set(d).where(and(eq(pendientesCobro.id, id), eq(pendientesCobro.idUsuario, idUsuario))).returning();
  if (!x) throw new HttpError(404, "Pendiente no encontrado");
  return x;
}

export async function eliminarPendiente(ej: Ejecutor, idUsuario: number, id: number): Promise<void> {
  const filas = await ej.delete(pendientesCobro).where(and(eq(pendientesCobro.id, id), eq(pendientesCobro.idUsuario, idUsuario))).returning({ id: pendientesCobro.id });
  if (filas.length === 0) throw new HttpError(404, "Pendiente no encontrado");
}

/* ------------------------------------------------------------------ */
/* Previsión de nómina (M+1)                                           */
/* ------------------------------------------------------------------ */

export interface PrevisionMes {
  mesPago: string;
  neto: number;
  pendientesPlan: number;
  pendienteCobro: number;
  total: number;
}

/**
 * Para cada mes de pago P: neto de la liquidación de P−1 + comisiones pendientes del plan
 * + pendiente de cobro previsto para P (no cobrado).
 */
export async function previsionNomina(ej: Ejecutor, idUsuario: number): Promise<PrevisionMes[]> {
  const liqs = await ej.select().from(commissionLiquidations).where(eq(commissionLiquidations.idUsuario, idUsuario));
  const pend = await ej.select().from(pendientesCobro).where(and(eq(pendientesCobro.idUsuario, idUsuario), eq(pendientesCobro.cobrado, false)));
  const pendPlan = await ej.select().from(commissionPlanPending);
  const planDeLiq = new Map(liqs.map((l) => [l.mesPago, l.idPlan]));
  const meses = new Set<string>([...liqs.map((l) => l.mesPago), ...pend.flatMap((p) => (p.mesNominaPrevisto ? [p.mesNominaPrevisto] : []))]);
  return [...meses].sort().map((mesPago) => {
    const neto = liqs.filter((l) => l.mesPago === mesPago).reduce((s, l) => s + l.neto, 0);
    const idPlan = planDeLiq.get(mesPago);
    const pendientesPlan = idPlan === undefined ? 0 : pendPlan.filter((p) => p.idPlan === idPlan).reduce((s, p) => s + p.importe, 0);
    const pendienteCobro = pend.filter((p) => p.mesNominaPrevisto === mesPago).reduce((s, p) => s + p.importe, 0);
    return { mesPago, neto, pendientesPlan, pendienteCobro, total: neto + pendientesPlan + pendienteCobro };
  });
}

/* ------------------------------------------------------------------ */
/* Cotejo de cobros                                                    */
/* ------------------------------------------------------------------ */

export const CONCEPTOS_COTEJO = ["coche", "usado", "financiacion", "preference", "bonus", "especiales"] as const;
export type ConceptoCotejo = (typeof CONCEPTOS_COTEJO)[number];

export interface FilaCotejo {
  idExpediente: number;
  importes: Record<ConceptoCotejo, number>;
  cobrado: Record<ConceptoCotejo, boolean>;
  total: number;
  cobradoTotal: number;
}

export interface Cotejo {
  filas: FilaCotejo[];
  validado: number;
  cobrado: number;
  pendiente: number;
  ratio: number;
}

const CONCEPTO_A_COTEJO: Record<string, ConceptoCotejo> = { coche_vn: "coche", vo: "usado", financiacion: "financiacion", preference: "preference", regla: "bonus", especial: "especiales" };

/** Cotejo de la liquidación de un vendedor y mes contra las casillas «cobrado» de sus expedientes. */
export async function cotejo(ej: Ejecutor, idUsuario: number, mes: string): Promise<Cotejo> {
  const [liq] = await ej.select().from(commissionLiquidations).where(and(eq(commissionLiquidations.idUsuario, idUsuario), eq(commissionLiquidations.mes, mes)));
  if (!liq) return { filas: [], validado: 0, cobrado: 0, pendiente: 0, ratio: 0 };
  const lineas = await ej.select().from(commissionLiquidationLines).where(eq(commissionLiquidationLines.idLiquidation, liq.idLiquidation));
  const items = lineas.length ? await ej.select().from(commissionLiquidationLineItems).where(inArray(commissionLiquidationLineItems.idLine, lineas.map((l) => l.idLine))) : [];
  const ids = lineas.flatMap((l) => (l.idExpediente ? [l.idExpediente] : []));
  const exps = ids.length ? await ej.select().from(expedientes).where(and(inArray(expedientes.idExpediente, ids), isNull(expedientes.eliminadoEn))) : [];
  const filas: FilaCotejo[] = [];
  for (const l of lineas) {
    const e = exps.find((x) => x.idExpediente === l.idExpediente);
    if (!e) continue;
    const importes = Object.fromEntries(CONCEPTOS_COTEJO.map((c) => [c, 0])) as Record<ConceptoCotejo, number>;
    for (const i of items.filter((x) => x.idLine === l.idLine)) {
      const c = CONCEPTO_A_COTEJO[i.concepto];
      if (c) importes[c] += i.importe;
    }
    const cobrado: Record<ConceptoCotejo, boolean> = {
      coche: e.comisionCocheCobrada,
      usado: e.comisionUsadoCobrada,
      financiacion: e.comisionFinanciacionCobrada,
      preference: e.comisionPreferenceCobrada,
      bonus: e.comisionBonusCobrada,
      especiales: e.conceptosEspeciales.length > 0 && e.conceptosEspeciales.every((c) => c.cobrado),
    };
    const total = CONCEPTOS_COTEJO.reduce((s, c) => s + importes[c], 0);
    if (total === 0 && CONCEPTOS_COTEJO.every((c) => importes[c] === 0)) continue;
    const cobradoTotal = CONCEPTOS_COTEJO.reduce((s, c) => s + (cobrado[c] ? importes[c] : 0), 0);
    filas.push({ idExpediente: e.idExpediente, importes, cobrado, total, cobradoTotal });
  }
  const validado = filas.reduce((s, f) => s + f.total, 0);
  const cobradoSum = filas.reduce((s, f) => s + f.cobradoTotal, 0);
  return { filas, validado, cobrado: cobradoSum, pendiente: validado - cobradoSum, ratio: validado === 0 ? 0 : Math.round((cobradoSum * 10000) / validado) / 100 };
}

export const esquemaMarcarCobro = z.object({
  idExpediente: z.number().int().positive(),
  concepto: z.enum(CONCEPTOS_COTEJO),
  cobrado: z.boolean(),
});

/** Marca o desmarca la casilla «cobrado» de un concepto de un expediente. */
export async function marcarCobro(ej: Ejecutor, entrada: z.infer<typeof esquemaMarcarCobro>): Promise<void> {
  const { idExpediente, concepto, cobrado } = entrada;
  const [e] = await ej.select().from(expedientes).where(and(eq(expedientes.idExpediente, idExpediente), isNull(expedientes.eliminadoEn)));
  if (!e) throw new HttpError(404, "Expediente no encontrado");
  const set: Partial<typeof expedientes.$inferInsert> = {};
  if (concepto === "coche") set.comisionCocheCobrada = cobrado;
  else if (concepto === "usado") set.comisionUsadoCobrada = cobrado;
  else if (concepto === "financiacion") set.comisionFinanciacionCobrada = cobrado;
  else if (concepto === "preference") set.comisionPreferenceCobrada = cobrado;
  else if (concepto === "bonus") set.comisionBonusCobrada = cobrado;
  else set.conceptosEspeciales = e.conceptosEspeciales.map((c) => ({ ...c, cobrado }));
  await ej.update(expedientes).set(set).where(eq(expedientes.idExpediente, idExpediente));
}


/* ------------------------------------------------------------------ */
/* Comparar con la liquidación antigua (12.14)                          */
/* ------------------------------------------------------------------ */

export interface FilaComparacion {
  idExpediente: number | null;
  puntosAntes: number;
  puntosAhora: number;
  importeAntes: number;
  importeAhora: number;
  diferencia: number;
}

export interface Comparacion {
  mes: string;
  idUsuario: number;
  totalAntes: number;
  totalAhora: number;
  puntosAntes: number;
  puntosAhora: number;
  tramoAntes: number;
  tramoAhora: number;
  filas: FilaComparacion[];
  /** Únicas razones por las que puede haber diferencias (12.14); cualquier otra es un fallo a investigar. */
  explicaciones: string[];
}

export const DIFERENCIAS_EXPLICABLES = [
  "Demo, KM0 y usado ahora son VO (antes «demo» contaba como VN).",
  "Un coche con 0 puntos ya no se convierte en 1.",
  "Un VO cuenta solo por la fecha de cobro.",
  "Ya no hay mínimo de matriculaciones (antes, si no se llegaba, todo el mes valía 0).",
  "Las promociones se agrupan por promoción (antes por número de cupo, con otra fecha).",
  "Financiación y bonus se pagan una sola vez, en el mes de su evento.",
];

/** Calcula un mes con el motor nuevo y lo pone junto a la liquidación antigua importada (o a su primera versión guardada). */
export async function compararConAntigua(ej: Ejecutor, idLiquidation: number): Promise<Comparacion> {
  const [liq] = await ej.select().from(commissionLiquidations).where(eq(commissionLiquidations.idLiquidation, idLiquidation));
  if (!liq) throw new HttpError(404, "Liquidación no encontrada");

  let antigua: SnapshotLiquidacion | null = null;
  if (liq.origen === "importada_antigua") {
    const d = await leerLiquidacion(ej, idLiquidation);
    antigua = d
      ? {
          idPlan: liq.idPlan, mes: liq.mes, objetivoX: liq.objetivoX, puntosMes: liq.puntosMes, tramo: liq.tramo, tasaIntervencion: [], avisos: [], bruto: liq.bruto, penalizacion: liq.penalizacion, neto: liq.neto, mesPago: liq.mesPago,
          lineas: d.lineas.map((l) => ({ idExpediente: l.idExpediente, clase: l.clase, mesComputo: l.mesComputo, cuenta: l.cuenta, unidades: l.unidades, puntos: l.puntos, importe: l.importe, conceptos: [] })),
        }
      : null;
  } else {
    const versiones = await ej.select().from(commissionLiquidationVersions).where(eq(commissionLiquidationVersions.idLiquidation, idLiquidation)).orderBy(asc(commissionLiquidationVersions.id));
    const v = versiones.find((x) => (x.snapshot as { origen?: string }).origen === "importada_antigua");
    if (v) antigua = v.snapshot as SnapshotLiquidacion;
  }
  if (!antigua) throw new HttpError(404, "Esta liquidación no procede de la aplicación antigua ni guarda su versión original");

  const nuevo = await calcularVendedorMes(ej, liq.idUsuario, liq.mes);
  const filas = new Map<number | null, FilaComparacion>();
  const fila = (id: number | null): FilaComparacion => {
    let f = filas.get(id);
    if (!f) filas.set(id, (f = { idExpediente: id, puntosAntes: 0, puntosAhora: 0, importeAntes: 0, importeAhora: 0, diferencia: 0 }));
    return f;
  };
  for (const l of antigua.lineas) {
    const f = fila(l.idExpediente);
    f.puntosAntes += l.puntos;
    f.importeAntes += l.importe;
  }
  for (const l of nuevo?.lineas ?? []) {
    const f = fila(l.idExpediente);
    f.puntosAhora += l.puntos;
    f.importeAhora += l.importe;
  }
  const lista = [...filas.values()].map((f) => ({ ...f, diferencia: f.importeAhora - f.importeAntes })).sort((a, b) => (a.idExpediente ?? 0) - (b.idExpediente ?? 0));
  return {
    mes: liq.mes,
    idUsuario: liq.idUsuario,
    totalAntes: antigua.neto,
    totalAhora: nuevo?.neto ?? 0,
    puntosAntes: antigua.puntosMes,
    puntosAhora: nuevo?.puntosMes ?? 0,
    tramoAntes: antigua.tramo,
    tramoAhora: nuevo?.tramo ?? 0,
    filas: lista,
    explicaciones: DIFERENCIAS_EXPLICABLES,
  };
}
