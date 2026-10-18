/**
 * Contrato del motor de comisiones (sección 12.2 del informe).
 * Todo el cálculo es entero: puntos en centésimas y dinero en céntimos.
 */

/** Entero: 150 = 1,50 puntos. */
export type Centesimas = number;
/** Entero: 15000 = 150,00 €. */
export type Centimos = number;
/** `AAAA-MM`. */
export type Mes = string;
/** `AAAA-MM-DD`. */
export type Fecha = string;

export type Clase = "VN" | "VO";
export type CategoriaVenta = "CONTADO" | "CREDITO" | "PREFERENCE" | "RENTING";
export type EventoRegla = "pedido" | "afectacion" | "matriculacion" | "cobro" | "credito" | "preference";
/**
 * Fecha del expediente que decide en qué mes cuenta un concepto especial: pedido (fecha de expediente), afectación, RCI,
 * matriculación (la real), facturación, entrega o cobro. «matriculacion» es el evento principal: el mes en que cuenta el coche.
 */
export type EventoConcepto = "pedido" | "afectacion" | "rci" | "matriculacion" | "fecha_matriculacion" | "facturacion" | "entrega" | "cobro";

export interface ConceptoEspecialMotor {
  titulo: string;
  importe: Centimos;
  descripcion?: string;
  evento?: EventoConcepto;
  cobrado?: boolean;
}

export interface ExpedienteMotor {
  id: number;
  idVendedor: number;
  clase: Clase;
  subtipoVO: string | null;
  idMarca: number | null;
  idModelo: number | null;
  categoriaVenta: CategoriaVenta | null;
  /** El tipo de pago del expediente suma a la tasa de intervención. Sin valor, cuentan Crédito, Preference y Renting. */
  cuentaParaTasa?: boolean;
  fechaExpediente: Fecha | null;
  fechaAfectacion: Fecha | null;
  fechaRci: Fecha | null;
  fechaMatriculacion: Fecha | null;
  /**
   * Fecha de facturación. En un VN es el punto de comisionado: el coche cuenta en el mes de su facturación (que por defecto es
   * la de matriculación, pero se puede cambiar a mano). Sin facturación, cuenta la matriculación.
   */
  fechaFacturacion?: Fecha | null;
  /** Fecha de entrega del coche al cliente (solo para los conceptos especiales). */
  fechaEntrega?: Fecha | null;
  /** `fecha_cobrado` del expediente. */
  fechaCobro: Fecha | null;
  cobradoOtraFecha: boolean;
  /** `null` = usar los puntos por defecto; 0 es un valor válido. */
  puntos: Centesimas | null;
  idPromocion: number | null;
  comisionCocheManual: Centimos | null;
  comisionFinanciacionManual: Centimos | null;
  conceptosEspeciales: ConceptoEspecialMotor[];
}

export interface VendedorMotor {
  id: number;
  tipo: Clase;
  /** Nombre del patrón de VO asignado (`usuarios.patron_vo`). */
  patronVo?: string | null;
}

export interface PromocionMotor {
  id: number;
  nombre?: string;
  puntosEspeciales: Centesimas;
  minimoUnidades: number;
  puntosSiNoCumple: Centesimas;
}

export interface TarifaVnMotor {
  idModelo: number;
  tasaCumplida: boolean;
  /** Mapa tramo → céntimos, p. ej. `{"-4": 15000, "0": 20000}`. */
  importes: Record<string, Centimos>;
  activo?: boolean;
}

export interface TarifaUsadoMotor {
  subtipo: string;
  importePrimera: Centimos;
  importeResto: Centimos;
  /** 0 = sin mínimo. */
  minAplicar: number;
  activo?: boolean;
}

export interface PatronVoMotor {
  nombre: string;
  aplicaAVn: boolean;
  /** Rotativo: tras el último escalón se vuelve al primero. Si no, se repite el último. */
  rotativo?: boolean;
  activo?: boolean;
  tiers: { unidad: number; importe: Centimos }[];
}

