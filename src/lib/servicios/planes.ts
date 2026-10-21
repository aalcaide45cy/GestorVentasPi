import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import {
  commissionBonusRules,
  commissionBrandInterventionRates,
  commissionFinanceRates,
  commissionLiquidationVersions,
  commissionLiquidations,
  commissionModelPoints,
  commissionPlanModelRates,
  commissionPlanPending,
  commissionPlanVendedores,
  commissionPlans,
  commissionPreferenceRules,
  commissionRules,
  commissionUsedRates,
  commissionVoPatterns,
  expedientes,
  promocionesPuntos,
} from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { recalcularAfectados } from "./liquidaciones";

/* ------------------------------------------------------------------ */
/* Esquemas (importes en céntimos, puntos en centésimas)               */
/* ------------------------------------------------------------------ */

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida");
const fechaNull = z.union([fecha, z.literal("").transform(() => null), z.null()]).default(null);
const entero = z.number().int();
/** Columna de comisiones a la que va el importe de una línea: «financiacion», «preference», «extra:Nombre» o vacío (la habitual). */
const conceptoDestino = z.string().trim().max(80).default("");
/** % propio de tasa de intervención con el que se compara la tasa real (vacío = el objetivo del plan). */
const umbralTasa = entero.min(0).max(100).nullable().default(null);
const idNull = z.number().int().positive().nullable().default(null);
const SUBTIPO = "[A-Za-z0-9 _-]{1,30}";
const aplicaA = z.string().regex(new RegExp(`^(VN|VO|TODOS|VO:${SUBTIPO})$`), "Ámbito no válido");
const tipoFin = z.enum(["CONTADO", "CREDITO", "PREFERENCE", "RENTING"]);

export const esquemaRegla = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre de la regla").max(200),
  evento: z.enum(["pedido", "afectacion", "matriculacion", "cobro", "credito", "preference", "manual"]),
  tipoVehiculo: z.string().regex(new RegExp(`^(nuevo|usado|cualquiera|usado:${SUBTIPO})$`), "Tipo de vehículo no válido").default("cualquiera"),
  fechaInicio: fechaNull,
  fechaFin: fechaNull,
  idMarca: idNull,
  idModelo: idNull,
  tasaIntervencion: z.enum(["cumplida", "no_cumplida", "indiferente"]).default("indiferente"),
  puntos: entero.default(0),
  importe: entero.default(0),
  esPenalizacion: z.boolean().default(false),
  ligarACredito: z.boolean().default(false),
  activa: z.boolean().default(true),
  /** Identificador estable de la regla; si falta (planes y plantillas antiguos) se crea uno. */
  clave: z.string().trim().min(1).max(60).default(() => randomUUID()),
});

