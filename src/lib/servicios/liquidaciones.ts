import { and, between, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { categoriaTipoVenta } from "./comun";
import {
  commissionBonusRules,
  commissionBrandInterventionRates,
  commissionFinanceRates,
  commissionLiquidationLineItems,
  commissionLiquidationLines,
  commissionLiquidationVersions,
  commissionLiquidations,
  commissionModelPoints,
  commissionPlanModelRates,
  commissionPlanVendedores,
  commissionPlans,
  commissionPreferenceRules,
  commissionRules,
  commissionUsedRates,
  commissionVoPatterns,
  estadoVehiculo,
  expedientes,
  libroPuntos,
  marcas,
  modelos,
  promocionesPuntos,
  tipoDeVenta,
  usuarios,
} from "@/db/schema";
import {
  apuntesDeSincronizacion,
  calcularMes,
  mesesAfectados,
  seleccionarPlan,
  type CategoriaVenta,
  type Clase,
  type ExpedienteMotor,
  type PlanMotor,
  type ReglaBonusMotor,
  type ResultadoMes,
  type VendedorMes,
  type VendedorMotor,
} from "@/lib/comisiones";

/** Desplazamiento para que los ids de `commission_bonus_rules` no choquen con los de `commission_rules`. */
const DESPLAZAMIENTO_BONUS = 1_000_000;

const aplicaDe = (v: string): string => v || "VN";
const condicionTasa = (v: string): "indiferente" | "cumplida" | "no_cumplida" => (v === "cumplida" || v === "no_cumplida" ? v : "indiferente");
const ambitoTasa = (v: string): "marca" | "global" | "vo" => (v === "global" || v === "vo" ? v : "marca");
const CATEGORIAS: CategoriaVenta[] = ["CONTADO", "CREDITO", "PREFERENCE", "RENTING"];
const categoria = (v: string | null | undefined): CategoriaVenta | null => (CATEGORIAS.includes(v as CategoriaVenta) ? (v as CategoriaVenta) : null);

/**
 * Categoría con la que cuenta un tipo de pago. Si el nombre dice claramente Preference o Renting pero la categoría guardada es otra
 * (un tipo creado por una importación o a mano con la categoría mal), manda el nombre: así un «Preference» nunca cobra como crédito.
 */
export function categoriaEfectiva(guardada: string | null | undefined, nombre: string | null | undefined): CategoriaVenta | null {
  const g = categoria(guardada);
  if (!nombre) return g;
  const porNombre = categoriaTipoVenta(nombre);
  if ((porNombre === "PREFERENCE" || porNombre === "RENTING") && g !== porNombre) return porNombre;
  return g;
}

/** Carga un plan completo (con sus tarifas, reglas y objetivos) en el formato del motor. */
export async function cargarPlan(ej: Ejecutor, idPlan: number): Promise<PlanMotor | null> {
  const [p] = await ej.select().from(commissionPlans).where(eq(commissionPlans.idPlan, idPlan));
  if (!p) return null;
  const [vend, promos, tarifas, puntosModelo, usados, patrones, fin, pref, reglas, bonus, tasas, nMarcas, nModelos] = await Promise.all([
    ej.select().from(commissionPlanVendedores).where(eq(commissionPlanVendedores.idPlan, idPlan)),
    ej.select().from(promocionesPuntos).where(eq(promocionesPuntos.idPlan, idPlan)),
    ej.select().from(commissionPlanModelRates).where(eq(commissionPlanModelRates.idPlan, idPlan)),
    ej.select().from(commissionModelPoints).where(eq(commissionModelPoints.idPlan, idPlan)),
    ej.select().from(commissionUsedRates).where(eq(commissionUsedRates.idPlan, idPlan)),
    ej.select().from(commissionVoPatterns).where(eq(commissionVoPatterns.idPlan, idPlan)),
    ej.select().from(commissionFinanceRates).where(eq(commissionFinanceRates.idPlan, idPlan)),
    ej.select().from(commissionPreferenceRules).where(eq(commissionPreferenceRules.idPlan, idPlan)),
    ej.select().from(commissionRules).where(eq(commissionRules.idPlan, idPlan)),
    ej.select().from(commissionBonusRules).where(eq(commissionBonusRules.idPlan, idPlan)),
    ej.select().from(commissionBrandInterventionRates).where(eq(commissionBrandInterventionRates.idPlan, idPlan)),
    ej.select({ id: marcas.idMarca, nombre: marcas.nombre }).from(marcas),
    ej.select({ id: modelos.idModelo, nombre: modelos.nombreModelo }).from(modelos),
  ]);

  const mapearRegla = (r: Omit<typeof reglas[number], "idRule">, id: number): ReglaBonusMotor => ({
    id,
    nombre: r.nombre,
    evento: r.evento as ReglaBonusMotor["evento"],
    tipoVehiculo: r.tipoVehiculo,
    fechaInicio: r.fechaInicio,
    fechaFin: r.fechaFin,
    idMarca: r.idMarca,
    idModelo: r.idModelo,
    tasaIntervencion: r.tasaIntervencion as ReglaBonusMotor["tasaIntervencion"],
    puntos: r.puntos,
    importe: r.importe,
    esPenalizacion: r.esPenalizacion,
    ligarACredito: r.ligarACredito,
    activa: r.activa,
  });

  return {
    idPlan: p.idPlan,
    nombre: p.nombre,
    fechaInicio: p.fechaInicio,
    fechaFin: p.fechaFin,
    estado: p.estado as PlanMotor["estado"],
    tramoMin: p.tramoMin,
    tramoMax: p.tramoMax,
    puntosPorPedido: p.puntosPorPedido,
    penalizacionImporte: p.penalizacionImporte,
    voPuntosModo: p.voPuntosModo === "no" ? "no" : "cuentan",
    voPuntos: p.voPuntos,
    tasaGlobal: { tipoTasa: p.tasaGlobalTipo === "unidades" ? "unidades" : "porcentaje", objetivo: p.tasaGlobalObjetivo },
    tasaIncluyeVo: p.tasaIncluyeVo,
    tasaVo: { tipoTasa: p.tasaVoTipo === "unidades" ? "unidades" : "porcentaje", objetivo: p.tasaVoObjetivo },
    objetivos: Object.fromEntries(vend.map((v) => [v.idUsuario, { base: v.objetivoBase, arrastre: v.arrastre }])),
    puntosPorDefectoModelo: Object.fromEntries(puntosModelo.map((x) => [x.idModelo, x.puntos])),
    puntosPorDefectoMarca: Object.fromEntries(tasas.map((x) => [x.idMarca, x.puntosDefecto])),
    promociones: promos.map((x) => ({ id: x.id, nombre: x.nombre, puntosEspeciales: x.puntosEspeciales, minimoUnidades: x.minimoUnidades, puntosSiNoCumple: x.puntosSiNoCumple })),
    tarifasVN: tarifas.map((t) => ({ idModelo: t.idModelo, tasaCumplida: t.tasaCumplida, importes: t.importes, activo: t.activo })),
    tarifasUsadosPorSubtipo: usados.map((u) => ({ subtipo: u.subtipo, importePrimera: u.importePrimera, importeResto: u.importeResto, minAplicar: u.minAplicar, activo: u.activo })),
    patronesVO: patrones.map((x) => ({ nombre: x.nombre, aplicaAVn: x.aplicaAVn, rotativo: x.rotativo, activo: x.activo, tiers: x.tiers })),
    financiacionPorMarcaTipo: fin.flatMap((f) => {
      const tipo = categoria(f.tipoFinanciacion);
      return tipo ? [{ idMarca: f.idMarca, tipo, aplicaA: aplicaDe(f.aplicaA), importe: f.importe, tasaIntervencion: condicionTasa(f.tasaIntervencion), tasaAmbito: ambitoTasa(f.tasaAmbito) }] : [];
    }),
    reglasPreference: pref.map((r) => ({ id: r.idPrefRule, nombre: r.nombre ?? undefined, idMarca: r.idMarca, idModelo: r.idModelo, tipo: categoria(r.tipoFinanciacion), aplicaA: aplicaDe(r.aplicaA), importe: r.importe, activa: r.activa, tasaIntervencion: condicionTasa(r.tasaIntervencion), tasaAmbito: ambitoTasa(r.tasaAmbito) })),
    reglasYBonus: [...reglas.map((r) => mapearRegla(r, r.idRule)), ...bonus.map((r) => mapearRegla(r, r.idBonusRule + DESPLAZAMIENTO_BONUS))],
    tasaIntervencionPorMarca: tasas.map((t) => ({ idMarca: t.idMarca, tipoTasa: t.tipoTasa === "unidades" ? "unidades" : "porcentaje", objetivo: t.objetivo })),
    nombresMarca: Object.fromEntries(nMarcas.map((m) => [m.id, m.nombre])),
    nombresModelo: Object.fromEntries(nModelos.map((m) => [m.id, m.nombre])),
  };
}

/** Plan que se aplica a un mes (el activo de mayor fecha de inicio entre los que lo tocan). */
export async function planDelMes(ej: Ejecutor, mes: string): Promise<PlanMotor | null> {
  const filas = await ej
    .select({ id: commissionPlans.idPlan })
    .from(commissionPlans)
    .where(sql`to_char(${commissionPlans.fechaInicio}, 'YYYY-MM') <= ${mes} and to_char(${commissionPlans.fechaFin}, 'YYYY-MM') >= ${mes}`);
  const planes: PlanMotor[] = [];
  for (const f of filas) {
    const p = await cargarPlan(ej, f.id);
    if (p) planes.push(p);
  }
  return seleccionarPlan(planes, mes);
}

/** Rango de meses (AAAA-MM, ambos incluidos). */
export interface RangoMeses {
  desde: string;
  hasta: string;
}

/** Último día de un mes «AAAA-MM» como fecha ISO. */
function ultimoDiaDelMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/**
 * Expedientes de un vendedor en el formato del motor. El motor solo mira los expedientes con alguna fecha (pedido,
 * afectación, RCI, matriculación o cobro) dentro del mes que calcula, así que con `rango` solo se cargan esos: con
 * cientos de miles de expedientes por vendedor es la diferencia entre milisegundos y segundos.
 */
export async function cargarExpedientesMotor(ej: Ejecutor, idVendedor: number, rango?: RangoMeses): Promise<ExpedienteMotor[]> {
  const delRango = rango
    ? [expedientes.fechaExpediente, expedientes.fechaAfectacion, expedientes.fechaRci, expedientes.fechaMatriculacion, expedientes.fechaFacturacion, expedientes.fechaCobrado].map((c) => between(c, `${rango.desde}-01`, ultimoDiaDelMes(rango.hasta)))
    : null;
  return cargarExpedientesDonde(ej, delRango ? and(eq(expedientes.idUsuario, idVendedor), or(...delRango)) : eq(expedientes.idUsuario, idVendedor));
}

/** Expedientes (con vendedor) por identificador, en el formato del motor. */
export async function cargarExpedientesMotorPorIds(ej: Ejecutor, ids: number[]): Promise<ExpedienteMotor[]> {
  if (ids.length === 0) return [];
  return cargarExpedientesDonde(ej, inArray(expedientes.idExpediente, ids));
}

async function cargarExpedientesDonde(ej: Ejecutor, condicion: SQL | undefined): Promise<ExpedienteMotor[]> {
  const filas = await ej
    .select({ e: expedientes, clase: estadoVehiculo.clase, subtipo: estadoVehiculo.subtipoVo, cat: tipoDeVenta.categoria, nombreTipo: tipoDeVenta.nombreTipoVenta, cuentaTasa: tipoDeVenta.cuentaParaTasa, marca: modelos.marcaId })
    .from(expedientes)
    .leftJoin(estadoVehiculo, eq(expedientes.idEstadoVehiculo, estadoVehiculo.idEstadoVehiculo))
    .leftJoin(tipoDeVenta, eq(expedientes.idTipoDeVenta, tipoDeVenta.idTipoDeVenta))
    .leftJoin(modelos, eq(expedientes.idModelo, modelos.idModelo))
    .where(condicion ? and(condicion, isNull(expedientes.eliminadoEn)) : isNull(expedientes.eliminadoEn));
  return filas.flatMap(({ e, clase, subtipo, cat, nombreTipo, cuentaTasa, marca }) => e.idUsuario === null ? [] : [{
    id: e.idExpediente,
    idVendedor: e.idUsuario,
    clase: (clase === "VO" ? "VO" : "VN") as Clase,
    subtipoVO: subtipo ?? null,
    idMarca: marca ?? null,
    idModelo: e.idModelo,
    categoriaVenta: categoriaEfectiva(cat, nombreTipo),
    cuentaParaTasa: cuentaTasa ?? undefined,
    fechaExpediente: e.fechaExpediente,
    fechaAfectacion: e.fechaAfectacion,
    fechaRci: e.fechaRci,
    fechaMatriculacion: e.fechaMatriculacion,
    fechaFacturacion: e.fechaFacturacion,
    fechaCobro: e.fechaCobrado,
    cobradoOtraFecha: e.cobradoOtraFecha,
    puntos: e.puntos,
    idPromocion: e.idPromocion,
    comisionCocheManual: e.comisionCocheManual,
    comisionFinanciacionManual: e.comisionFinanciacionManual,
    conceptosEspeciales: (e.conceptosEspeciales ?? []).map((c) => ({
      titulo: c.titulo,
      importe: c.importe_centimos,
      descripcion: c.descripcion,
      evento: c.evento,
      cobrado: c.cobrado,
    })),
  } satisfies ExpedienteMotor]);
}

export async function cargarVendedor(ej: Ejecutor, idVendedor: number): Promise<VendedorMotor | null> {
  const [u] = await ej.select({ tipo: usuarios.tipoVendedor, patron: usuarios.patronVo }).from(usuarios).where(eq(usuarios.idUsuario, idVendedor));
  if (!u) return null;
  return { id: idVendedor, tipo: u.tipo === "VO" ? "VO" : "VN", patronVo: u.patron };
}

/** Cálculo sin guardar (vista previa, informes). */
/** `expedientesPrecargados` evita releer los expedientes del vendedor en cada mes (informes de varios meses). */
export async function calcularVendedorMes(ej: Ejecutor, idVendedor: number, mes: string, expedientesPrecargados?: ExpedienteMotor[]): Promise<ResultadoMes | null> {
  const vendedor = await cargarVendedor(ej, idVendedor);
  if (!vendedor) return null;
  const plan = await planDelMes(ej, mes);
  return calcularMes(plan, vendedor, mes, expedientesPrecargados ?? (await cargarExpedientesMotor(ej, idVendedor, { desde: mes, hasta: mes })));
}

/* ------------------------------------------------------------------ */
/* Persistencia de la liquidación                                      */
/* ------------------------------------------------------------------ */

interface SnapshotItem {
  concepto: string;
  descripcion: string;
  importe: number;
  puntos: number;
  evento: string | null;
  mesEvento: string | null;
  aviso: string | null;
}
interface SnapshotLinea {
  idExpediente: number | null;
  clase: string;
  mesComputo: string | null;
  cuenta: boolean;
  unidades: number;
  puntos: number;
  importe: number;
  conceptos: SnapshotItem[];
}
export interface SnapshotLiquidacion {
  idPlan: number;
  mes: string;
  objetivoX: number;
  puntosMes: number;
  tramo: number;
  tasaIntervencion: unknown[];
  avisos: string[];
  bruto: number;
  penalizacion: number;
  neto: number;
  mesPago: string;
  lineas: SnapshotLinea[];
}

function snapshotDeResultado(r: ResultadoMes): SnapshotLiquidacion {
  return {
    idPlan: r.idPlan as number,
    mes: r.mes,
    objetivoX: r.objetivoX,
    puntosMes: r.puntosMes,
    tramo: r.tramo,
    tasaIntervencion: r.tasaIntervencion,
    avisos: r.avisos,
    bruto: r.bruto,
    penalizacion: r.penalizacion,
    neto: r.neto,
    mesPago: r.mesPago,
    lineas: r.lineas.map((l) => ({
      idExpediente: l.idExpediente,
      clase: l.clase,
      mesComputo: l.mesComputo,
      cuenta: l.cuenta,
      unidades: l.unidades,
      puntos: l.puntos,
      importe: l.importe,
      conceptos: l.conceptos.map((c) => ({
        concepto: c.concepto,
        descripcion: c.descripcion,
        importe: c.importe,
        puntos: c.puntos,
        evento: c.evento,
        mesEvento: c.mesEvento,
        aviso: c.aviso ?? null,
      })),
    })),
  };
}

async function leerSnapshot(ej: Ejecutor, liq: typeof commissionLiquidations.$inferSelect): Promise<SnapshotLiquidacion> {
  const lineas = await ej.select().from(commissionLiquidationLines).where(eq(commissionLiquidationLines.idLiquidation, liq.idLiquidation)).orderBy(commissionLiquidationLines.idLine);
  const items = lineas.length
    ? await ej
        .select()
        .from(commissionLiquidationLineItems)
        .where(inArray(commissionLiquidationLineItems.idLine, lineas.map((l) => l.idLine)))
        .orderBy(commissionLiquidationLineItems.idLine, commissionLiquidationLineItems.orden)
    : [];
  return {
    idPlan: liq.idPlan,
    mes: liq.mes,
    objetivoX: liq.objetivoX,
    puntosMes: liq.puntosMes,
    tramo: liq.tramo,
    tasaIntervencion: liq.tasaIntervencion,
    avisos: liq.avisos,
    bruto: liq.bruto,
    penalizacion: liq.penalizacion,
    neto: liq.neto,
    mesPago: liq.mesPago,
    lineas: lineas.map((l) => ({
      idExpediente: l.idExpediente,
      clase: l.clase,
      mesComputo: l.mesComputo,
      cuenta: l.cuenta,
      unidades: l.unidades,
      puntos: l.puntos,
      importe: l.importe,
      conceptos: items
        .filter((i) => i.idLine === l.idLine)
        .map((i) => ({ concepto: i.concepto, descripcion: i.descripcion, importe: i.importe, puntos: i.puntos, evento: i.evento, mesEvento: i.mesEvento, aviso: i.aviso })),
    })),
  };
}

/** JSON con claves ordenadas (jsonb no conserva el orden de las claves). */
function canonico(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : x,
  );
}