export interface FinanciacionMotor {
  idMarca: number;
  tipo: CategoriaVenta;
  /** A qué coches se aplica (por defecto, los nuevos). */
  aplicaA?: string;
  importe: Centimos;
  /** Solo se cobra si la tasa de intervención está cumplida / no cumplida (por defecto, siempre). */
  tasaIntervencion?: CondicionTasa;
  /** Qué tasa se mira (por defecto, la de la marca del coche). */
  tasaAmbito?: AmbitoTasa;
  /** Columna de comisiones a la que va el importe («financiacion», «preference» o «extra:Nombre»); vacío = la habitual. */
  concepto?: string;
  /** Si tiene valor, la condición de la tasa compara la tasa real (%) con este valor en vez de con el objetivo del plan. */
  tasaUmbral?: number | null;
}

/** Condición sobre la tasa de intervención financiera. */
export type CondicionTasa = "cumplida" | "no_cumplida" | "indiferente";
/** Qué tasa de intervención se mira: la de la marca del coche, la global (todos los nuevos) o la de usados. */
export type AmbitoTasa = "marca" | "global" | "vo";

export interface ReglaPreferenceMotor {
  id: number;
  nombre?: string;
  idMarca: number | null;
  idModelo: number | null;
  tipo: CategoriaVenta | null;
  /** A qué coches se aplica (por defecto, los nuevos). */
  aplicaA?: string;
  importe: Centimos;
  activa?: boolean;
  tasaIntervencion?: CondicionTasa;
  tasaAmbito?: AmbitoTasa;
  concepto?: string;
  tasaUmbral?: number | null;
}

export interface ReglaBonusMotor {
  id: number;
  nombre: string;
  evento: EventoRegla;
  /** cualquiera | nuevo | usado | usado:SUBTIPO */
  tipoVehiculo: string;
  fechaInicio: Fecha | null;
  fechaFin: Fecha | null;
  idMarca: number | null;
  idModelo: number | null;
  tasaIntervencion: "cumplida" | "no_cumplida" | "indiferente";
  /** Se suma al objetivo del mes (puede ser 0). */
  puntos: Centesimas;
  /** Importe positivo; si `esPenalizacion` se resta. */
  importe: Centimos;
  esPenalizacion: boolean;
  /** Solo reglas del evento `preference`. */
  ligarACredito: boolean;
  activa?: boolean;
}

/** Objetivo de una tasa que no es de marca (la global de nuevos o la de usados). Sin objetivo, siempre se considera cumplida. */
export interface TasaConfigMotor {
  tipoTasa: "porcentaje" | "unidades";
  objetivo: number | null;
}

export interface TasaMarcaMotor {
  idMarca: number;
  tipoTasa: "porcentaje" | "unidades";
  /** 70 = 70 % o nº de unidades. */
  objetivo: number;
}

export interface ObjetivoVendedorMotor {
  base: Centesimas;
  arrastre: Centesimas;
}

export interface PlanMotor {
  idPlan: number;
  nombre?: string;
  fechaInicio: Fecha;
  fechaFin: Fecha;
  estado?: "borrador" | "activo" | "cerrado";
  tramoMin: number;
  tramoMax: number;
  puntosPorPedido: Centesimas;
  penalizacionImporte: Centimos;
  /** «cuentan» (por defecto): un usado suma puntos como cualquier coche; «no»: no suma puntos. */
  voPuntosModo?: "cuentan" | "no";
  /** Puntos que suma cada usado (centésimas); sin valor, los del modelo, la marca o el predeterminado. */
  voPuntos?: Centesimas | null;
  /** Objetivo X por vendedor (clave = id del vendedor). */
  objetivos: Record<number, ObjetivoVendedorMotor>;
  puntosPorDefectoModelo: Record<number, Centesimas>;
  puntosPorDefectoMarca: Record<number, Centesimas>;
  promociones: PromocionMotor[];
  tarifasVN: TarifaVnMotor[];
  tarifasUsadosPorSubtipo: TarifaUsadoMotor[];
  patronesVO: PatronVoMotor[];
  financiacionPorMarcaTipo: FinanciacionMotor[];
  reglasPreference: ReglaPreferenceMotor[];
  reglasYBonus: ReglaBonusMotor[];
  tasaIntervencionPorMarca: TasaMarcaMotor[];
  /** Objetivo de la tasa global (todos los coches nuevos) y de la de usados. */
  tasaGlobal?: TasaConfigMotor;
  tasaVo?: TasaConfigMotor;
  /** Los usados financiados cuentan también en la tasa global y en la de su marca (por defecto, sí). */
  tasaIncluyeVo?: boolean;
  /** Solo para los textos de aviso. */
  nombresModelo?: Record<number, string>;
  nombresMarca?: Record<number, string>;
}