export const esquemaPlanBase = z.object({
    nombre: z.string().trim().min(1, "Falta el nombre del plan").max(200),
    fechaInicio: fecha,
    fechaFin: fecha,
    estado: z.enum(["borrador", "activo", "cerrado"]).default("borrador"),
    tramoMin: z.number().int().min(-20).max(0).default(-4),
    tramoMax: z.number().int().min(0).max(20).default(3),
    puntosPorPedido: entero.min(0).default(0),
    voPuntosModo: z.enum(["cuentan", "no"]).default("cuentan"),
    voPuntos: entero.min(0).nullable().default(null),
    /** Objetivo de la tasa de intervención financiera global (todos los nuevos) y de usados; sin objetivo = siempre cumplida. */
    tasaGlobalTipo: z.enum(["porcentaje", "unidades"]).default("porcentaje"),
    tasaGlobalObjetivo: entero.min(0).nullable().default(null),
    tasaVoTipo: z.enum(["porcentaje", "unidades"]).default("porcentaje"),
    tasaVoObjetivo: entero.min(0).nullable().default(null),
    tasaIncluyeVo: z.boolean().default(true),
    penalizacionImporte: entero.min(0).default(0),
    penalizacionTitulo: z.string().max(200).nullable().default(null),
    penalizacionDescripcion: z.string().max(1000).nullable().default(null),
    notas: z.string().max(5000).nullable().default(null),
    vendedores: z.array(z.object({ idUsuario: z.number().int().positive(), objetivoBase: entero.min(0), arrastre: entero.default(0) })).default([]),
    /** Reglas que suben o bajan el objetivo X según los coches del mes (puntos en centésimas; negativos lo bajan). */
    reglasObjetivo: z
      .array(
        z.object({
          nombre: z.string().trim().max(200).default(""),
          activa: z.boolean().default(true),
          metrica: z.enum(["vo", "vn", "total"]).default("vo"),
          comparador: z.enum(["menos_de", "al_menos"]).default("menos_de"),
          cantidad: entero.min(0).max(999).default(1),
          puntos: entero.min(-100000).max(100000).default(0),
        }),
      )
      .default([]),
    promociones: z
      .array(
        z.object({
          id: z.number().int().positive().optional(),
          nombre: z.string().trim().min(1).max(200),
          puntosEspeciales: entero.min(0),
          minimoUnidades: entero.min(1),
          puntosSiNoCumple: entero.min(0).default(100),
        }),
      )
      .default([]),
    puntosModelo: z.array(z.object({ idModelo: z.number().int().positive(), puntos: entero.min(0) })).default([]),
    tasas: z
      .array(z.object({ idMarca: z.number().int().positive(), tipoTasa: z.enum(["porcentaje", "unidades"]).default("porcentaje"), objetivo: entero.min(0).default(70), puntosDefecto: entero.min(0).default(100) }))
      .default([]),
    tarifasVN: z
      .array(
        z.object({
          idModelo: z.number().int().positive(),
          tasaCumplida: z.boolean(),
          importes: z.record(z.string().regex(/^-?\d+$/), entero),
          activo: z.boolean().default(true),
          orden: entero.default(0),
        }),
      )
      .default([]),
    usados: z.array(z.object({ subtipo: z.string().trim().min(1).max(30), importePrimera: entero.min(0), importeResto: entero.min(0), minAplicar: entero.min(0).default(0), activo: z.boolean().default(true) })).default([]),
    patrones: z
      .array(z.object({ nombre: z.string().trim().min(1).max(200), aplicaAVn: z.boolean().default(false), rotativo: z.boolean().default(false), activo: z.boolean().default(true), tiers: z.array(z.object({ unidad: z.number().int().positive(), importe: entero.min(0) })).default([]) }))
      .default([]),
    financiacion: z.array(z.object({ idMarca: z.number().int().positive(), tipoFinanciacion: tipoFin, aplicaA: aplicaA.default("VN"), importe: entero, tasaIntervencion: z.enum(["indiferente", "cumplida", "no_cumplida"]).default("indiferente"), tasaAmbito: z.enum(["marca", "global", "vo"]).default("marca"), concepto: conceptoDestino, tasaUmbral: umbralTasa })).default([]),
    preference: z
      .array(z.object({ nombre: z.string().max(200).nullable().default(null), idMarca: idNull, idModelo: idNull, tipoFinanciacion: tipoFin.nullable().default(null), aplicaA: aplicaA.default("VN"), importe: entero, activa: z.boolean().default(true), tasaIntervencion: z.enum(["indiferente", "cumplida", "no_cumplida"]).default("indiferente"), tasaAmbito: z.enum(["marca", "global", "vo"]).default("marca"), concepto: conceptoDestino, tasaUmbral: umbralTasa }))
      .default([]),
    reglas: z.array(esquemaRegla).default([]),
    bonus: z.array(esquemaRegla).default([]),
    pendientes: z.array(z.object({ concepto: z.string().trim().min(1).max(300), importe: entero, mesOrigen: z.string().regex(/^\d{4}-\d{2}$/).nullable().default(null) })).default([]),
});

export const esquemaPlan = esquemaPlanBase
  .refine((p) => p.fechaInicio <= p.fechaFin, { message: "La fecha de inicio no puede ser posterior a la de fin", path: ["fechaFin"] })
  .refine((p) => new Set(p.vendedores.map((v) => v.idUsuario)).size === p.vendedores.length, { message: "Hay vendedores repetidos en el objetivo", path: ["vendedores"] });