export interface ResumenRecalculo {
  idVendedor: number;
  mes: string;
  idLiquidation: number | null;
  /** Neto antes del recálculo (null si no existía liquidación). */
  netoAnterior: number | null;
  netoNuevo: number;
  version: number | null;
  /** Se guardó una versión del estado anterior (mes revisado/cerrado o importado). */
  versionGuardada: boolean;
  /** El recálculo cambió el contenido de una liquidación existente. */
  cambio: boolean;
  apuntesLibro: number;
}

/**
 * Recalcula y guarda la liquidación de un vendedor y mes dentro de la transacción dada, y sincroniza
 * el libro de puntos. Debe ejecutarse dentro de una transacción (el indicador `app.recalculo` es local a ella). Idempotente: si nada cambia no escribe nada.
 */
export async function recalcularMes(tx: Ejecutor, idVendedor: number, mes: string, motivo: string): Promise<ResumenRecalculo> {
  await tx.execute(sql`select set_config('app.recalculo', 'on', true)`);
  // Cerrojo por (vendedor, mes): dos ediciones simultáneas no pueden crear dos veces la misma liquidación
  const [anioMes, numMes] = mes.split("-").map(Number);
  await tx.execute(sql`select pg_advisory_xact_lock(${idVendedor}::int, ${anioMes * 12 + numMes}::int)`);
  const resultado = (await calcularVendedorMes(tx, idVendedor, mes)) as ResultadoMes | null;
  const resumen: ResumenRecalculo = { idVendedor, mes, idLiquidation: null, netoAnterior: null, netoNuevo: 0, version: null, versionGuardada: false, cambio: false, apuntesLibro: 0 };
  if (!resultado) return resumen;
  resumen.netoNuevo = resultado.neto;

  if (resultado.idPlan !== null) {
    const nuevo = snapshotDeResultado(resultado);
    const [actual] = await tx
      .select()
      .from(commissionLiquidations)
      .where(and(eq(commissionLiquidations.idPlan, resultado.idPlan), eq(commissionLiquidations.idUsuario, idVendedor), eq(commissionLiquidations.mes, mes)));
    const vacio = resultado.lineas.length === 0 && resultado.neto === 0;

    if (!actual) {
      if (!vacio) {
        const [liq] = await tx
          .insert(commissionLiquidations)
          .values({
            idPlan: resultado.idPlan,
            idUsuario: idVendedor,
            mes,
            estado: "calculada",
            version: 1,
            objetivoX: nuevo.objetivoX,
            puntosMes: nuevo.puntosMes,
            tramo: nuevo.tramo,
            tasaIntervencion: nuevo.tasaIntervencion,
            avisos: nuevo.avisos,
            bruto: nuevo.bruto,
            penalizacion: nuevo.penalizacion,
            neto: nuevo.neto,
            mesPago: nuevo.mesPago,
          })
          .returning();
        await escribirLineas(tx, liq.idLiquidation, nuevo);
        resumen.idLiquidation = liq.idLiquidation;
        resumen.version = 1;
      }
    } else {
      const anterior = await leerSnapshot(tx, actual);
      resumen.idLiquidation = actual.idLiquidation;
      resumen.netoAnterior = actual.neto;
      resumen.version = actual.version;
      if (canonico(anterior) !== canonico(nuevo)) {
        resumen.cambio = true;
        const protegida = actual.estado === "revisada" || actual.estado === "cerrada" || actual.origen === "importada_antigua";
        let version = actual.version;
        if (protegida) {
          await tx.insert(commissionLiquidationVersions).values({
            idLiquidation: actual.idLiquidation,
            version: actual.version,
            motivo,
            snapshot: { ...anterior, estado: actual.estado, origen: actual.origen },
            netoAnterior: actual.neto,
            netoNuevo: nuevo.neto,
          });
          version = actual.version + 1;
          resumen.versionGuardada = true;
        }
        await tx
          .update(commissionLiquidations)
          .set({
            version,
            objetivoX: nuevo.objetivoX,
            puntosMes: nuevo.puntosMes,
            tramo: nuevo.tramo,
            tasaIntervencion: nuevo.tasaIntervencion,
            avisos: nuevo.avisos,
            bruto: nuevo.bruto,
            penalizacion: nuevo.penalizacion,
            neto: nuevo.neto,
            mesPago: nuevo.mesPago,
            origen: "motor",
            calculadaEn: new Date(),
          })
          .where(eq(commissionLiquidations.idLiquidation, actual.idLiquidation));
        await tx.delete(commissionLiquidationLines).where(eq(commissionLiquidationLines.idLiquidation, actual.idLiquidation));
        await escribirLineas(tx, actual.idLiquidation, nuevo);
        resumen.version = version;
      }
    }
  }

  resumen.apuntesLibro = await sincronizarLibro(tx, idVendedor, mes, resultado);
  return resumen;
}

