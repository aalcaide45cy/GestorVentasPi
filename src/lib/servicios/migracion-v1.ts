import { randomBytes } from "node:crypto";
import { and, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { SECCIONES_AL_ANADIR, SECCIONES_V1, type SeccionV1 } from "@/lib/migracion-secciones";
import type { Ejecutor } from "@/db";
import {
  clientes,
  commissionBonusRules,
  commissionBrandInterventionRates,
  commissionFinanceRates,
  commissionLiquidationLineItems,
  commissionLiquidationLines,
  commissionLiquidations,
  commissionPlanModelRates,
  commissionPlanVendedores,
  commissionPlans,
  commissionPreferenceRules,
  commissionRules,
  commissionUsedRates,
  commissionVoPatterns,
  emailsClientes,
  estadoVehiculo,
  expedientes,
  importacionesBloques,
  importacionesRegistros,
  marcas,
  modelos,
  promocionesPuntos,
  telefonosClientes,
  tiendas,
  tipoDeVenta,
  usuarios,
  usuariosTiendas,
  type ConceptoEspecial,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { HttpError } from "@/lib/auth/sesion";
import { categoriaTipoVenta, claseEstado } from "./comun";
import { conRecalculo } from "./liquidaciones";

/**
 * Conversión de una copia JSON de la app ANTIGUA (formato «1.0», con Clerk) a la base de datos nueva (12.13).
 * Es repetible: sustituye los datos operativos (catálogos, clientes, expedientes y comisiones) y conserva las cuentas
 * de acceso actuales; ejecutarla dos veces deja el mismo resultado.
 */

type Fila = Record<string, unknown>;

export const esquemaCopiaV1 = z.object({
  version: z.string().optional(),
  timestamp: z.string().optional(),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});
export type CopiaV1 = z.infer<typeof esquemaCopiaV1>;

const num = (v: unknown, def = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : def;
};
const numNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const fecha = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const bool = (v: unknown, def = false): boolean => (typeof v === "boolean" ? v : def);
const euroACentimos = (v: unknown): number => Math.round(num(v) * 100);
const filas = (copia: CopiaV1, clave: string): Fila[] => (copia.data[clave] ?? []) as Fila[];

export const TABLAS_V1_CONOCIDAS = [
  "tiendas", "usuarios", "usuariosTiendas", "emailsUsuarios", "telefonosUsuarios", "clientes", "emailsClientes", "telefonosClientes",
  "marcas", "modelos", "tipoDeVenta", "estadoVehiculo", "expedientes", "commissionPlans", "commissionPlanModelRates", "commissionRules",
  "commissionBonusRules", "commissionFinanceRules", "commissionUsedRates", "commissionFinanceRates", "commissionPreferenceRules",
  "commissionVoPatterns", "commissionBrandInterventionRates", "commissionLiquidations", "commissionLiquidationLines",
  "commissionLiquidationLineItems", "importacionesBloques", "importacionesRegistros", "ajustes",
];

/* ------------------------------------------------------------------ */
/* Informe de análisis (pantalla de clasificación)                     */
/* ------------------------------------------------------------------ */

export interface InformeMigracion {
  version: string | null;
  tablas: { nombre: string; filas: number }[];
  estados: { id: number; nombre: string; clase: "VN" | "VO"; subtipo: string | null }[];
  tiposVenta: { id: number; nombre: string; categoria: string }[];
  usuarios: { idAntiguo: number; nombre: string | null; destino: string }[];
  expedientesSinVendedor: number;
  expedientesConCupo: number;
  planes: number;
  liquidaciones: number;
  avisos: string[];
}

export function validarCopiaV1(copia: CopiaV1): void {
  if (copia.version && copia.version !== "1.0") {
    throw new HttpError(400, copia.version === "2.0" ? "Esta copia ya está en el formato nuevo (2.0): usa «Restaurar copia JSON»." : `Versión de copia no reconocida: ${copia.version}`);
  }
  const desconocidas = Object.keys(copia.data).filter((k) => !TABLAS_V1_CONOCIDAS.includes(k));
  if (desconocidas.length > 0) throw new HttpError(400, `Formato de copia no reconocido: tablas desconocidas (${desconocidas.join(", ")})`);
  if (!copia.data.expedientes && !copia.data.commissionPlans) throw new HttpError(400, "La copia no contiene expedientes ni planes: ¿es una copia de la aplicación antigua?");
}

export interface ContextoUsuarios {
  /** Usuarios actuales de la app nueva (id, nombre). */
  actuales: { id: number; nombre: string | null }[];
  idAdmin: number;
}

const normaliza = (s: string | null): string => (s ?? "").trim().toLowerCase();

/** Destino de cada usuario antiguo: la cuenta actual con el mismo nombre o una cuenta bloqueada nueva. */
function mapaUsuarios(copia: CopiaV1, ctx: ContextoUsuarios): { idAntiguo: number; nombre: string | null; idNuevo: number | null }[] {
  return filas(copia, "usuarios").map((u) => {
    const nombre = str(u.nombre);
    const existente = ctx.actuales.find((a) => normaliza(a.nombre) === normaliza(nombre) && nombre !== null);
    return { idAntiguo: num(u.id_usuario), nombre, idNuevo: existente?.id ?? null };
  });
}

export function analizarCopiaV1(copia: CopiaV1, ctx: ContextoUsuarios): InformeMigracion {
  validarCopiaV1(copia);
  const avisos: string[] = [];
  const usuariosMap = mapaUsuarios(copia, ctx);
  const idsAntiguos = new Set(usuariosMap.map((u) => u.idAntiguo));
  const exps = filas(copia, "expedientes");
  const sinVendedor = exps.filter((e) => e.id_usuario === null || e.id_usuario === undefined || !idsAntiguos.has(num(e.id_usuario))).length;
  if (sinVendedor > 0) avisos.push(`${sinVendedor} expedientes sin vendedor válido se asignarán al administrador (podrás reasignarlos).`);
  const nuevos = usuariosMap.filter((u) => u.idNuevo === null);
  if (nuevos.length > 0) avisos.push(`${nuevos.length} usuarios antiguos no coinciden por nombre con ninguna cuenta actual: se crearán como cuentas bloqueadas (sin acceso) para conservar sus expedientes.`);
  const finanzas = filas(copia, "commissionFinanceRules");
  if (finanzas.length > 0) avisos.push("Las reglas de financiación genéricas (importe normal/preference por plan) no existen en el modelo nuevo: se ignoran; los incentivos por marca sí se convierten.");
  const manuales = [...filas(copia, "commissionRules"), ...filas(copia, "commissionBonusRules")].filter((r) => r.tipo_evento === "manual").length;
  if (manuales > 0) avisos.push(`${manuales} reglas/bonus de tipo «manual» no tienen evento en el modelo nuevo: se ignoran.`);
  if (filas(copia, "commissionPlans").some((p) => num(p.min_matriculaciones) > 0)) avisos.push("El mínimo de matriculaciones ya no se usa (se conserva solo como dato histórico del plan).");

  return {
    version: copia.version ?? null,
    tablas: Object.entries(copia.data).map(([nombre, f]) => ({ nombre, filas: f.length })),
    estados: filas(copia, "estadoVehiculo").map((e) => ({ id: num(e.id_estado_vehiculo), nombre: str(e.nombre_estado_vehiculo) ?? "", ...claseEstado(str(e.nombre_estado_vehiculo) ?? "") })),
    tiposVenta: filas(copia, "tipoDeVenta").map((t) => ({ id: num(t.id_tipo_de_venta), nombre: str(t.nombre_tipo_venta) ?? "", categoria: categoriaTipoVenta(str(t.nombre_tipo_venta) ?? "") })),
    usuarios: usuariosMap.map((u) => ({ idAntiguo: u.idAntiguo, nombre: u.nombre, destino: u.idNuevo ? `cuenta actual #${u.idNuevo}` : "cuenta bloqueada nueva" })),
    expedientesSinVendedor: sinVendedor,
    expedientesConCupo: exps.filter((e) => num(e.min_coches_multiplicador) > 0).length,
    planes: filas(copia, "commissionPlans").length,
    liquidaciones: filas(copia, "commissionLiquidations").length,
    avisos,
  };
}

/* ------------------------------------------------------------------ */
/* Transformación pura                                                  */
/* ------------------------------------------------------------------ */

const TRAMOS_ANTIGUOS: [string, string][] = [
  ["rate_x_minus_4", "-4"], ["rate_x_minus_3", "-3"], ["rate_x_minus_2", "-2"], ["rate_x_minus_1", "-1"],
  ["rate_x", "0"], ["rate_x_plus_1", "1"], ["rate_x_plus_2", "2"], ["rate_x_plus_3", "3"],
];

const EVENTOS: Record<string, string | null> = { pedido: "pedido", afectacion: "afectacion", matriculacion: "matriculacion", financiacion: "credito", credito: "credito", preference: "preference", cobro: "cobro", manual: null };

const SUBTIPOS_USADO: Record<string, string> = { vo: "USADO", usado: "USADO", usados: "USADO", bb: "BUYBACK", buyback: "BUYBACK", km0: "KM0", "km 0": "KM0", demo: "DEMO" };

const mesDe = (f: string | null): string | null => (f ? f.slice(0, 7) : null);

function parseJson(texto: unknown): unknown {
  if (typeof texto !== "string") return texto;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function tramoDeTexto(t: unknown): number {
  const m = /^X\s*([+-]\s*\d+)?$/i.exec(String(t ?? "").trim());
  return m ? Number((m[1] ?? "0").replace(/\s/g, "")) : 0;
}

type ExpConv = Fila & {
  _usuarioAntiguo: number | null;
  _clase: "VN" | "VO";
  fecha_cobrado_nuevo: string | null;
  puntos_nuevo: number | null;
  manual_coche: number | null;
  manual_fin: number | null;
  conceptos: ConceptoEspecial[];
  id_promocion_nuevo?: number | null;
};
type EstadoConv = Fila & { _clase: { clase: "VN" | "VO"; subtipo: string | null } };

export interface DatosConvertidos {
  usuariosNuevos: { idAntiguo: number; nombre: string | null; rol: string; tipoVendedor: string; patronVo: string | null }[];
  mapaUsuarios: Map<number, number | null>;
  tiendas: Fila[];
  marcas: Fila[];
  modelos: Fila[];
  tiposVenta: Fila[];
  estados: Fila[];
  clientes: Fila[];
  emailsClientes: Fila[];
  telefonosClientes: Fila[];
  expedientes: ExpConv[];
  usuariosTiendas: Fila[];
  planes: Fila[];
  planVendedores: { idPlan: number; idUsuarioAntiguo: number | null; objetivoBase: number; arrastre: number }[];
  promociones: Fila[];
  tarifas: Fila[];
  usados: Fila[];
  patrones: Fila[];
  financiacion: Fila[];
  preference: Fila[];
  reglas: Fila[];
  bonus: Fila[];
  tasas: Fila[];
  liquidaciones: { cab: Fila; usuarioAntiguo: number | null; lineas: { fila: Fila; items: Fila[] }[] }[];
  importBloques: Fila[];
  importRegistros: Fila[];
  avisos: string[];
}

/** Convierte las tablas antiguas al modelo nuevo (sin tocar la base de datos). */
export function transformarCopiaV1(copia: CopiaV1, ctx: ContextoUsuarios): DatosConvertidos {
  validarCopiaV1(copia);
  const avisos: string[] = [];
  const usuariosMap = mapaUsuarios(copia, ctx);
  const mapa = new Map<number, number | null>(usuariosMap.map((u) => [u.idAntiguo, u.idNuevo]));
  const usuariosNuevos = filas(copia, "usuarios")
    .filter((u) => mapa.get(num(u.id_usuario)) === null)
    .map((u) => ({ idAntiguo: num(u.id_usuario), nombre: str(u.nombre), rol: "invitado", tipoVendedor: str(u.tipo_vendedor) === "VO" ? "VO" : "VN", patronVo: str(u.patron_vo) }));
  const idNuevoPorNombre = (nombre: string | null): number | null => {
    const n = normaliza(nombre);
    for (const u of usuariosMap) if (normaliza(u.nombre) === n && n !== "") return u.idAntiguo;
    return null;
  };

  // Catálogos
  const estados = filas(copia, "estadoVehiculo").map((e): EstadoConv => ({ ...e, _clase: claseEstado(str(e.nombre_estado_vehiculo) ?? "") }));
  const claseDeEstado = new Map(estados.map((e) => [num(e.id_estado_vehiculo), e._clase]));
  const tipos = filas(copia, "tipoDeVenta");

  // Expedientes
  const exps = filas(copia, "expedientes").map((e): ExpConv => {
    const usuarioAntiguo = e.id_usuario === null || e.id_usuario === undefined || !mapa.has(num(e.id_usuario)) ? null : num(e.id_usuario);
    const clase = claseDeEstado.get(num(e.id_estado_vehiculo))?.clase ?? "VN";
    const cobradoOtra = bool(e.cobrado_otra_fecha);
    let fechaCobrado = fecha(e.fecha_cobrado);
    // VO: la fecha de cobro era la de facturación si no estaba marcada la casilla (se cobraba y facturaba el mismo día)
    if (clase === "VO" && !cobradoOtra && !fechaCobrado) fechaCobrado = fecha(e.fecha_facturacion);
    const puntos = numNull(e.valor_objetivo);
    const conceptos = convertirConceptos(e.conceptos_adicionales, num(e.id_expediente), avisos);
    return {
      ...e,
      _usuarioAntiguo: usuarioAntiguo,
      _clase: clase,
      fecha_cobrado_nuevo: fechaCobrado,
      puntos_nuevo: puntos === null ? null : Math.round(puntos * 100),
      manual_coche: numNull(e.comision_coche_real) === null ? null : euroACentimos(e.comision_coche_real),
      manual_fin: numNull(e.comision_financiacion_real) === null ? null : euroACentimos(e.comision_financiacion_real),
      conceptos,
    };
  });

  // Planes
  const planes = filas(copia, "commissionPlans");
  const rangoPlan = (p: Fila): [string, string] => [fecha(p.fecha_inicio) ?? "", fecha(p.fecha_fin) ?? ""];
  const fechasDe = (e: Fila): string[] => [fecha(e.fecha_expediente), fecha(e.fecha_afectacion), fecha(e.fecha_rci), fecha(e.fecha_matriculacion), fecha(e.fecha_cobrado)].filter((f): f is string => f !== null);
  const planVendedores: DatosConvertidos["planVendedores"] = [];
  for (const p of planes) {
    const [ini, fin] = rangoPlan(p);
    const usuariosEnPlan = new Set<number | null>();
    for (const e of exps) if (fechasDe(e).some((f) => f >= ini && f <= fin)) usuariosEnPlan.add(e._usuarioAntiguo);
    if (usuariosEnPlan.size === 0) usuariosEnPlan.add(null);
    for (const u of usuariosEnPlan) planVendedores.push({ idPlan: num(p.id_plan), idUsuarioAntiguo: u, objetivoBase: num(p.objetivo_base) * 100, arrastre: num(p.arrastre) * 100 });
  }

  // Promociones: «min_coches_multiplicador» (cupo) → promoción «Importada: N puntos, mínimo M» por plan
  const promociones: Fila[] = [];
  const promoClave = new Map<string, number>();
  let siguientePromo = 1;
  const planDeFecha = (f: string | null): Fila | undefined => (f ? planes.find((p) => rangoPlan(p)[0] <= f && f <= rangoPlan(p)[1]) : undefined);
  const expedientesFinales = exps.map((e): ExpConv => {
    let idPromocion: number | null = null;
    const cupo = num(e.min_coches_multiplicador);
    if (cupo > 0 && e.puntos_nuevo !== null) {
      const usaCobro = e._clase === "VO" || bool(e.cobrado_otra_fecha);
      const fechaCuenta = usaCobro ? e.fecha_cobrado_nuevo : fecha(e.fecha_matriculacion);
      const plan = planDeFecha(fechaCuenta);
      if (!plan) {
        avisos.push(`Expediente ${num(e.id_expediente)}: tiene cupo pero no cuenta en ningún plan; conserva sus puntos propios.`);
      } else {
        const clave = `${num(plan.id_plan)}|${e.puntos_nuevo}|${cupo}`;
        let id = promoClave.get(clave);
        if (!id) {
          id = siguientePromo++;
          promoClave.set(clave, id);
          promociones.push({ id, id_plan: num(plan.id_plan), nombre: `Importada: ${(e.puntos_nuevo / 100).toLocaleString("es-ES")} puntos, mínimo ${cupo}`, puntos_especiales: e.puntos_nuevo, minimo_unidades: cupo, puntos_si_no_cumple: 100 });
        }
        idPromocion = id;
      }
    }
    return { ...e, id_promocion_nuevo: idPromocion };
  });

  // Tarifas, reglas y demás
  const tarifas = filas(copia, "commissionPlanModelRates").map((r) => ({
    id_plan: num(r.id_plan),
    id_modelo: num(r.id_modelo),
    tasa_cumplida: bool(r.tasa_intervencion_cumplida),
    importes: Object.fromEntries(TRAMOS_ANTIGUOS.map(([col, tramo]) => [tramo, euroACentimos(r[col])])),
    activo: bool(r.activo, true),
    orden: 0,
  }));
  const usados = filas(copia, "commissionUsedRates").map((r) => {
    const original = str(r.tipo_usado) ?? "USADO";
    const subtipo = SUBTIPOS_USADO[original.trim().toLowerCase()] ?? original.trim().toUpperCase();
    const minAntiguo = num(r.min_aplicar, 1);
    return { id_plan: num(r.id_plan), subtipo, importe_primera: euroACentimos(r.importe_primera), importe_resto: euroACentimos(r.importe_resto), min_aplicar: minAntiguo <= 1 ? 0 : minAntiguo, activo: bool(r.activo, true) };
  });
  const patrones = filas(copia, "commissionVoPatterns").map((r) => {
    const tiers = parseJson(r.tiers);
    const lista = Array.isArray(tiers) ? (tiers as Fila[]) : [];
    return { id_plan: num(r.id_plan), nombre: str(r.nombre) ?? "Patrón", aplica_a_vn: bool(r.aplica_a_vn), activo: bool(r.activo, true), tiers: lista.map((t, i) => ({ unidad: num(t.unidad, i + 1), importe: euroACentimos(t.importe) })) };
  });
  const financiacion = filas(copia, "commissionFinanceRates").map((r) => ({ id_plan: num(r.id_plan), id_marca: num(r.id_marca), tipo_financiacion: categoriaTipoVenta(str(r.tipo_financiacion) ?? ""), importe: euroACentimos(r.importe) }));
  const preference = filas(copia, "commissionPreferenceRules").map((r) => ({ id_plan: num(r.id_plan), nombre: str(r.nombre), id_marca: numNull(r.id_marca), id_modelo: numNull(r.id_modelo), tipo_financiacion: null, importe: euroACentimos(r.importe), activa: bool(r.activa, true) }));
  const tasas = filas(copia, "commissionBrandInterventionRates").map((r) => ({ id_plan: num(r.id_plan), id_marca: num(r.id_marca), tipo_tasa: str(r.tipo_tasa) === "unidades" ? "unidades" : "porcentaje", objetivo: num(r.tasa_intervencion, 70), puntos_defecto: Math.round(num(r.valor_objetivo_defecto, 1) * 100) }));

  const convertirRegla = (r: Fila, esBonus: boolean): Fila | null => {
    const evento = EVENTOS[String(r.tipo_evento ?? "").toLowerCase()];
    if (!evento) return null;
    const tasa = r.tasa_intervencion_cumplida;
    return {
      id_plan: num(r.id_plan),
      nombre: str(r.nombre) ?? "Regla",
      evento,
      tipo_vehiculo: esBonus ? (str(r.tipo_vehiculo) ?? "cualquiera") : "cualquiera",
      fecha_inicio: esBonus ? fecha(r.fecha_inicio) : null,
      fecha_fin: esBonus ? fecha(r.fecha_fin) : null,
      id_marca: numNull(r.id_marca),
      id_modelo: numNull(r.id_modelo),
      tasa_intervencion: tasa === true ? "cumplida" : tasa === false ? "no_cumplida" : "indiferente",
      puntos: bool(r.afecta_objetivo) ? Math.round(num(r.valor_objetivo) * 100) : 0,
      importe: esBonus ? euroACentimos(r.importe) : bool(r.afecta_comision, true) ? euroACentimos(r.importe) : 0,
      es_penalizacion: esBonus ? bool(r.es_penalizacion) : false,
      ligar_a_credito: esBonus ? false : bool(r.ligar_a_credito),
      activa: bool(esBonus ? r.activo : r.activa, true),
    };
  };
  const reglas = filas(copia, "commissionRules").map((r) => convertirRegla(r, false)).filter((r): r is Fila => r !== null);
  const bonus = filas(copia, "commissionBonusRules").map((r) => convertirRegla(r, true)).filter((r): r is Fila => r !== null);

  const planesConvertidos = planes.map((p) => ({
    id_plan: num(p.id_plan),
    nombre: str(p.nombre) ?? `Plan ${num(p.id_plan)}`,
    fecha_inicio: fecha(p.fecha_inicio),
    fecha_fin: fecha(p.fecha_fin),
    estado: ["borrador", "activo", "cerrado"].includes(String(p.estado)) ? String(p.estado) : "activo",
    puntos_por_pedido: 0,
    penalizacion_importe: Math.round(num(p.penalizacion_importe) * 100),
    penalizacion_titulo: str(p.penalizacion_titulo),
    penalizacion_descripcion: str(p.penalizacion_descripcion),
    notas: [str(p.notas_adicionales), num(p.min_matriculaciones) > 0 ? `[Histórico] Mínimo de matriculaciones del plan antiguo: ${num(p.min_matriculaciones)} (ya no se usa).` : null].filter((x) => x !== null).join("\n\n") || null,
  }));

  // Liquidaciones antiguas → cerradas por vendedor y mes
  const lineasAntiguas = filas(copia, "commissionLiquidationLines");
  const itemsAntiguos = filas(copia, "commissionLiquidationLineItems");
  const liquidaciones: DatosConvertidos["liquidaciones"] = [];
  for (const l of filas(copia, "commissionLiquidations")) {
    const idLiq = num(l.id_liquidation);
    const plan = planes.find((p) => num(p.id_plan) === num(l.id_plan));
    if (!plan) {
      avisos.push(`Liquidación ${idLiq}: su plan ${num(l.id_plan)} no existe en la copia; se omite.`);
      continue;
    }
    const lineas = lineasAntiguas.filter((x) => num(x.id_liquidation) === idLiq);
    const porVendedor = new Map<number | null, Fila[]>();
    for (const x of lineas) {
      const u = idNuevoPorNombre(str(x.vendedor_nombre));
      porVendedor.set(u, [...(porVendedor.get(u) ?? []), x]);
    }
    if (porVendedor.size === 0) porVendedor.set(null, []);
    const principal = [...porVendedor.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
    if (porVendedor.size > 1) avisos.push(`Liquidación ${idLiq}: tiene líneas de varios vendedores; la penalización del plan se asigna al de más líneas.`);
    for (const [u, ls] of porVendedor) {
      const bruto = ls.reduce((s, x) => s + num(x.total_generado), 0) * 100;
      const penalizacion = u === principal ? Math.round(num(l.penalizacion_importe_snapshot) * 100) : 0;
      liquidaciones.push({
        usuarioAntiguo: u,
        cab: {
          id_plan: num(l.id_plan),
          mes: mesDe(fecha(plan.fecha_inicio)),
          estado: "cerrada",
          objetivo_x: Math.round(num(l.x_calculado_snapshot) * 100),
          puntos_mes: Math.round(num(l.total_computables_snapshot) * 100),
          tramo: tramoDeTexto(l.tramo_alcanzado_snapshot),
          bruto,
          penalizacion,
          neto: Math.max(0, bruto - penalizacion),
          calculada_en: fecha(l.fecha_calculo),
        },
        lineas: ls.map((x) => ({
          fila: {
            id_expediente: numNull(x.id_expediente),
            clase: "VN",
            mes_computo: null,
            cuenta: bool(x.entra_por_matriculacion),
            unidades: bool(x.entra_por_matriculacion) ? 1 : 0,
            puntos: Math.round(num(x.valor_para_objetivo) * 100),
            importe: Math.round(num(x.total_generado) * 100),
          },
          items: construirItems(x, itemsAntiguos.filter((i) => num(i.id_line) === num(x.id_line))),
        })),
      });
    }
  }

  return {
    usuariosNuevos,
    mapaUsuarios: mapa,
    tiendas: filas(copia, "tiendas"),
    marcas: filas(copia, "marcas"),
    modelos: filas(copia, "modelos"),
    tiposVenta: tipos.map((t) => ({ ...t, categoria: categoriaTipoVenta(str(t.nombre_tipo_venta) ?? "") })),
    estados: estados.map((e) => ({ ...e, clase: e._clase.clase, subtipo_vo: e._clase.subtipo })),
    clientes: filas(copia, "clientes"),
    emailsClientes: filas(copia, "emailsClientes"),
    telefonosClientes: filas(copia, "telefonosClientes"),
    expedientes: expedientesFinales,
    usuariosTiendas: filas(copia, "usuariosTiendas"),
    planes: planesConvertidos,
    planVendedores,
    promociones,
    tarifas,
    usados,
    patrones,
    financiacion,
    preference,
    reglas,
    bonus,
    tasas,
    liquidaciones,
    importBloques: filas(copia, "importacionesBloques"),
    importRegistros: filas(copia, "importacionesRegistros"),
    avisos,
  };
}

function convertirConceptos(texto: unknown, idExpediente: number, avisos: string[]): ConceptoEspecial[] {
  if (texto === null || texto === undefined || texto === "") return [];
  const j = parseJson(texto);
  if (!Array.isArray(j)) {
    avisos.push(`Expediente ${idExpediente}: «conceptos adicionales» no se pudo interpretar y se omite.`);
    return [];
  }
  return (j as Fila[]).map((c) => ({
    titulo: str(c.titulo) ?? str(c.concepto) ?? str(c.nombre) ?? "Concepto",
    importe_centimos: euroACentimos(c.importe ?? c.cantidad),
    descripcion: str(c.descripcion) ?? "",
    evento: "matriculacion" as const,
    cobrado: bool(c.cobrado),
  }));
}

function construirItems(linea: Fila, itemsTabla: Fila[]): Fila[] {
  if (itemsTabla.length > 0) {
    return itemsTabla.map((i, orden) => ({ orden, concepto: "antiguo", descripcion: str(i.concepto) ?? "Concepto", importe: Math.round(num(i.importe) * 100), puntos: bool(i.afecta_objetivo) ? Math.round(num(i.valor_objetivo) * 100) : 0 }));
  }
  const piezas: [string, number][] = [
    ["Comisión del coche", num(linea.comision_base_vn) || num(linea.comision_base)],
    ["Comisión usado", num(linea.comision_usado)],
    ["Incentivo de financiación", num(linea.comision_financiacion)],
    ["Preference / BOX3", num(linea.comision_preference)],
    ["Bonus", num(linea.bonus_acumulado)],
  ];
  return piezas.filter(([, v]) => v !== 0).map(([descripcion, v], orden) => ({ orden, concepto: "antiguo", descripcion, importe: Math.round(v * 100), puntos: 0 }));
}

/* ------------------------------------------------------------------ */
/* Aplicación en la base de datos                                      */
/* ------------------------------------------------------------------ */

export interface ResultadoMigracion {
  expedientes: number;
  clientes: number;
  planes: number;
  promociones: number;
  liquidaciones: number;
  usuariosCreados: number;
  /** Solo en modo «añadir»: clientes que ya existían (mismo DNI o nombre) y se reutilizan, y expedientes omitidos por estar ya. */
  clientesReutilizados?: number;
  expedientesOmitidos?: number;
  avisos: string[];
}

export { SECCIONES_V1, type SeccionV1 };

export const esquemaConvertirV1 = z.object({
  copia: esquemaCopiaV1,
  confirmacion: z.string(),
  secciones: z.array(z.enum(SECCIONES_V1)).min(1).default([...SECCIONES_V1]),
  /** «anadir»: conserva lo que ya hay y añade lo nuevo; «sustituir»: borra los datos actuales y carga la copia. */
  modo: z.enum(["anadir", "sustituir"]).default("sustituir"),
});

export { SECCIONES_AL_ANADIR };

/** Dependencias entre partes: no se puede cargar una sin las que referencia. */
export function comprobarSecciones(secciones: readonly SeccionV1[]): void {
  const s = new Set(secciones);
  if (s.has("expedientes") && !s.has("catalogos")) throw new HttpError(400, "Los expedientes necesitan los catálogos (tiendas, marcas, modelos, pagos y estados).");
  if (s.has("comisiones") && !s.has("catalogos")) throw new HttpError(400, "Los planes de comisiones necesitan los catálogos (marcas y modelos).");
  if (s.has("liquidaciones") && !s.has("comisiones")) throw new HttpError(400, "Las liquidaciones antiguas necesitan los planes de comisiones.");
}

const lotes = <T>(lista: T[], tamano = 500): T[][] => {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) r.push(lista.slice(i, i + tamano));
  return r;
};

async function arreglarSecuencia(tx: Ejecutor, tabla: string, columna: string): Promise<void> {
  await tx.execute(sql.raw(`select setval(pg_get_serial_sequence('${tabla}', '${columna}'), greatest((select coalesce(max(${columna}), 0) from ${tabla}), 1), (select count(*) > 0 from ${tabla}))`));
}

/** Convierte y carga la copia antigua. Sustituye los datos operativos actuales; conserva las cuentas de acceso. */
export async function convertirCopiaV1(ej: Ejecutor, idAdmin: number, entrada: z.input<typeof esquemaConvertirV1>): Promise<ResultadoMigracion> {
  if (entrada.confirmacion.trim() !== "CONVERTIR") throw new HttpError(400, "Escribe CONVERTIR para confirmar");
  const modo = entrada.modo ?? "sustituir";
  const secciones = entrada.secciones ?? (modo === "anadir" ? [...SECCIONES_AL_ANADIR] : [...SECCIONES_V1]);
  comprobarSecciones(secciones);
  if (modo === "anadir") {
    const noPermitidas = secciones.filter((x) => !SECCIONES_AL_ANADIR.includes(x));
    if (noPermitidas.length > 0) throw new HttpError(400, "Al añadir solo se pueden importar catálogos, clientes y expedientes. Los planes de comisiones, las liquidaciones y el historial solo se cargan sustituyendo.");
    return anadirCopiaV1(ej, idAdmin, entrada.copia, new Set(secciones));
  }
  const sel = new Set<SeccionV1>(secciones);
  return ej.transaction(async (tx) => {
    const actuales = (await tx.select({ id: usuarios.idUsuario, nombre: usuarios.nombre }).from(usuarios)).map((u) => ({ id: u.id, nombre: u.nombre }));
    const datos = transformarCopiaV1(entrada.copia, { actuales, idAdmin });

    // Cuentas nuevas (bloqueadas, sin acceso) para los usuarios antiguos sin equivalente
    const hashInutil = await hashPassword(randomBytes(24).toString("base64url"));
    if (!sel.has("expedientes") && !sel.has("comisiones") && !sel.has("liquidaciones")) datos.usuariosNuevos.length = 0;
    for (const u of datos.usuariosNuevos) {
      const [c] = await tx
        .insert(usuarios)
        .values({ loginEmail: `migrado-${u.idAntiguo}-${randomBytes(3).toString("hex")}@invalid.local`, passwordHash: hashInutil, nombre: u.nombre, rol: u.rol, tipoVendedor: u.tipoVendedor, patronVo: u.patronVo, bloqueado: true, fechaDeRegistro: new Date().toISOString().slice(0, 10) })
        .returning({ id: usuarios.idUsuario });
      datos.mapaUsuarios.set(u.idAntiguo, c.id);
    }
    const usuarioNuevo = (idAntiguo: number | null): number => (idAntiguo === null ? idAdmin : (datos.mapaUsuarios.get(idAntiguo) ?? idAdmin));

    // Vaciado de datos operativos (TRUNCATE no activa los disparadores de protección)
    await tx.execute(sql.raw("truncate table adjuntos, rejillas, validaciones_comision, libro_puntos, pendientes_cobro, commission_liquidation_versions, commission_liquidation_line_items, commission_liquidation_lines, commission_liquidations, commission_plans restart identity cascade"));
    await tx.delete(importacionesRegistros);
    await tx.delete(importacionesBloques);
    await tx.delete(expedientes);
    await tx.delete(telefonosClientes);
    await tx.delete(emailsClientes);
    await tx.delete(clientes);
    await tx.delete(modelos);
    await tx.delete(marcas);
    await tx.delete(tipoDeVenta);
    await tx.delete(estadoVehiculo);
    await tx.delete(usuariosTiendas);
    await tx.delete(tiendas);

    const ins = async <T extends object>(tabla: Parameters<typeof tx.insert>[0], f: T[]) => {
      for (const l of lotes(f)) await tx.insert(tabla).values(l as never);
    };

    if (sel.has("catalogos")) {
    await ins(tiendas, datos.tiendas.map((t) => ({ idTienda: num(t.id_tienda), nombre: str(t.nombre) ?? "Tienda", ciudad: str(t.ciudad) })));
    await ins(marcas, datos.marcas.map((m) => ({ idMarca: num(m.id_marca), nombre: str(m.nombre) ?? "Marca", activo: bool(m.activo, true), accesoRapido: bool(m.acceso_rapido), sistemaComisiones: bool(m.sistema_comisiones) })));
    await ins(modelos, datos.modelos.map((m) => ({ idModelo: num(m.id_modelo), marcaId: numNull(m.marca_id), nombreModelo: str(m.nombre_modelo) ?? "Modelo", accesoRapido: bool(m.acceso_rapido), ordenAccesoRapido: num(m.orden_acceso_rapido) })));
    await ins(tipoDeVenta, datos.tiposVenta.map((t) => ({ idTipoDeVenta: num(t.id_tipo_de_venta), nombreTipoVenta: str(t.nombre_tipo_venta) ?? "Tipo", color: str(t.color) ?? "#3b82f6", orden: num(t.orden), categoria: String(t.categoria), requiereRciAlMatricular: ["CREDITO", "PREFERENCE", "RENTING"].includes(String(t.categoria)) })));
    await ins(estadoVehiculo, datos.estados.map((e) => ({ idEstadoVehiculo: num(e.id_estado_vehiculo), nombreEstadoVehiculo: str(e.nombre_estado_vehiculo) ?? "Estado", predeterminado: bool(e.predeterminado), clase: String(e.clase), subtipoVo: (e.subtipo_vo as string | null) ?? null })));
    }
    if (sel.has("clientes")) {
    await ins(clientes, datos.clientes.map((c) => ({ id: num(c.id), clienteId: str(c.cliente_id) ?? `migrado-${num(c.id)}`, dni: str(c.dni), nombre: str(c.nombre), fechaDeNacimiento: fecha(c.fecha_de_nacimiento), tiendaId: sel.has("catalogos") ? numNull(c.tienda_id) : null })));
    await ins(emailsClientes, datos.emailsClientes.map((e) => ({ idEmailCliente: num(e.id_email_cliente), idCliente: numNull(e.id_cliente), email: str(e.email) ?? "", tipoEmail: str(e.tipo_email) })));
    await ins(telefonosClientes, datos.telefonosClientes.map((t) => ({ idTelefonoCliente: num(t.id_telefono_cliente), idCliente: numNull(t.id_cliente), telefono: str(t.telefono) ?? "", tipoTelefono: str(t.tipo_telefono) })));
    }
    if (sel.has("catalogos")) await ins(usuariosTiendas, datos.usuariosTiendas.flatMap((u) => {
      const idNuevo = datos.mapaUsuarios.get(num(u.id_usuario));
      return idNuevo ? [{ idUsuarioTienda: num(u.id_usuario_tienda), idUsuario: idNuevo, idTienda: num(u.id_tienda) }] : [];
    }));

    // Planes y todo lo que cuelga de ellos (antes que los expedientes: las promociones los referencian)
    if (sel.has("comisiones")) {
    await ins(commissionPlans, datos.planes.map((p) => ({ idPlan: num(p.id_plan), nombre: String(p.nombre), fechaInicio: String(p.fecha_inicio ?? "2000-01-01"), fechaFin: String(p.fecha_fin ?? "2000-01-31"), estado: String(p.estado), puntosPorPedido: 0, penalizacionImporte: num(p.penalizacion_importe), penalizacionTitulo: str(p.penalizacion_titulo), penalizacionDescripcion: str(p.penalizacion_descripcion), notas: str(p.notas) })));
    const vistos = new Set<string>();
    await ins(commissionPlanVendedores, datos.planVendedores.flatMap((v) => {
      const id = usuarioNuevo(v.idUsuarioAntiguo);
      const k = `${v.idPlan}|${id}`;
      if (vistos.has(k)) return [];
      vistos.add(k);
      return [{ idPlan: v.idPlan, idUsuario: id, objetivoBase: v.objetivoBase, arrastre: v.arrastre }];
    }));
    await ins(promocionesPuntos, datos.promociones.map((p) => ({ id: num(p.id), idPlan: num(p.id_plan), nombre: String(p.nombre), puntosEspeciales: num(p.puntos_especiales), minimoUnidades: num(p.minimo_unidades), puntosSiNoCumple: num(p.puntos_si_no_cumple) })));
    const modeloExiste = new Set(datos.modelos.map((m) => num(m.id_modelo)));
    const marcaExiste = new Set(datos.marcas.map((m) => num(m.id_marca)));
    await ins(commissionPlanModelRates, datos.tarifas.filter((t) => modeloExiste.has(num(t.id_modelo))).map((t) => ({ idPlan: num(t.id_plan), idModelo: num(t.id_modelo), tasaCumplida: Boolean(t.tasa_cumplida), importes: t.importes as Record<string, number>, activo: Boolean(t.activo), orden: 0 })));
    await ins(commissionUsedRates, datos.usados.map((u) => ({ idPlan: num(u.id_plan), subtipo: String(u.subtipo).slice(0, 30), importePrimera: num(u.importe_primera), importeResto: num(u.importe_resto), minAplicar: num(u.min_aplicar), activo: Boolean(u.activo) })));
    await ins(commissionVoPatterns, datos.patrones.map((p) => ({ idPlan: num(p.id_plan), nombre: String(p.nombre), aplicaAVn: Boolean(p.aplica_a_vn), activo: Boolean(p.activo), tiers: p.tiers as { unidad: number; importe: number }[] })));
    await ins(commissionFinanceRates, datos.financiacion.filter((f) => marcaExiste.has(num(f.id_marca))).map((f) => ({ idPlan: num(f.id_plan), idMarca: num(f.id_marca), tipoFinanciacion: String(f.tipo_financiacion), importe: num(f.importe) })));
    await ins(commissionPreferenceRules, datos.preference.map((r) => ({ idPlan: num(r.id_plan), nombre: str(r.nombre), idMarca: numNull(r.id_marca), idModelo: numNull(r.id_modelo), tipoFinanciacion: null, importe: num(r.importe), activa: Boolean(r.activa) })));
    const reglaDb = (r: Fila) => ({ idPlan: num(r.id_plan), nombre: String(r.nombre), evento: String(r.evento), tipoVehiculo: String(r.tipo_vehiculo), fechaInicio: (r.fecha_inicio as string | null) ?? null, fechaFin: (r.fecha_fin as string | null) ?? null, idMarca: numNull(r.id_marca), idModelo: numNull(r.id_modelo), tasaIntervencion: String(r.tasa_intervencion), puntos: num(r.puntos), importe: num(r.importe), esPenalizacion: Boolean(r.es_penalizacion), ligarACredito: Boolean(r.ligar_a_credito), activa: Boolean(r.activa) });
    await ins(commissionRules, datos.reglas.map(reglaDb));
    await ins(commissionBonusRules, datos.bonus.map(reglaDb));
    await ins(commissionBrandInterventionRates, datos.tasas.filter((t) => marcaExiste.has(num(t.id_marca))).map((t) => ({ idPlan: num(t.id_plan), idMarca: num(t.id_marca), tipoTasa: String(t.tipo_tasa), objetivo: num(t.objetivo), puntosDefecto: num(t.puntos_defecto) })));

    }
    const expExiste = new Set(sel.has("expedientes") ? datos.expedientes.map((e) => num(e.id_expediente)) : []);
    if (sel.has("expedientes")) await ins(expedientes, datos.expedientes.map((e) => ({
      idExpediente: num(e.id_expediente),
      idUsuario: usuarioNuevo(e._usuarioAntiguo),
      idCliente: sel.has("clientes") ? numNull(e.id_cliente) : null,
      idModelo: numNull(e.id_modelo),
      idTienda: numNull(e.id_tienda),
      fechaExpediente: fecha(e.fecha_expediente),
      fechaAfectacion: fecha(e.fecha_afectacion),
      fechaMatriculacion: fecha(e.fecha_matriculacion),
      fechaEntrega: fecha(e.fecha_entrega),
      fechaRci: fecha(e.fecha_rci),
      fechaFacturacion: fecha(e.fecha_facturacion),
      matricula: str(e.matricula),
      idTipoDeVenta: numNull(e.id_tipo_de_venta),
      idEstadoVehiculo: numNull(e.id_estado_vehiculo),
      vin: str(e.vin),
      cobradoOtraFecha: bool(e.cobrado_otra_fecha),
      fechaCobrado: (e.fecha_cobrado_nuevo as string | null) ?? null,
      comisionCobrada: bool(e.comision_cobrada),
      comisionCocheCobrada: bool(e.comision_coche_cobrada),
      comisionUsadoCobrada: bool(e.comision_usado_cobrada),
      comisionFinanciacionCobrada: bool(e.comision_financiacion_cobrada),
      comisionPreferenceCobrada: bool(e.comision_preference_cobrada),
      comisionBonusCobrada: bool(e.comision_bonus_cobrada),
      puntos: (e.puntos_nuevo as number | null) ?? null,
      idPromocion: sel.has("comisiones") ? (e.id_promocion_nuevo ?? null) : null,
      comisionCocheManual: (e.manual_coche as number | null) ?? null,
      comisionFinanciacionManual: (e.manual_fin as number | null) ?? null,
      conceptosEspeciales: e.conceptos,
      valorObjetivo: numNull(e.valor_objetivo),
      minCochesMultiplicador: num(e.min_coches_multiplicador),
      comisionCocheReal: numNull(e.comision_coche_real),
      comisionFinanciacionReal: numNull(e.comision_financiacion_real),
      conceptosAdicionales: str(e.conceptos_adicionales),
    })));
    if (sel.has("historial")) {
    await ins(importacionesBloques, datos.importBloques.map((b) => ({ id: num(b.id), fecha: str(b.fecha) ?? "", nombreArchivo: str(b.nombre_archivo) ?? "", tipoArchivo: str(b.tipo_archivo) ?? "", usuarioId: null, creados: num(b.creados), modificados: num(b.modificados), omitidos: num(b.omitidos) })));
    await ins(importacionesRegistros, datos.importRegistros.map((r) => ({ id: num(r.id), bloqueId: num(r.bloque_id), idExpediente: numNull(r.id_expediente) && expExiste.has(num(r.id_expediente)) ? num(r.id_expediente) : null, tipoAccion: str(r.tipo_accion) ?? "", clienteNombre: str(r.cliente_nombre) ?? "", matricula: str(r.matricula), bastidor: str(r.bastidor), cambios: str(r.cambios) })));
    }

    // Liquidaciones antiguas: cerradas y de solo lectura
    await tx.execute(sql`select set_config('app.recalculo', 'on', true)`);
    let nLiq = 0;
    for (const l of sel.has("liquidaciones") ? datos.liquidaciones : []) {
      const idUsuario = usuarioNuevo(l.usuarioAntiguo);
      const mes = String(l.cab.mes ?? "");
      if (!/^\d{4}-\d{2}$/.test(mes)) continue;
      const [yy, mm] = mes.split("-").map(Number);
      const mesPago = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}`;
      const [liq] = await tx
        .insert(commissionLiquidations)
        .values({ idPlan: num(l.cab.id_plan), idUsuario, mes, estado: "cerrada", version: 1, objetivoX: num(l.cab.objetivo_x), puntosMes: num(l.cab.puntos_mes), tramo: num(l.cab.tramo), bruto: num(l.cab.bruto), penalizacion: num(l.cab.penalizacion), neto: num(l.cab.neto), mesPago, origen: "importada_antigua", calculadaEn: l.cab.calculada_en ? new Date(String(l.cab.calculada_en)) : new Date() })
        .onConflictDoNothing()
        .returning({ id: commissionLiquidations.idLiquidation });
      if (!liq) continue;
      nLiq++;
      for (const linea of l.lineas) {
        const [fila] = await tx
          .insert(commissionLiquidationLines)
          .values({ idLiquidation: liq.id, idExpediente: linea.fila.id_expediente !== null && expExiste.has(num(linea.fila.id_expediente)) ? num(linea.fila.id_expediente) : null, clase: String(linea.fila.clase), mesComputo: null, cuenta: Boolean(linea.fila.cuenta), unidades: num(linea.fila.unidades), puntos: num(linea.fila.puntos), importe: num(linea.fila.importe) })
          .returning({ id: commissionLiquidationLines.idLine });
        if (linea.items.length) await tx.insert(commissionLiquidationLineItems).values(linea.items.map((i) => ({ idLine: fila.id, orden: num(i.orden), concepto: String(i.concepto), descripcion: String(i.descripcion), importe: num(i.importe), puntos: num(i.puntos) })));
      }
    }

    // Secuencias tras cargar con ids explícitos
    for (const [tabla, col] of [["tiendas", "id_tienda"], ["marcas", "id_marca"], ["modelos", "id_modelo"], ["tipo_de_venta", "id_tipo_de_venta"], ["estado_vehiculo", "id_estado_vehiculo"], ["clientes", "id"], ["emails_clientes", "id_email_cliente"], ["telefonos_clientes", "id_telefono_cliente"], ["usuarios_tiendas", "id_usuario_tienda"], ["expedientes", "id_expediente"], ["importaciones_bloques", "id"], ["importaciones_registros", "id"], ["commission_plans", "id_plan"], ["promociones_puntos", "id"]] as const) {
      await arreglarSecuencia(tx, tabla, col);
    }

    return {
      expedientes: sel.has("expedientes") ? datos.expedientes.length : 0,
      clientes: sel.has("clientes") ? datos.clientes.length : 0,
      planes: sel.has("comisiones") ? datos.planes.length : 0,
      promociones: sel.has("comisiones") ? datos.promociones.length : 0,
      liquidaciones: nLiq,
      usuariosCreados: datos.usuariosNuevos.length,
      avisos: datos.avisos,
    };
  });
}

/** Minúsculas y sin espacios sobrantes, para comparar nombres. */
const minus = (v: unknown): string => (typeof v === "string" ? v.trim().toLowerCase() : "");
const normalizarMatricula = (v: unknown): string => (typeof v === "string" ? v.toUpperCase().replace(/[\s-]/g, "") : "");

/**
 * Importación «añadir»: no borra nada. Los catálogos se emparejan por nombre (se crean los que faltan), los clientes por DNI
 * o nombre (se reutilizan los que ya están) y los expedientes se omiten si ya existe uno con la misma matrícula. Todo recibe
 * identificadores nuevos, así que no choca con lo que ya hay. Es repetible: una segunda pasada no añade nada.
 */
async function anadirCopiaV1(ej: Ejecutor, idAdmin: number, copia: CopiaV1, sel: Set<SeccionV1>): Promise<ResultadoMigracion> {
  const { valor, recalculos } = await conRecalculo(ej, [], "Importación de la copia antigua (añadir)", async (tx) => {
    const actuales = (await tx.select({ id: usuarios.idUsuario, nombre: usuarios.nombre }).from(usuarios)).map((u) => ({ id: u.id, nombre: u.nombre }));
    const datos = transformarCopiaV1(copia, { actuales, idAdmin });

    if (!sel.has("expedientes")) datos.usuariosNuevos.length = 0;
    const hashInutil = await hashPassword(randomBytes(24).toString("base64url"));
    for (const u of datos.usuariosNuevos) {
      const [cuenta] = await tx
        .insert(usuarios)
        .values({ loginEmail: `migrado-${u.idAntiguo}-${randomBytes(3).toString("hex")}@invalid.local`, passwordHash: hashInutil, nombre: u.nombre, rol: u.rol, tipoVendedor: u.tipoVendedor, patronVo: u.patronVo, bloqueado: true, fechaDeRegistro: new Date().toISOString().slice(0, 10) })
        .returning({ id: usuarios.idUsuario });
      datos.mapaUsuarios.set(u.idAntiguo, cuenta.id);
    }
    const usuarioNuevo = (idAntiguo: number | null): number => (idAntiguo === null ? idAdmin : (datos.mapaUsuarios.get(idAntiguo) ?? idAdmin));

    const mTienda = new Map<number, number>();
    const mMarca = new Map<number, number>();
    const mModelo = new Map<number, number>();
    const mTipo = new Map<number, number>();
    const mEstado = new Map<number, number>();
    const mCliente = new Map<number, number>();
    const nuevosClientes = new Set<number>();
    let reutilizados = 0;
    let omitidos = 0;

    if (sel.has("catalogos")) {
      const ts = await tx.select().from(tiendas).where(isNull(tiendas.eliminadoEn));
      for (const t of datos.tiendas) {
        const nombre = str(t.nombre) ?? "Tienda";
        let ex = ts.find((x) => minus(x.nombre) === minus(nombre));
        if (!ex) {
          [ex] = await tx.insert(tiendas).values({ nombre, ciudad: str(t.ciudad) }).returning();
          ts.push(ex);
        }
        mTienda.set(num(t.id_tienda), ex.idTienda);
      }
      const ms = await tx.select().from(marcas).where(isNull(marcas.eliminadoEn));
      for (const m of datos.marcas) {
        const nombre = str(m.nombre) ?? "Marca";
        let ex = ms.find((x) => minus(x.nombre) === minus(nombre));
        if (!ex) {
          [ex] = await tx.insert(marcas).values({ nombre, activo: bool(m.activo, true), accesoRapido: bool(m.acceso_rapido), sistemaComisiones: bool(m.sistema_comisiones) }).returning();
          ms.push(ex);
        }
        mMarca.set(num(m.id_marca), ex.idMarca);
      }
      const mos = await tx.select().from(modelos).where(isNull(modelos.eliminadoEn));
      for (const m of datos.modelos) {
        const marcaNueva = numNull(m.marca_id) === null ? null : (mMarca.get(num(m.marca_id)) ?? null);
        const nombre = str(m.nombre_modelo) ?? "Modelo";
        let ex = mos.find((x) => x.marcaId === marcaNueva && minus(x.nombreModelo) === minus(nombre));
        if (!ex) {
          [ex] = await tx.insert(modelos).values({ marcaId: marcaNueva, nombreModelo: nombre, accesoRapido: bool(m.acceso_rapido), ordenAccesoRapido: num(m.orden_acceso_rapido) }).returning();
          mos.push(ex);
        }
        mModelo.set(num(m.id_modelo), ex.idModelo);
      }
      const tvs = await tx.select().from(tipoDeVenta).where(isNull(tipoDeVenta.eliminadoEn));
      for (const t of datos.tiposVenta) {
        const nombre = str(t.nombre_tipo_venta) ?? "Tipo";
        let ex = tvs.find((x) => minus(x.nombreTipoVenta) === minus(nombre));
        if (!ex) {
          const categoria = String(t.categoria);
          [ex] = await tx.insert(tipoDeVenta).values({ nombreTipoVenta: nombre, color: str(t.color) ?? "#3b82f6", orden: num(t.orden), categoria, requiereRciAlMatricular: ["CREDITO", "PREFERENCE", "RENTING"].includes(categoria) }).returning();
          tvs.push(ex);
        }
        mTipo.set(num(t.id_tipo_de_venta), ex.idTipoDeVenta);
      }
      const evs = await tx.select().from(estadoVehiculo).where(isNull(estadoVehiculo.eliminadoEn));
      for (const e of datos.estados) {
        const nombre = str(e.nombre_estado_vehiculo) ?? "Estado";
        let ex = evs.find((x) => minus(x.nombreEstadoVehiculo) === minus(nombre));
        if (!ex) {
          [ex] = await tx.insert(estadoVehiculo).values({ nombreEstadoVehiculo: nombre, predeterminado: false, clase: String(e.clase), subtipoVo: (e.subtipo_vo as string | null) ?? null }).returning();
          evs.push(ex);
        }
        mEstado.set(num(e.id_estado_vehiculo), ex.idEstadoVehiculo);
      }
    }

    if (sel.has("clientes")) {
      const existentes = await tx.select({ id: clientes.id, dni: clientes.dni, nombre: clientes.nombre }).from(clientes).where(isNull(clientes.eliminadoEn));
      const porDni = new Map(existentes.filter((x) => minus(x.dni)).map((x) => [minus(x.dni), x.id]));
      const porNombre = new Map(existentes.filter((x) => minus(x.nombre)).map((x) => [minus(x.nombre), x.id]));
      for (const cl of datos.clientes) {
        const dni = str(cl.dni);
        const nombre = str(cl.nombre);
        const idExistente = (dni ? porDni.get(minus(dni)) : undefined) ?? (nombre ? porNombre.get(minus(nombre)) : undefined);
        if (idExistente) {
          reutilizados++;
          mCliente.set(num(cl.id), idExistente);
          continue;
        }
        const [nuevo] = await tx
          .insert(clientes)
          .values({ clienteId: `migrado-${randomBytes(5).toString("hex")}`, dni, nombre, fechaDeNacimiento: fecha(cl.fecha_de_nacimiento), tiendaId: sel.has("catalogos") ? (mTienda.get(num(cl.tienda_id)) ?? null) : null })
          .returning({ id: clientes.id });
        mCliente.set(num(cl.id), nuevo.id);
        nuevosClientes.add(num(cl.id));
        if (dni) porDni.set(minus(dni), nuevo.id);
        if (nombre) porNombre.set(minus(nombre), nuevo.id);
      }
      for (const e of datos.emailsClientes) {
        if (nuevosClientes.has(num(e.id_cliente))) await tx.insert(emailsClientes).values({ idCliente: mCliente.get(num(e.id_cliente)) as number, email: str(e.email) ?? "", tipoEmail: str(e.tipo_email) });
      }
      for (const t of datos.telefonosClientes) {
        if (nuevosClientes.has(num(t.id_cliente))) await tx.insert(telefonosClientes).values({ idCliente: mCliente.get(num(t.id_cliente)) as number, telefono: str(t.telefono) ?? "", tipoTelefono: str(t.tipo_telefono) });
      }
    }

    const idsNuevos: number[] = [];
    if (sel.has("expedientes")) {
      const ya = await tx.select({ id: expedientes.idExpediente, matricula: expedientes.matricula, cliente: expedientes.idCliente, fecha: expedientes.fechaExpediente, modelo: expedientes.idModelo }).from(expedientes).where(and(isNull(expedientes.eliminadoEn)));
      const matriculas = new Set(ya.map((x) => normalizarMatricula(x.matricula)).filter(Boolean));
      const claves = new Set(ya.map((x) => `${x.cliente ?? ""}|${x.fecha ?? ""}|${x.modelo ?? ""}`));
      for (const lote of lotes(datos.expedientes)) {
        const filas: (typeof expedientes.$inferInsert)[] = [];
        for (const e of lote) {
          const matricula = normalizarMatricula(e.matricula);
          const idCliente = mCliente.get(num(e.id_cliente)) ?? null;
          const idModelo = mModelo.get(num(e.id_modelo)) ?? null;
          const clave = `${idCliente ?? ""}|${fecha(e.fecha_expediente) ?? ""}|${idModelo ?? ""}`;
          if ((matricula && matriculas.has(matricula)) || (!matricula && claves.has(clave))) {
            omitidos++;
            continue;
          }
          if (matricula) matriculas.add(matricula);
          filas.push({
            idUsuario: usuarioNuevo(e._usuarioAntiguo as number | null),
            idCliente,
            idModelo,
            idTienda: mTienda.get(num(e.id_tienda)) ?? null,
            fechaExpediente: fecha(e.fecha_expediente),
            fechaAfectacion: fecha(e.fecha_afectacion),
            fechaMatriculacion: fecha(e.fecha_matriculacion),
            fechaEntrega: fecha(e.fecha_entrega),
            fechaRci: fecha(e.fecha_rci),
            fechaFacturacion: fecha(e.fecha_facturacion),
            matricula: str(e.matricula),
            idTipoDeVenta: mTipo.get(num(e.id_tipo_de_venta)) ?? null,
            idEstadoVehiculo: mEstado.get(num(e.id_estado_vehiculo)) ?? null,
            vin: str(e.vin),
            cobradoOtraFecha: bool(e.cobrado_otra_fecha),
            fechaCobrado: (e.fecha_cobrado_nuevo as string | null) ?? null,
            comisionCobrada: bool(e.comision_cobrada),
            comisionCocheCobrada: bool(e.comision_coche_cobrada),
            comisionUsadoCobrada: bool(e.comision_usado_cobrada),
            comisionFinanciacionCobrada: bool(e.comision_financiacion_cobrada),
            comisionPreferenceCobrada: bool(e.comision_preference_cobrada),
            comisionBonusCobrada: bool(e.comision_bonus_cobrada),
            puntos: (e.puntos_nuevo as number | null) ?? null,
            idPromocion: null,
            comisionCocheManual: (e.manual_coche as number | null) ?? null,
            comisionFinanciacionManual: (e.manual_fin as number | null) ?? null,
            conceptosEspeciales: e.conceptos as ConceptoEspecial[],
            valorObjetivo: numNull(e.valor_objetivo),
            minCochesMultiplicador: num(e.min_coches_multiplicador),
            comisionCocheReal: numNull(e.comision_coche_real),
            comisionFinanciacionReal: numNull(e.comision_financiacion_real),
            conceptosAdicionales: str(e.conceptos_adicionales),
          });
        }
        if (filas.length > 0) idsNuevos.push(...(await tx.insert(expedientes).values(filas).returning({ id: expedientes.idExpediente })).map((r) => r.id));
      }
    }

    const resultado: ResultadoMigracion = {
      expedientes: idsNuevos.length,
      clientes: nuevosClientes.size,
      planes: 0,
      promociones: 0,
      liquidaciones: 0,
      usuariosCreados: datos.usuariosNuevos.length,
      clientesReutilizados: reutilizados,
      expedientesOmitidos: omitidos,
      avisos: datos.avisos,
    };
    return { valor: resultado, idsDespues: idsNuevos };
  });
  void recalculos;
  return valor;
}