export type PlanEntrada = z.input<typeof esquemaPlan>;
export type PlanEditable = z.infer<typeof esquemaPlan> & { idPlan: number };

export interface ResumenPlan {
  idPlan: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  vendedores: number;
  liquidaciones: number;
  /** Otros planes cuyo rango se solapa con este. */
  solapadoCon: { idPlan: number; nombre: string }[];
}

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

export async function listarPlanes(ej: Ejecutor): Promise<ResumenPlan[]> {
  const planes = await ej.select().from(commissionPlans).orderBy(desc(commissionPlans.fechaInicio), desc(commissionPlans.idPlan));
  const vend = await ej.select({ idPlan: commissionPlanVendedores.idPlan, n: sql<number>`count(*)::int` }).from(commissionPlanVendedores).groupBy(commissionPlanVendedores.idPlan);
  const liqs = await ej.select({ idPlan: commissionLiquidations.idPlan, n: sql<number>`count(*)::int` }).from(commissionLiquidations).groupBy(commissionLiquidations.idPlan);
  return planes.map((p) => ({
    idPlan: p.idPlan,
    nombre: p.nombre,
    fechaInicio: p.fechaInicio,
    fechaFin: p.fechaFin,
    estado: p.estado,
    vendedores: vend.find((v) => v.idPlan === p.idPlan)?.n ?? 0,
    liquidaciones: liqs.find((v) => v.idPlan === p.idPlan)?.n ?? 0,
    solapadoCon: planes.filter((o) => o.idPlan !== p.idPlan && o.fechaInicio <= p.fechaFin && o.fechaFin >= p.fechaInicio).map((o) => ({ idPlan: o.idPlan, nombre: o.nombre })),
  }));
}

const condTasa = (v: string): "indiferente" | "cumplida" | "no_cumplida" => (v === "cumplida" || v === "no_cumplida" ? v : "indiferente");
const ambTasa = (v: string): "marca" | "global" | "vo" => (v === "global" || v === "vo" ? v : "marca");