async function escribirLineas(tx: Ejecutor, idLiquidation: number, s: SnapshotLiquidacion): Promise<void> {
  for (const l of s.lineas) {
    const [fila] = await tx
      .insert(commissionLiquidationLines)
      .values({ idLiquidation, idExpediente: l.idExpediente, clase: l.clase, mesComputo: l.mesComputo, cuenta: l.cuenta, unidades: l.unidades, puntos: l.puntos, importe: l.importe })
      .returning({ id: commissionLiquidationLines.idLine });
    if (l.conceptos.length) {
      await tx.insert(commissionLiquidationLineItems).values(
        l.conceptos.map((c, orden) => ({ idLine: fila.id, orden, concepto: c.concepto, descripcion: c.descripcion, importe: c.importe, puntos: c.puntos, evento: c.evento, mesEvento: c.mesEvento, aviso: c.aviso })),
      );
    }
  }
}

/** Inserta en el libro los apuntes que faltan para que sume lo que dice el motor (12.10). */
export async function sincronizarLibro(tx: Ejecutor, idVendedor: number, mes: string, resultado: ResultadoMes): Promise<number> {
  const actuales = await tx
    .select({ idExpediente: libroPuntos.idExpediente, evento: libroPuntos.evento, regla: libroPuntos.regla, puntos: sql<number>`sum(${libroPuntos.puntos})::int` })
    .from(libroPuntos)
    .where(and(eq(libroPuntos.idUsuario, idVendedor), eq(libroPuntos.mes, mes)))
    .groupBy(libroPuntos.idExpediente, libroPuntos.evento, libroPuntos.regla);
  const nuevos = apuntesDeSincronizacion(resultado.apuntesPuntos, actuales, { idVendedor, mes });
  if (nuevos.length) {
    await tx.insert(libroPuntos).values(nuevos.map((a) => ({ idUsuario: idVendedor, idExpediente: a.idExpediente, evento: a.evento, fecha: a.fecha, mes: a.mes, puntos: a.puntos, regla: a.regla })));
  }
  return nuevos.length;
}