export type ConceptoId =
  | "coche_vn"
  | "vo"
  | "financiacion"
  | "preference"
  | "regla"
  | "especial"
  | "puntos_coche"
  | "puntos_pedido"
  | "puntos_regla"
  /** Concepto propio creado en el plan: «extra:Nombre». */
  | `extra:${string}`;

export interface ConceptoLinea {
  concepto: ConceptoId;
  descripcion: string;
  importe: Centimos;
  puntos: Centesimas;
  evento: string;
  mesEvento: Mes;
  aviso?: string;
}

export interface LineaExpediente {
  idExpediente: number;
  clase: Clase;
  /** Mes en el que cuenta el coche (null si aún no cuenta). */
  mesComputo: Mes | null;
  /** El coche cuenta en el mes calculado. */
  cuenta: boolean;
  /** 1 si el coche cuenta en el mes (unidad comisionable), 0 si no. */
  unidades: number;
  puntos: Centesimas;
  importe: Centimos;
  conceptos: ConceptoLinea[];
}

export interface TasaMarcaResultado {
  idMarca: number;
  numerador: number;
  denominador: number;
  /** Informativo (dos decimales); el cálculo se hace con enteros. */
  porcentaje: number | null;
  unidades: number;
  cumplida: boolean;
}

/** Tasa de intervención financiera de un conjunto de coches (todos los nuevos, o los usados). */
export interface TasaAmbitoResultado {
  numerador: number;
  denominador: number;
  porcentaje: number | null;
  unidades: number;
  cumplida: boolean;
  /** Hay objetivo fijado en el plan (si no, se da por cumplida). */
  conObjetivo: boolean;
}

/** Un coche de la tasa de intervención: si cuenta en el mes (denominador) y si se financió en el mes (numerador). */
export interface TasaCocheDetalle {
  idExpediente: number;
  clase: "VN" | "VO";
  idMarca: number | null;
  cuenta: boolean;
  financiado: boolean;
}

/**
 * Coche cuya financiación (fecha RCI) cae en un mes distinto al que cuenta el coche:
 * - `anterior`: el coche cuenta en este mes, pero se financió en un mes anterior (ya sumó a la tasa de aquel mes).
 * - `adelantada`: la financiación es de este mes, pero el coche cuenta en otro (suma a la tasa de este mes, no su comisión).
 */
export interface FinanciacionFueraDeMes {
  idExpediente: number;
  clase: Clase;
  tipo: "anterior" | "adelantada";
  mesRci: Mes;
  /** Mes en el que cuenta el coche (null si aún no cuenta en ninguno). */
  mesComputo: Mes | null;
}

export type EventoLibro = "PEDIDO" | "MATRICULACION" | "COBRO" | "REGLA" | "AJUSTE";

export interface ApuntePuntos {
  idVendedor: number;
  idExpediente: number | null;
  evento: EventoLibro;
  fecha: Fecha;
  mes: Mes;
  puntos: Centesimas;
  /** `regla:<id>` o null. */
  regla: string | null;
}

export interface ResultadoMes {
  mes: Mes;
  idVendedor: number;
  idPlan: number | null;
  objetivoX: Centesimas;
  puntosMes: Centesimas;
  /** Tramo final, ya limitado al rango del plan. */
  tramo: number;
  tasaIntervencion: TasaMarcaResultado[];
  /** Tasa de todos los coches nuevos (suma de marcas) y tasa de los usados. */
  tasaGlobal: TasaAmbitoResultado;
  tasaVo: TasaAmbitoResultado;
  /** Si los usados cuentan en la tasa global y en la de marca. */
  tasaIncluyeVo: boolean;
  /** Los coches que entran en las tasas, para ver el detalle. */
  tasaCoches: TasaCocheDetalle[];
  /** Coches financiados en un mes distinto al que cuentan (para marcarlos en las tablas). */
  financiacionesFueraDeMes: FinanciacionFueraDeMes[];
  /** Objetivo X del vendedor = base + arrastre. */
  objetivoBase: Centesimas;
  objetivoArrastre: Centesimas;
  lineas: LineaExpediente[];
  bruto: Centimos;
  penalizacion: Centimos;
  neto: Centimos;
  mesPago: Mes;
  apuntesPuntos: ApuntePuntos[];
  avisos: string[];
}