export async function leerPlan(ej: Ejecutor, idPlan: number): Promise<PlanEditable | null> {
  const [p] = await ej.select().from(commissionPlans).where(eq(commissionPlans.idPlan, idPlan));
  if (!p) return null;
  const [vend, promos, pm, tasas, tarifas, usados, patrones, fin, pref, reglas, bonus, pend] = await Promise.all([
    ej.select().from(commissionPlanVendedores).where(eq(commissionPlanVendedores.idPlan, idPlan)).orderBy(asc(commissionPlanVendedores.id)),
    ej.select().from(promocionesPuntos).where(eq(promocionesPuntos.idPlan, idPlan)).orderBy(asc(promocionesPuntos.id)),
    ej.select().from(commissionModelPoints).where(eq(commissionModelPoints.idPlan, idPlan)),
    ej.select().from(commissionBrandInterventionRates).where(eq(commissionBrandInterventionRates.idPlan, idPlan)),
    ej.select().from(commissionPlanModelRates).where(eq(commissionPlanModelRates.idPlan, idPlan)).orderBy(asc(commissionPlanModelRates.orden), asc(commissionPlanModelRates.idRate)),
    ej.select().from(commissionUsedRates).where(eq(commissionUsedRates.idPlan, idPlan)).orderBy(asc(commissionUsedRates.idUsedRate)),
    ej.select().from(commissionVoPatterns).where(eq(commissionVoPatterns.idPlan, idPlan)).orderBy(asc(commissionVoPatterns.idVoPattern)),
    ej.select().from(commissionFinanceRates).where(eq(commissionFinanceRates.idPlan, idPlan)).orderBy(asc(commissionFinanceRates.idFinanceRate)),
    ej.select().from(commissionPreferenceRules).where(eq(commissionPreferenceRules.idPlan, idPlan)).orderBy(asc(commissionPreferenceRules.idPrefRule)),
    ej.select().from(commissionRules).where(eq(commissionRules.idPlan, idPlan)).orderBy(asc(commissionRules.idRule)),
    ej.select().from(commissionBonusRules).where(eq(commissionBonusRules.idPlan, idPlan)).orderBy(asc(commissionBonusRules.idBonusRule)),
    ej.select().from(commissionPlanPending).where(eq(commissionPlanPending.idPlan, idPlan)).orderBy(asc(commissionPlanPending.id)),
  ]);
  const regla = (r: (typeof reglas)[number] | (typeof bonus)[number]) => ({
    nombre: r.nombre,
    evento: r.evento as "pedido",
    tipoVehiculo: r.tipoVehiculo,
    fechaInicio: r.fechaInicio,
    fechaFin: r.fechaFin,
    idMarca: r.idMarca,
    idModelo: r.idModelo,
    tasaIntervencion: r.tasaIntervencion as "indiferente",
    puntos: r.puntos,
    importe: r.importe,
    esPenalizacion: r.esPenalizacion,
    ligarACredito: r.ligarACredito,
    activa: r.activa,
    clave: r.clave,
  });
  return {
    idPlan: p.idPlan,
    nombre: p.nombre,
    fechaInicio: p.fechaInicio,
    fechaFin: p.fechaFin,
    estado: p.estado as "borrador",
    tramoMin: p.tramoMin,
    tramoMax: p.tramoMax,
    puntosPorPedido: p.puntosPorPedido,
    voPuntosModo: p.voPuntosModo === "no" ? "no" : "cuentan",
    voPuntos: p.voPuntos,
    tasaGlobalTipo: p.tasaGlobalTipo === "unidades" ? "unidades" : "porcentaje",
    tasaGlobalObjetivo: p.tasaGlobalObjetivo,
    tasaVoTipo: p.tasaVoTipo === "unidades" ? "unidades" : "porcentaje",
    tasaVoObjetivo: p.tasaVoObjetivo,
    tasaIncluyeVo: p.tasaIncluyeVo,
    penalizacionImporte: p.penalizacionImporte,
    penalizacionTitulo: p.penalizacionTitulo,
    penalizacionDescripcion: p.penalizacionDescripcion,
    notas: p.notas,
    vendedores: vend.map((v) => ({ idUsuario: v.idUsuario, objetivoBase: v.objetivoBase, arrastre: v.arrastre })),
    reglasObjetivo: p.reglasObjetivo,
    promociones: promos.map((x) => ({ id: x.id, nombre: x.nombre, puntosEspeciales: x.puntosEspeciales, minimoUnidades: x.minimoUnidades, puntosSiNoCumple: x.puntosSiNoCumple })),
    puntosModelo: pm.map((x) => ({ idModelo: x.idModelo, puntos: x.puntos })),
    tasas: tasas.map((x) => ({ idMarca: x.idMarca, tipoTasa: x.tipoTasa as "porcentaje", objetivo: x.objetivo, puntosDefecto: x.puntosDefecto })),
    tarifasVN: tarifas.map((x) => ({ idModelo: x.idModelo, tasaCumplida: x.tasaCumplida, importes: x.importes, activo: x.activo, orden: x.orden })),
    usados: usados.map((x) => ({ subtipo: x.subtipo, importePrimera: x.importePrimera, importeResto: x.importeResto, minAplicar: x.minAplicar, activo: x.activo })),
    patrones: patrones.map((x) => ({ nombre: x.nombre, aplicaAVn: x.aplicaAVn, rotativo: x.rotativo, activo: x.activo, tiers: x.tiers })),
    financiacion: fin.map((x) => ({ idMarca: x.idMarca, tipoFinanciacion: x.tipoFinanciacion as "CREDITO", aplicaA: x.aplicaA || "VN", importe: x.importe, tasaIntervencion: condTasa(x.tasaIntervencion), tasaAmbito: ambTasa(x.tasaAmbito), concepto: x.concepto, tasaUmbral: x.tasaUmbral })),
    preference: pref.map((x) => ({ nombre: x.nombre, idMarca: x.idMarca, idModelo: x.idModelo, tipoFinanciacion: x.tipoFinanciacion as "PREFERENCE" | null, aplicaA: x.aplicaA || "VN", importe: x.importe, activa: x.activa, tasaIntervencion: condTasa(x.tasaIntervencion), tasaAmbito: ambTasa(x.tasaAmbito), concepto: x.concepto, tasaUmbral: x.tasaUmbral })),
    reglas: reglas.map(regla),
    bonus: bonus.map(regla),
    pendientes: pend.map((x) => ({ concepto: x.concepto, importe: x.importe, mesOrigen: x.mesOrigen })),
  };
}