/** Recalcula todos los (vendedor, mes) afectados por un cambio (12.9). Debe llamarse dentro de la transacción del cambio. */
export async function recalcularAfectados(tx: Ejecutor, afectados: VendedorMes[], motivo: string): Promise<ResumenRecalculo[]> {
  const res: ResumenRecalculo[] = [];
  for (const a of afectados) res.push(await recalcularMes(tx, a.idVendedor, a.mes, motivo));
  return res;
}

/**
 * Ejecuta un cambio de expedientes y recalcula, en la misma transacción, todos los (vendedor, mes)
 * afectados antes y después, incluidos los meses cerrados (12.9).
 * `idsDespues` puede incluir ids nuevos (altas); los borrados simplemente ya no existen después.
 */
export async function conRecalculo<T>(
  ej: Ejecutor,
  idsAntes: number[],
  motivo: string,
  accion: (tx: Ejecutor) => Promise<{ valor: T; idsDespues: number[] }>,
): Promise<{ valor: T; recalculos: ResumenRecalculo[] }> {
  return ej.transaction(async (tx) => {
    const antes = await cargarExpedientesMotorPorIds(tx, idsAntes);
    const { valor, idsDespues } = await accion(tx);
    const despues = await cargarExpedientesMotorPorIds(tx, idsDespues);
    const mapaDespues = new Map(despues.map((e) => [e.id, e]));
    const mapaAntes = new Map(antes.map((e) => [e.id, e]));
    const claves = new Map<string, VendedorMes>();
    for (const id of new Set([...mapaAntes.keys(), ...mapaDespues.keys()])) {
      for (const a of mesesAfectados(mapaAntes.get(id) ?? null, mapaDespues.get(id) ?? null)) claves.set(`${a.idVendedor}|${a.mes}`, a);
    }
    const afectados = [...claves.values()].sort((a, b) => a.idVendedor - b.idVendedor || a.mes.localeCompare(b.mes));
    const recalculos = await recalcularAfectados(tx, afectados, motivo);
    return { valor, recalculos };
  });
}
