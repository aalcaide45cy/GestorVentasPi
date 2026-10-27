/** Filtros de la lista de expedientes: valores predefinidos y recuerdo entre recargas (se guardan en el navegador). */

export const CLAVE_FILTROS_PREDEFINIDOS = "exp-filtros-predefinidos";
export const CLAVE_RECORDAR_FILTROS = "exp-recordar-filtros";
export const CLAVE_FILTROS_GUARDADOS = "exp-filtros-guardados";

/** Valor de «Campo de Fecha» que no elige una fecha concreta: vale cualquiera de las fechas del expediente. */
export const TODAS_LAS_FECHAS = "todas";

export const TIPOS_FECHA_FILTRO = [TODAS_LAS_FECHAS, "fecha_expediente", "fecha_comisionado", "fecha_afectacion", "fecha_matriculacion", "fecha_facturacion", "fecha_entrega", "fecha_rci", "fecha_cobrado"] as const;

export interface FiltrosPredefinidos {
  soloMios: boolean;
  ocultarEntregados: boolean;
  mesActual: boolean;
  anioActual: boolean;
  tipoFecha: string;
}

export const PREDEFINIDOS_INICIALES: FiltrosPredefinidos = {
  soloMios: true,
  ocultarEntregados: false,
  mesActual: false,
  anioActual: false,
  tipoFecha: "fecha_expediente",
};

export interface FiltrosActuales {
  busqueda: string;
  ocultarEntregados: boolean;
  marca: string;
  modelo: string;
  tipo: string;
  estado: string;
  vendedor: string;
  mes: string;
  anio: string;
  tipoFecha: string;
  tienda: string;
  /** Estado de la intranet del fabricante («__sin__» = sin estado). */
  intranet: string;
  /** Apunte del expediente («__sin__» = sin apuntes). */
  apunte: string;
  /** Rango «Desde / Hasta» (AAAA-MM-DD) sobre el campo de fecha elegido. */
  desde: string;
  hasta: string;
  /** Orden de la lista: columna y sentido. */
  ordenCampo: string;
  ordenAsc: boolean;
}

export const ORDEN_INICIAL = { ordenCampo: "fecha_expediente", ordenAsc: false } as const;

function objeto(texto: string | null): Record<string, unknown> | null {
  if (!texto) return null;
  try {
    const v: unknown = JSON.parse(texto);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null; // preferencia corrupta
  }
}

const tipoFechaValido = (v: unknown): string =>
  typeof v === "string" && (TIPOS_FECHA_FILTRO as readonly string[]).includes(v) ? v : PREDEFINIDOS_INICIALES.tipoFecha;

export function leerPredefinidos(texto: string | null): FiltrosPredefinidos {
  const o = objeto(texto);
  if (!o) return PREDEFINIDOS_INICIALES;
  const bool = (v: unknown, defecto: boolean) => (typeof v === "boolean" ? v : defecto);
  return {
    soloMios: bool(o.soloMios, PREDEFINIDOS_INICIALES.soloMios),
    ocultarEntregados: bool(o.ocultarEntregados, false),
    mesActual: bool(o.mesActual, false),
    anioActual: bool(o.anioActual, false),
    tipoFecha: tipoFechaValido(o.tipoFecha),
  };
}

/** Convierte los filtros predefinidos en valores concretos de filtro para la fecha dada. */
export function aplicarPredefinidos(p: FiltrosPredefinidos, nombreUsuario: string, ahora: Date = new Date()): FiltrosActuales {
  return {
    busqueda: "",
    ocultarEntregados: p.ocultarEntregados,
    marca: "",
    modelo: "",
    tipo: "",
    estado: "",
    vendedor: p.soloMios ? nombreUsuario : "",
    mes: p.mesActual ? String(ahora.getMonth() + 1).padStart(2, "0") : "",
    anio: p.anioActual || p.mesActual ? String(ahora.getFullYear()) : "",
    tipoFecha: p.tipoFecha,
    tienda: "",
    intranet: "",
    apunte: "",
    desde: "",
    hasta: "",
    ...ORDEN_INICIAL,
  };
}

export function leerFiltrosGuardados(texto: string | null): FiltrosActuales | null {
  const o = objeto(texto);
  if (!o) return null;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    busqueda: s(o.busqueda),
    ocultarEntregados: o.ocultarEntregados === true,
    marca: s(o.marca),
    modelo: s(o.modelo),
    tipo: s(o.tipo),
    estado: s(o.estado),
    vendedor: s(o.vendedor),
    mes: s(o.mes),
    anio: s(o.anio),
    tipoFecha: tipoFechaValido(o.tipoFecha),
    tienda: s(o.tienda),
    intranet: s(o.intranet),
    apunte: s(o.apunte),
    desde: /^\d{4}-\d{2}-\d{2}$/.test(s(o.desde)) ? s(o.desde) : "",
    hasta: /^\d{4}-\d{2}-\d{2}$/.test(s(o.hasta)) ? s(o.hasta) : "",
    ordenCampo: s(o.ordenCampo) || ORDEN_INICIAL.ordenCampo,
    ordenAsc: o.ordenAsc === true,
  };
}