/* ------------------------------------------------------------------ */
/* Escritura                                                           */
/* ------------------------------------------------------------------ */

function mesesDelRango(inicio: string, fin: string): string[] {
  const res: string[] = [];
  let [a, m] = inicio.slice(0, 7).split("-").map(Number);
  const [af, mf] = fin.slice(0, 7).split("-").map(Number);
  while (a < af || (a === af && m <= mf)) {
    res.push(`${a}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return res;
}

async function escribirHijos(tx: Ejecutor, idPlan: number, p: z.infer<typeof esquemaPlan>): Promise<void> {
  // Promociones: se conservan los ids existentes (los expedientes las referencian)
  const actuales = await tx.select({ id: promocionesPuntos.id }).from(promocionesPuntos).where(eq(promocionesPuntos.idPlan, idPlan));
  const idsEntrantes = new Set(p.promociones.flatMap((x) => (x.id ? [x.id] : [])));
  for (const x of p.promociones) {
    if (x.id && actuales.some((a) => a.id === x.id)) {
      await tx.update(promocionesPuntos).set({ nombre: x.nombre, puntosEspeciales: x.puntosEspeciales, minimoUnidades: x.minimoUnidades, puntosSiNoCumple: x.puntosSiNoCumple }).where(eq(promocionesPuntos.id, x.id));
    } else {
      await tx.insert(promocionesPuntos).values({ idPlan, nombre: x.nombre, puntosEspeciales: x.puntosEspeciales, minimoUnidades: x.minimoUnidades, puntosSiNoCumple: x.puntosSiNoCumple });
    }
  }
  const sobran = actuales.filter((a) => !idsEntrantes.has(a.id)).map((a) => a.id);
  if (sobran.length) await tx.delete(promocionesPuntos).where(inArray(promocionesPuntos.id, sobran));

  await tx.delete(commissionPlanVendedores).where(eq(commissionPlanVendedores.idPlan, idPlan));
  await tx.delete(commissionModelPoints).where(eq(commissionModelPoints.idPlan, idPlan));
  await tx.delete(commissionBrandInterventionRates).where(eq(commissionBrandInterventionRates.idPlan, idPlan));
  await tx.delete(commissionPlanModelRates).where(eq(commissionPlanModelRates.idPlan, idPlan));
  await tx.delete(commissionUsedRates).where(eq(commissionUsedRates.idPlan, idPlan));
  await tx.delete(commissionVoPatterns).where(eq(commissionVoPatterns.idPlan, idPlan));
  await tx.delete(commissionFinanceRates).where(eq(commissionFinanceRates.idPlan, idPlan));
  await tx.delete(commissionPreferenceRules).where(eq(commissionPreferenceRules.idPlan, idPlan));
  await tx.delete(commissionRules).where(eq(commissionRules.idPlan, idPlan));
  await tx.delete(commissionBonusRules).where(eq(commissionBonusRules.idPlan, idPlan));
  await tx.delete(commissionPlanPending).where(eq(commissionPlanPending.idPlan, idPlan));

  if (p.vendedores.length) await tx.insert(commissionPlanVendedores).values(p.vendedores.map((v) => ({ idPlan, ...v })));
  if (p.puntosModelo.length) await tx.insert(commissionModelPoints).values(p.puntosModelo.map((v) => ({ idPlan, ...v })));
  if (p.tasas.length) await tx.insert(commissionBrandInterventionRates).values(p.tasas.map((v) => ({ idPlan, ...v })));
  if (p.tarifasVN.length) await tx.insert(commissionPlanModelRates).values(p.tarifasVN.map((v) => ({ idPlan, ...v })));
  if (p.usados.length) await tx.insert(commissionUsedRates).values(p.usados.map((v) => ({ idPlan, ...v })));
  if (p.patrones.length) await tx.insert(commissionVoPatterns).values(p.patrones.map((v) => ({ idPlan, ...v })));
  if (p.financiacion.length) await tx.insert(commissionFinanceRates).values(p.financiacion.map((v) => ({ idPlan, ...v })));
  if (p.preference.length) await tx.insert(commissionPreferenceRules).values(p.preference.map((v) => ({ idPlan, ...v })));
  if (p.reglas.length) await tx.insert(commissionRules).values(p.reglas.map((v) => ({ idPlan, ...v })));
  if (p.bonus.length) await tx.insert(commissionBonusRules).values(p.bonus.map((v) => ({ idPlan, ...v })));
  if (p.pendientes.length) await tx.insert(commissionPlanPending).values(p.pendientes.map((v) => ({ idPlan, ...v })));
}

export interface ResultadoGuardarPlan {
  plan: PlanEditable;
  /** Meses cerrados/revisados cuyo importe ha cambiado al recalcular. */
  impactos: { idVendedor: number; mes: string; netoAnterior: number; netoNuevo: number; diferencia: number }[];
}

/** Crea (sin `idPlan`) o reemplaza un plan completo y recalcula sus liquidaciones existentes. */
export async function guardarPlan(ej: Ejecutor, idPlan: number | null, entrada: unknown): Promise<ResultadoGuardarPlan> {
  const p = esquemaPlan.parse(entrada);
  const id = await ej.transaction(async (tx) => {
    let id = idPlan;
    const base = {
      nombre: p.nombre,
      fechaInicio: p.fechaInicio,
      fechaFin: p.fechaFin,
      estado: p.estado,
      tramoMin: p.tramoMin,
      tramoMax: p.tramoMax,
      puntosPorPedido: p.puntosPorPedido,
      voPuntosModo: p.voPuntosModo,
      voPuntos: p.voPuntos,
      tasaGlobalTipo: p.tasaGlobalTipo,
      tasaGlobalObjetivo: p.tasaGlobalObjetivo,
      tasaVoTipo: p.tasaVoTipo,
      tasaVoObjetivo: p.tasaVoObjetivo,
      tasaIncluyeVo: p.tasaIncluyeVo,
      penalizacionImporte: p.penalizacionImporte,
      penalizacionTitulo: p.penalizacionTitulo,
      penalizacionDescripcion: p.penalizacionDescripcion,
      notas: p.notas,
      reglasObjetivo: p.reglasObjetivo,
    };
    if (id === null) {
      id = (await tx.insert(commissionPlans).values(base).returning({ id: commissionPlans.idPlan }))[0].id;
    } else {
      const filas = await tx.update(commissionPlans).set(base).where(eq(commissionPlans.idPlan, id)).returning({ id: commissionPlans.idPlan });
      if (filas.length === 0) throw new HttpError(404, "Plan no encontrado");
    }
    try {
      await escribirHijos(tx, id, p);
    } catch (e) {
      if (e instanceof Error && /violates foreign key/.test(`${e.message} ${(e as { cause?: Error }).cause?.message ?? ""}`)) {
        throw new HttpError(409, "No se puede quitar una promoción que tienen asignada expedientes");
      }
      throw e;
    }
    return id;
  });

  // Recalcula las liquidaciones ya existentes del plan (12.9): nuevas tarifas, reglas u objetivos.
  const existentes = await ej
    .select({ idUsuario: commissionLiquidations.idUsuario, mes: commissionLiquidations.mes })
    .from(commissionLiquidations)
    .where(eq(commissionLiquidations.idPlan, id));
  const mesesPlan = new Set(mesesDelRango(p.fechaInicio, p.fechaFin));
  const afectados = existentes.filter((x) => mesesPlan.has(x.mes)).map((x) => ({ idVendedor: x.idUsuario, mes: x.mes }));
  const resumenes = afectados.length ? await ej.transaction((tx) => recalcularAfectados(tx, afectados, "Cambio en el plan de comisionamiento")) : [];
  const plan = (await leerPlan(ej, id)) as PlanEditable;
  return {
    plan,
    impactos: resumenes
      .filter((r) => r.versionGuardada && r.netoAnterior !== null)
      .map((r) => ({ idVendedor: r.idVendedor, mes: r.mes, netoAnterior: r.netoAnterior as number, netoNuevo: r.netoNuevo, diferencia: r.netoNuevo - (r.netoAnterior as number) })),
  };
}

/**
 * Elimina un plan. Con `conLiquidaciones` se llevan por delante las liquidaciones calculadas con él (se pueden volver a generar
 * con otro plan) y se desasignan las promociones de puntos de sus expedientes; sin él, el plan con liquidaciones no se borra.
 */
export async function eliminarPlan(ej: Ejecutor, idPlan: number, conLiquidaciones = false): Promise<void> {
  const [{ n }] = await ej.select({ n: sql<number>`count(*)::int` }).from(commissionLiquidations).where(eq(commissionLiquidations.idPlan, idPlan));
  if (n > 0 && !conLiquidaciones) throw new HttpError(409, `Este plan tiene ${n} liquidación(es) calculada(s). Si lo eliminas se borran con él (se pueden volver a generar con otro plan). Confirma el borrado para continuar.`);
  try {
    await ej.transaction(async (tx) => {
      if (conLiquidaciones) {
        await tx.execute(sql`select set_config('app.borrado_autorizado', 'on', true)`);
        const liqs = (await tx.select({ id: commissionLiquidations.idLiquidation }).from(commissionLiquidations).where(eq(commissionLiquidations.idPlan, idPlan))).map((l) => l.id);
        if (liqs.length > 0) {
          await tx.delete(commissionLiquidationVersions).where(inArray(commissionLiquidationVersions.idLiquidation, liqs));
          await tx.delete(commissionLiquidations).where(inArray(commissionLiquidations.idLiquidation, liqs));
        }
        const promos = (await tx.select({ id: promocionesPuntos.id }).from(promocionesPuntos).where(eq(promocionesPuntos.idPlan, idPlan))).map((p) => p.id);
        if (promos.length > 0) await tx.update(expedientes).set({ idPromocion: null }).where(inArray(expedientes.idPromocion, promos));
      }
      const filas = await tx.delete(commissionPlans).where(eq(commissionPlans.idPlan, idPlan)).returning({ id: commissionPlans.idPlan });
      if (filas.length === 0) throw new HttpError(404, "Plan no encontrado");
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(409, "No se puede eliminar el plan: tiene expedientes con promociones asignadas");
  }
}


/** Un bonus del plan con evento «Manual»: se puede elegir expediente por expediente. */
export interface BonusManual {
  clave: string;
  nombre: string;
  plan: string;
  idPlan: number;
  importe: number;
  puntos: number;
  esPenalizacion: boolean;
}

/** Bonus y penalizaciones «manuales» activos de los planes que no están cerrados, del plan más reciente al más antiguo. */
export async function listarBonusManuales(ej: Ejecutor): Promise<BonusManual[]> {
  const filas = await ej
    .select({ clave: commissionBonusRules.clave, nombre: commissionBonusRules.nombre, plan: commissionPlans.nombre, idPlan: commissionPlans.idPlan, importe: commissionBonusRules.importe, puntos: commissionBonusRules.puntos, esPenalizacion: commissionBonusRules.esPenalizacion })
    .from(commissionBonusRules)
    .innerJoin(commissionPlans, eq(commissionBonusRules.idPlan, commissionPlans.idPlan))
    .where(and(eq(commissionBonusRules.evento, "manual"), eq(commissionBonusRules.activa, true), ne(commissionPlans.estado, "cerrado")))
    .orderBy(desc(commissionPlans.fechaInicio), commissionBonusRules.nombre);
  return filas.filter((f) => f.clave !== "");
}
