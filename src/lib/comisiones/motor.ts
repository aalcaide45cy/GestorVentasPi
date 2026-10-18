import type {
  AmbitoTasa,
  ApuntePuntos,
  CategoriaVenta,
  CondicionTasa,
  Centimos,
  Centesimas,
  ConceptoLinea,
  EventoLibro,
  ExpedienteMotor,
  Fecha,
  LineaExpediente,
  Mes,
  PatronVoMotor,
  PlanMotor,
  ReglaBonusMotor,
  ReglaPreferenceMotor,
  ConceptoId,
  EventoConcepto,
  ResultadoMes,
  TarifaUsadoMotor,
  TasaAmbitoResultado,
  TasaCocheDetalle,
  FinanciacionFueraDeMes,
  TasaConfigMotor,
  TasaMarcaResultado,
  VendedorMotor,
} from "./tipos";
import { ambitoCoincide, enteroValido, etiquetaTramo, fechaQueCuenta, floorDiv, limitar, mesDe, mesEnRango, sumarMeses } from "./util";

const FINANCIADAS: CategoriaVenta[] = ["CREDITO", "PREFERENCE", "RENTING"];

/** ¿El tipo de pago del expediente suma a la tasa de intervención? Lo decide el propio tipo de pago; sin dato, la categoría. */
function esFinanciadoParaTasa(e: ExpedienteMotor): boolean {
  return e.cuentaParaTasa ?? (e.categoriaVenta !== null && FINANCIADAS.includes(e.categoriaVenta));
}
const PUNTOS_DEFECTO: Centesimas = 100;
const VO_SIN_ESCALA: Centimos = 15000;

interface Info {
  e: ExpedienteMotor;
  mesComputo: Mes | null;
  fechaComputo: Fecha | null;
  eventoLibro: EventoLibro;
  /** Texto del aviso si falta la fecha que hace contar al coche. */
  falta: string | null;
}

/** Evento principal del coche (12.3, paso 1). */
function infoDe(e: ExpedienteMotor): Info {
  const { fecha, usaCobro } = fechaQueCuenta(e);
  const mes = mesDe(fecha);
  return {
    e,
    mesComputo: mes,
    fechaComputo: mes ? fecha : null,
    eventoLibro: usaCobro ? "COBRO" : "MATRICULACION",
    falta: mes ? null : usaCobro ? "falta fecha de cobro" : "falta fecha de facturación o de matriculación",
  };
}

/** Plan aplicable a un mes (paso 0): el activo con mayor fecha de inicio entre los que tocan el mes. */
export function seleccionarPlan(planes: PlanMotor[], mes: Mes): PlanMotor | null {
  const candidatos = planes.filter((p) => mesEnRango(mes, p.fechaInicio, p.fechaFin));
  if (candidatos.length === 0) return null;
  const rango = (p: PlanMotor) => (p.estado === "activo" ? 1 : 0);
  return [...candidatos].sort((a, b) => rango(b) - rango(a) || b.fechaInicio.localeCompare(a.fechaInicio) || b.idPlan - a.idPlan)[0];
}

function resultadoVacio(mes: Mes, idVendedor: number, idPlan: number | null, aviso: string): ResultadoMes {
  return {
    mes,
    idVendedor,
    idPlan,
    objetivoX: 0,
    puntosMes: 0,
    tramo: 0,
    tasaIntervencion: [],
    tasaGlobal: tasaVacia(),
    tasaVo: tasaVacia(),
    tasaIncluyeVo: true,
    tasaCoches: [],
    financiacionesFueraDeMes: [],
    objetivoBase: 0,
    objetivoArrastre: 0,
    lineas: [],
    bruto: 0,
    penalizacion: 0,
    neto: 0,
    mesPago: sumarMeses(mes, 1),
    apuntesPuntos: [],
    avisos: [aviso],
  };
}

function nombreModelo(plan: PlanMotor, id: number | null): string {
  if (id === null) return "(sin modelo)";
  return plan.nombresModelo?.[id] ?? `#${id}`;
}

/**
 * Calcula un mes de un vendedor. Función pura y determinista: no accede a la BD,
 * a la red ni a la fecha del sistema, y nunca lanza por un dato malo (12.1).
 */
export function calcularMes(
  plan: PlanMotor | null,
  vendedor: VendedorMotor,
  mes: Mes,
  expedientes: ExpedienteMotor[],
): ResultadoMes {
  if (!plan) return resultadoVacio(mes, vendedor.id, null, `No hay plan para ${mes}`);

  const avisos: string[] = [];
  const mis = expedientes.filter((e) => e.idVendedor === vendedor.id).sort((a, b) => a.id - b.id);
  const infos = mis.map(infoDe);
  const cuentan = infos.filter((i) => i.mesComputo === mes);

  const lineas = new Map<number, LineaExpediente>();
  const apuntes: ApuntePuntos[] = [];
  const linea = (i: Info): LineaExpediente => {
    let l = lineas.get(i.e.id);
    if (!l) {
      l = {
        idExpediente: i.e.id,
        clase: i.e.clase,
        mesComputo: i.mesComputo,
        cuenta: i.mesComputo === mes,
        unidades: i.mesComputo === mes ? 1 : 0,
        puntos: 0,
        importe: 0,
        conceptos: [],
      };
      lineas.set(i.e.id, l);
    }
    return l;
  };
  const anotar = (i: Info, c: ConceptoLinea) => {
    const l = linea(i);
    l.conceptos.push(c);
    l.importe += c.importe;
    l.puntos += c.puntos;
    if (c.aviso) avisos.push(`Expediente ${i.e.id}: ${c.aviso}`);
  };

  /* Objetivo X del vendedor */
  const obj = plan.objetivos[vendedor.id];
  if (!obj) avisos.push(`El vendedor no tiene objetivo en el plan «${plan.nombre ?? plan.idPlan}»: objetivo X = 0`);
  const objetivoX = obj ? obj.base + obj.arrastre : 0;

  /* Avisos de fechas que faltan (solo si el expediente tiene algún otro evento en el mes) */
  for (const i of infos) {
    if (i.falta && [i.e.fechaExpediente, i.e.fechaAfectacion, i.e.fechaRci].some((f) => mesDe(f) === mes)) {
      avisos.push(`Expediente ${i.e.id}: ${i.falta}; el coche no cuenta en ningún mes`);
    }
  }

  /* Paso 3: puntos de cada coche */
  const nPromo = new Map<number, number>();
  for (const i of cuentan) if (i.e.idPromocion !== null) nPromo.set(i.e.idPromocion, (nPromo.get(i.e.idPromocion) ?? 0) + 1);

  let puntosCoches: Centesimas = 0;
  for (const i of cuentan) {
    const e = i.e;
    let p: Centesimas;
    const promo = e.idPromocion === null ? undefined : plan.promociones.find((x) => x.id === e.idPromocion);
    if (promo) {
      p = (nPromo.get(promo.id) ?? 0) >= promo.minimoUnidades ? promo.puntosEspeciales : promo.puntosSiNoCumple;
    } else {
      if (e.idPromocion !== null) avisos.push(`Expediente ${e.id}: la promoción ${e.idPromocion} no existe en el plan; se usan sus puntos propios o por defecto`);
      p =
        enteroValido(e.puntos) ??
        (e.clase === "VO" ? (enteroValido(plan.voPuntos ?? undefined) ?? undefined) : undefined) ??
        (e.idModelo !== null ? plan.puntosPorDefectoModelo[e.idModelo] : undefined) ??
        (e.idMarca !== null ? plan.puntosPorDefectoMarca[e.idMarca] : undefined) ??
        PUNTOS_DEFECTO;
    }
    if (e.clase === "VO" && plan.voPuntosModo === "no") continue; // en este plan los usados no suman puntos
    puntosCoches += p;
    anotar(i, {
      concepto: "puntos_coche",
      descripcion: "Puntos del coche",
      importe: 0,
      puntos: p,
      evento: i.eventoLibro,
      mesEvento: mes,
    });
    apuntes.push({
      idVendedor: vendedor.id,
      idExpediente: e.id,
      evento: i.eventoLibro,
      fecha: i.fechaComputo as Fecha,
      mes,
      puntos: p,
      regla: null,
    });
  }

  /* Paso 4: puntos de pedido (solo si el coche no cuenta ya en este mismo mes) */
  let puntosPedidos: Centesimas = 0;
  const ppp = enteroValido(plan.puntosPorPedido) ?? 0;
  if (ppp !== 0) {
    for (const i of infos) {
      if (mesDe(i.e.fechaExpediente) === mes && i.mesComputo !== mes) {
        puntosPedidos += ppp;
        anotar(i, { concepto: "puntos_pedido", descripcion: "Puntos por pedido", importe: 0, puntos: ppp, evento: "PEDIDO", mesEvento: mes });
        apuntes.push({ idVendedor: vendedor.id, idExpediente: i.e.id, evento: "PEDIDO", fecha: i.e.fechaExpediente as Fecha, mes, puntos: ppp, regla: null });
      }
    }
  }

  /* Paso 7: tasa de intervención por marca */
  const tasas = calcularTasas(plan, infos, mes);
  const tasaDe = (idMarca: number | null): boolean => {
    if (idMarca === null) return false;
    return tasas.find((t) => t.idMarca === idMarca)?.cumplida ?? true;
  };
  const incluyeVo = plan.tasaIncluyeVo !== false;
  const tasaGlobal = calcularTasaAmbito(infos, mes, incluyeVo ? ["VN", "VO"] : ["VN"], plan.tasaGlobal);
  const tasaVo = calcularTasaAmbito(infos, mes, ["VO"], plan.tasaVo);
  const tasaCoches: TasaCocheDetalle[] = infos
    .filter((i) => i.mesComputo === mes || mesDe(i.e.fechaRci) === mes)
    .map((i) => ({ idExpediente: i.e.id, clase: i.e.clase, idMarca: i.e.idMarca, cuenta: i.mesComputo === mes, financiado: mesDe(i.e.fechaRci) === mes && esFinanciadoParaTasa(i.e) }));
  const financiacionesFueraDeMes: FinanciacionFueraDeMes[] = infos.flatMap((i): FinanciacionFueraDeMes[] => {
    const mesRci = mesDe(i.e.fechaRci);
    if (mesRci === null || !esFinanciadoParaTasa(i.e)) return [];
    if (i.mesComputo === mes && mesRci < mes) return [{ idExpediente: i.e.id, clase: i.e.clase, tipo: "anterior" as const, mesRci, mesComputo: i.mesComputo }];
    if (i.mesComputo !== mes && mesRci === mes) return [{ idExpediente: i.e.id, clase: i.e.clase, tipo: "adelantada" as const, mesRci, mesComputo: i.mesComputo }];
    return [];
  });
  const ratioDe = (ambito: AmbitoTasa, idMarca: number | null): { cumplida: boolean; numerador: number; denominador: number } => {
    if (ambito === "global") return tasaGlobal;
    if (ambito === "vo") return tasaVo;
    const t = idMarca === null ? undefined : tasas.find((x) => x.idMarca === idMarca);
    return t ? { cumplida: t.cumplida, numerador: t.numerador, denominador: t.denominador } : { cumplida: idMarca !== null, numerador: 0, denominador: 0 };
  };

  /* Pasos 5 y 8.5: reglas y bonus (puntos e importes) */
  let puntosReglas: Centesimas = 0;
  const reglas = plan.reglasYBonus.filter((r) => r.activa !== false);
  for (const i of infos) {
    const e = i.e;
    const financiacionManual = e.comisionFinanciacionManual !== null;
    for (const r of reglas) {
      if (financiacionManual && (r.evento === "credito" || r.evento === "preference")) continue;
      const fecha = aplicaRegla(r, i, mes, tasaDe, false);
      if (fecha === null) continue;
      if (r.ligarACredito && r.evento === "preference") {
        const hayCredito = reglas.some((c) => c.evento === "credito" && !c.ligarACredito && aplicaRegla(c, i, mes, tasaDe, true) !== null);
        if (!hayCredito) continue;
      }
      let imp = enteroValido(r.importe);
      let aviso: string | undefined;
      if (imp === null) {
        imp = 0;
        aviso = `Importe no válido en la regla «${r.nombre}»: se usa 0`;
      }
      const importe = r.esPenalizacion ? -Math.abs(imp) : imp;
      const pts = enteroValido(r.puntos) ?? 0;
      puntosReglas += pts;
      if (importe !== 0 || aviso || pts === 0) {
        anotar(i, { concepto: "regla", descripcion: r.nombre, importe, puntos: 0, evento: r.evento, mesEvento: mes, aviso });
      }
      if (pts !== 0) {
        anotar(i, { concepto: "puntos_regla", descripcion: `Puntos de la regla «${r.nombre}»`, importe: 0, puntos: pts, evento: r.evento, mesEvento: mes });
        apuntes.push({ idVendedor: vendedor.id, idExpediente: e.id, evento: "REGLA", fecha, mes, puntos: pts, regla: `regla:${r.id}` });
      }
    }
  }

  /* Paso 6: puntos del mes, objetivo y tramo */
  const puntosMes = puntosCoches + puntosPedidos + puntosReglas;
  const tramo = limitar(floorDiv(puntosMes - objetivoX, 100), plan.tramoMin, plan.tramoMax);

  /* Paso 8.1: comisión del coche VN */
  for (const i of cuentan) {
    if (i.e.clase !== "VN") continue;
    anotar(i, comisionVn(plan, vendedor, i.e, tramo, tasaDe(i.e.idMarca), mes));
  }

  /* Paso 8.2: comisión VO (en el mes que cuenta el usado: facturación o cobro, según el plan) */
  const vo = infos.filter((i) => i.e.clase === "VO" && i.mesComputo === mes);
  for (const [i, c] of comisionesVo(plan, vendedor, vo, mes)) anotar(i, c);

  /* Pasos 8.3 y 8.4: financiación y Preference (mes de la fecha RCI) */
  for (const i of infos) {
    if (mesDe(i.e.fechaRci) !== mes) continue;
    for (const c of financiacionYPreference(plan, i.e, mes, ratioDe)) anotar(i, c);
  }

  /* Paso 8.6: conceptos especiales del expediente */
  for (const i of infos) {
    for (const c of i.e.conceptosEspeciales) {
      const fecha = fechaDeConcepto(c.evento, i);
      if (mesDe(fecha) !== mes) continue;
      let imp = enteroValido(c.importe);
      let aviso: string | undefined;
      if (imp === null) {
        imp = 0;
        aviso = `Importe no válido en el concepto especial «${c.titulo}»: se usa 0`;
      }
      anotar(i, { concepto: "especial", descripcion: c.titulo, importe: imp, puntos: 0, evento: c.evento ?? "principal", mesEvento: mes, aviso });
    }
  }

  /* Paso 9: totales */
  const lineasOrd = [...lineas.values()].sort((a, b) => a.idExpediente - b.idExpediente);
  const bruto = lineasOrd.reduce((s, l) => s + l.importe, 0);
  const penalizacion = Math.max(0, enteroValido(plan.penalizacionImporte) ?? 0);
  const neto = Math.max(0, bruto - penalizacion);

  return {
    mes,
    idVendedor: vendedor.id,
    idPlan: plan.idPlan,
    objetivoX,
    puntosMes,
    tramo,
    tasaIntervencion: tasas,
    tasaGlobal,
    tasaVo,
    tasaIncluyeVo: incluyeVo,
    tasaCoches,
    financiacionesFueraDeMes,
    objetivoBase: obj ? obj.base : 0,
    objetivoArrastre: obj ? obj.arrastre : 0,
    lineas: lineasOrd,
    bruto,
    penalizacion,
    neto,
    mesPago: sumarMeses(mes, 1),
    apuntesPuntos: apuntes,
    avisos,
  };
}

/* ------------------------------------------------------------------ */
/* Tasa de intervención (paso 7)                                       */
/* ------------------------------------------------------------------ */

function tasaVacia(): TasaAmbitoResultado {
  return { numerador: 0, denominador: 0, porcentaje: null, unidades: 0, cumplida: true, conObjetivo: false };
}

/**
 * Tasa de intervención financiera de los coches nuevos (todas las marcas juntas) o de los usados: coches financiados en el mes
 * entre los que cuentan en el mes, con el mismo criterio que la tasa por marca. Sin objetivo en el plan se da por cumplida.
 */
function calcularTasaAmbito(infos: Info[], mes: Mes, clases: ("VN" | "VO")[], cfg: TasaConfigMotor | undefined): TasaAmbitoResultado {
  const coches = infos.filter((i) => clases.includes(i.e.clase));
  const denominador = coches.filter((i) => i.mesComputo === mes).length;
  const numerador = coches.filter((i) => mesDe(i.e.fechaRci) === mes && esFinanciadoParaTasa(i.e)).length;
  const objetivo = cfg?.objetivo ?? null;
  const conObjetivo = objetivo !== null;
  let cumplida = true;
  if (conObjetivo && denominador > 0) cumplida = cfg?.tipoTasa === "unidades" ? numerador >= objetivo : numerador * 100 >= objetivo * denominador;
  return { numerador, denominador, porcentaje: denominador === 0 ? null : Math.round((numerador * 10000) / denominador) / 100, unidades: numerador, cumplida, conObjetivo };
}

function calcularTasas(plan: PlanMotor, infos: Info[], mes: Mes): TasaMarcaResultado[] {
  const marcas = new Set<number>();
  for (const i of infos) {
    const e = i.e;
    if ((e.clase !== "VN" && !(plan.tasaIncluyeVo !== false && e.clase === "VO")) || e.idMarca === null) continue;
    if (i.mesComputo === mes || mesDe(e.fechaRci) === mes) marcas.add(e.idMarca);
  }
  const res: TasaMarcaResultado[] = [];
  const incluyeVo = plan.tasaIncluyeVo !== false;
  for (const idMarca of [...marcas].sort((a, b) => a - b)) {
    const vn = infos.filter((i) => (i.e.clase === "VN" || (incluyeVo && i.e.clase === "VO")) && i.e.idMarca === idMarca);
    const denominador = vn.filter((i) => i.mesComputo === mes).length;
    const numerador = vn.filter((i) => mesDe(i.e.fechaRci) === mes && esFinanciadoParaTasa(i.e)).length;
    const cfg = plan.tasaIntervencionPorMarca.find((t) => t.idMarca === idMarca);
    const tipo = cfg?.tipoTasa ?? "porcentaje";
    const objetivo = cfg?.objetivo ?? 70;
    let cumplida: boolean;
    if (denominador === 0) cumplida = true;
    else if (tipo === "porcentaje") cumplida = numerador * 100 >= objetivo * denominador;
    else cumplida = numerador >= objetivo;
    res.push({
      idMarca,
      numerador,
      denominador,
      porcentaje: denominador === 0 ? null : Math.round((numerador * 10000) / denominador) / 100,
      unidades: numerador,
      cumplida,
    });
  }
  return res;
}

/* ------------------------------------------------------------------ */
/* Reglas y bonus (12.5)                                               */
/* ------------------------------------------------------------------ */

/**
 * Devuelve la fecha del evento si la regla aplica al expediente en el mes, o null.
 * `relajarCategoria` se usa solo para «ligar a crédito»: basta con que la venta sea financiada.
 */
function aplicaRegla(
  r: ReglaBonusMotor,
  i: Info,
  mes: Mes,
  tasaDe: (idMarca: number | null) => boolean,
  relajarCategoria: boolean,
): Fecha | null {
  const e = i.e;
  let fecha: Fecha | null = null;
  switch (r.evento) {
    case "pedido":
      fecha = mesDe(e.fechaExpediente) === mes ? e.fechaExpediente : null;
      break;
    case "afectacion":
      fecha = mesDe(e.fechaAfectacion) === mes ? e.fechaAfectacion : null;
      break;
    case "matriculacion":
      fecha = i.mesComputo === mes ? i.fechaComputo : null;
      break;
    case "cobro":
      fecha = mesDe(e.fechaCobro) === mes ? e.fechaCobro : null;
      break;
    case "credito": {
      const ok = relajarCategoria ? e.categoriaVenta !== null && FINANCIADAS.includes(e.categoriaVenta) : e.categoriaVenta === "CREDITO" || e.categoriaVenta === "RENTING";
      fecha = ok && mesDe(e.fechaRci) === mes ? e.fechaRci : null;
      break;
    }
    case "preference":
      fecha = e.categoriaVenta === "PREFERENCE" && mesDe(e.fechaRci) === mes ? e.fechaRci : null;
      break;
  }
  if (fecha === null) return null;
  if (!ambitoCoincide(r.tipoVehiculo, e.clase, e.subtipoVO)) return null;
  if (r.fechaInicio && fecha < r.fechaInicio) return null;
  if (r.fechaFin && fecha > r.fechaFin) return null;
  if (r.idMarca !== null && r.idMarca !== e.idMarca) return null;
  if (r.idModelo !== null && r.idModelo !== e.idModelo) return null;
  if (r.tasaIntervencion !== "indiferente") {
    if (e.idMarca === null) return null;
    if (tasaDe(e.idMarca) !== (r.tasaIntervencion === "cumplida")) return null;
  }
  return fecha;
}

/* ------------------------------------------------------------------ */
/* Comisión del coche VN (8.1)                                         */
/* ------------------------------------------------------------------ */

function comisionVn(plan: PlanMotor, vendedor: VendedorMotor, e: ExpedienteMotor, tramo: number, tasaCumplida: boolean, mes: Mes): ConceptoLinea {
  const base = { concepto: "coche_vn" as const, descripcion: "Comisión del coche", puntos: 0, evento: "principal", mesEvento: mes };
  if (vendedor.tipo === "VO") return { ...base, importe: 0, aviso: "Comisión del coche omitida: vendedor de VO" };
  if (e.comisionCocheManual !== null && e.comisionCocheManual !== undefined) {
    const m = enteroValido(e.comisionCocheManual);
    if (m === null) return { ...base, importe: 0, aviso: "Comisión del coche fijada a mano no válida: se usa 0" };
    return { ...base, descripcion: "Comisión del coche (a mano)", importe: m };
  }
  const tarifa = plan.tarifasVN.find((t) => t.idModelo === e.idModelo && t.tasaCumplida === tasaCumplida && t.activo !== false);
  const bruto: unknown = tarifa?.importes[String(tramo)];
  const imp = enteroValido(bruto);
  if (imp === null) {
    const aviso = bruto === undefined
      ? `Sin tarifa para el modelo ${nombreModelo(plan, e.idModelo)} en el tramo ${etiquetaTramo(tramo)}`
      : `Tarifa no válida para el modelo ${nombreModelo(plan, e.idModelo)} en el tramo ${etiquetaTramo(tramo)}: se usa 0`;
    return { ...base, importe: 0, aviso };
  }
  return { ...base, importe: imp };
}

/* ------------------------------------------------------------------ */
/* Comisión VO (12.4)                                                  */
/* ------------------------------------------------------------------ */

function comisionesVo(plan: PlanMotor, vendedor: VendedorMotor, vo: Info[], mes: Mes): [Info, ConceptoLinea][] {
  const res: [Info, ConceptoLinea][] = [];
  if (vo.length === 0) return res;
  const ordenados = [...vo].sort((a, b) => (a.fechaComputo ?? "").localeCompare(b.fechaComputo ?? "") || a.e.id - b.e.id);
  const mk = (descripcion: string, importe: Centimos, aviso?: string): ConceptoLinea => ({
    concepto: "vo",
    descripcion,
    importe,
    puntos: 0,
    evento: "COBRO",
    mesEvento: mes,
    aviso,
  });
  const manual = (e: ExpedienteMotor): ConceptoLinea | null => {
    if (e.comisionCocheManual === null || e.comisionCocheManual === undefined) return null;
    const m = enteroValido(e.comisionCocheManual);
    return m === null ? mk("Comisión VO (a mano)", 0, "Comisión VO fijada a mano no válida: se usa 0") : mk("Comisión VO (a mano)", m);
  };

  const patron: PatronVoMotor | undefined = vendedor.patronVo
    ? plan.patronesVO.find((p) => p.nombre === vendedor.patronVo && p.activo !== false)
    : undefined;
  const escala = vendedor.tipo === "VO" || patron?.aplicaAVn === true;

  if (escala) {
    const tiers = [...(patron?.tiers ?? [])].sort((a, b) => a.unidad - b.unidad);
    ordenados.forEach((i, idx) => {
      const m = manual(i.e);
      if (m) return void res.push([i, m]);
      const k = idx + 1;
      let importe = VO_SIN_ESCALA;
      if (tiers.length > 0) {
        // Rotativo: la unidad 4 vuelve a cobrar como la 1, la 5 como la 2…; si no, desde el último escalón se repite el último
        const t = tiers.find((x) => x.unidad === k) ?? (patron?.rotativo ? tiers[(k - 1) % tiers.length] : tiers[tiers.length - 1]);
        importe = t.importe;
      }
      const v = enteroValido(importe);
      res.push([i, v === null ? mk(`Comisión VO (unidad ${k})`, 0, "Escalón de VO no válido: se usa 0") : mk(`Comisión VO (unidad ${k})`, v)]);
    });
    return res;
  }

  const porSubtipo = new Map<string, Info[]>();
  for (const i of ordenados) {
    const clave = (i.e.subtipoVO ?? "").toUpperCase();
    porSubtipo.set(clave, [...(porSubtipo.get(clave) ?? []), i]);
  }
  for (const [clave, grupo] of porSubtipo) {
    const tarifa: TarifaUsadoMotor | undefined = plan.tarifasUsadosPorSubtipo.find((t) => t.subtipo.toUpperCase() === clave && t.activo !== false);
    const pagar = tarifa ? grupo.length >= (tarifa.minAplicar ?? 0) : false;
    grupo.forEach((i, idx) => {
      const m = manual(i.e);
      if (m) return void res.push([i, m]);
      if (!tarifa) return void res.push([i, mk(`Comisión VO ${clave || "(sin subtipo)"}`, 0, `Sin tarifa de VO para el subtipo ${clave || "(sin subtipo)"}`)]);
      if (!pagar) return void res.push([i, mk(`Comisión VO ${clave} (mínimo no alcanzado)`, 0)]);
      const v = enteroValido(idx === 0 ? tarifa.importePrimera : tarifa.importeResto);
      res.push([i, v === null ? mk(`Comisión VO ${clave}`, 0, `Importe no válido en la tarifa de VO ${clave}: se usa 0`) : mk(`Comisión VO ${clave} (unidad ${idx + 1})`, v)]);
    });
  }
  return res;
}

/* ------------------------------------------------------------------ */
/* Financiación y Preference (8.3 y 8.4)                               */
/* ------------------------------------------------------------------ */

/** ¿Una regla marcada para VN, VO o todos vale para este coche? Sin marca, vale para los nuevos. */
function aplica(aplicaA: string | undefined, e: ExpedienteMotor): boolean {
  return ambitoCoincide(aplicaA ?? "VN", e.clase, e.subtipoVO);
}

function especificidad(r: ReglaPreferenceMotor): number {
  if (r.idMarca !== null && r.idModelo !== null) return 4;
  if (r.idModelo !== null) return 3;
  if (r.idMarca !== null) return 2;
  return 1;
}

/** Identificador de la columna de destino de una línea: las propias del programa se respetan y cualquier otro nombre es un concepto «extra:». */
export function idConceptoDestino(texto: string): ConceptoId {
  const limpio = texto.trim();
  if (limpio === "financiacion" || limpio === "preference") return limpio;
  return `extra:${limpio.replace(/^extra:/, "")}`;
}

/** Fecha que decide el mes de un concepto especial según el evento elegido (por defecto, el evento principal del coche). */
function fechaDeConcepto(evento: EventoConcepto | undefined, i: Info): Fecha | null {
  switch (evento) {
    case "pedido":
      return i.e.fechaExpediente;
    case "afectacion":
      return i.e.fechaAfectacion;
    case "rci":
      return i.e.fechaRci;
    case "fecha_matriculacion":
      return i.e.fechaMatriculacion;
    case "facturacion":
      return i.e.fechaFacturacion ?? null;
    case "entrega":
      return i.e.fechaEntrega ?? null;
    case "cobro":
      return i.e.fechaCobro;
    default:
      return i.fechaComputo;
  }
}

function financiacionYPreference(plan: PlanMotor, e: ExpedienteMotor, mes: Mes, ratioDe: (ambito: AmbitoTasa, idMarca: number | null) => { cumplida: boolean; numerador: number; denominador: number }): ConceptoLinea[] {
  const res: ConceptoLinea[] = [];
  const mk = (concepto: ConceptoId, descripcion: string, importe: Centimos, aviso?: string): ConceptoLinea => ({
    concepto,
    descripcion,
    importe,
    puntos: 0,
    evento: "rci",
    mesEvento: mes,
    aviso,
  });
  if (e.comisionFinanciacionManual !== null && e.comisionFinanciacionManual !== undefined) {
    const m = enteroValido(e.comisionFinanciacionManual);
    res.push(m === null ? mk("financiacion", "Financiación (a mano)", 0, "Comisión de financiación fijada a mano no válida: se usa 0") : mk("financiacion", "Financiación (a mano)", m));
    return res;
  }
  const cat = e.categoriaVenta;
  if (cat === null || !FINANCIADAS.includes(cat)) return res; // CONTADO no genera incentivo

  // Por defecto, el incentivo de una venta Preference se enseña en la columna «Preference», junto a las reglas BOX3
  const conceptoFin: ConceptoId = cat === "PREFERENCE" ? "preference" : "financiacion";
  const destinoDe = (r: { concepto?: string }, defecto: ConceptoId): ConceptoId => (r.concepto && r.concepto.replace(/^extra:/, "").trim() !== "" ? idConceptoDestino(r.concepto) : defecto);
  // Una línea puede cobrarse solo si la tasa de intervención está (o no) cumplida; con «tasaUmbral» se compara la tasa real con ese %
  const cumpleTasa = (r: { tasaIntervencion?: CondicionTasa; tasaAmbito?: AmbitoTasa; tasaUmbral?: number | null }): boolean => {
    const c = r.tasaIntervencion ?? "indiferente";
    if (c === "indiferente") return true;
    const t = ratioDe(r.tasaAmbito ?? "marca", e.idMarca);
    const cumplida = r.tasaUmbral === null || r.tasaUmbral === undefined ? t.cumplida : t.denominador === 0 || t.numerador * 100 >= r.tasaUmbral * t.denominador;
    return cumplida === (c === "cumplida");
  };
  const condicionada = (r: { tasaIntervencion?: CondicionTasa }) => ((r.tasaIntervencion ?? "indiferente") === "indiferente" ? 1 : 0);
  const porDestino = <T extends { concepto?: string }>(lineas: T[], defecto: ConceptoId): Map<ConceptoId, T[]> => {
    const grupos = new Map<ConceptoId, T[]>();
    for (const l of lineas) {
      const d = destinoDe(l, defecto);
      grupos.set(d, [...(grupos.get(d) ?? []), l]);
    }
    return grupos;
  };

  // Líneas de financiación: cada columna de destino suma como mucho una línea (la que lleva condición manda sobre la que no)
  const delCoche = plan.financiacionPorMarcaTipo.filter((f) => f.idMarca === e.idMarca && f.tipo === cat && aplica(f.aplicaA, e));
  if (!(e.clase === "VO" && delCoche.length === 0)) {
    // los usados solo cobran financiación si hay una regla que se aplique a usados
    let cobrada = false;
    for (const [destino, lineas] of porDestino(delCoche, conceptoFin)) {
      const tarifa = lineas.filter(cumpleTasa).sort((a, b) => condicionada(a) - condicionada(b))[0];
      if (!tarifa) continue;
      const v = enteroValido(tarifa.importe);
      cobrada = true;
      res.push(v === null ? mk(destino, `Financiación ${cat}`, 0, "Importe de financiación no válido: se usa 0") : mk(destino, `Financiación ${cat}`, v));
    }
    if (!cobrada && delCoche.length > 0) {
      // Hay incentivo para este coche, pero solo con otra situación de la tasa de intervención
      const ambitos = [...new Set(delCoche.map((f) => f.tasaAmbito ?? "marca"))].map((a) => (a === "global" ? "global" : a === "vo" ? "de usados" : `de ${e.idMarca === null ? "la marca" : (plan.nombresMarca?.[e.idMarca] ?? "la marca")}`));
      res.push(mk(conceptoFin, `Financiación ${cat}`, 0, `No se cobra la financiación ${cat}: la tasa de intervención ${ambitos.join(" / ")} no está en la situación que pide la regla`));
    } else if (!cobrada) {
      res.push(mk(conceptoFin, `Financiación ${cat}`, 0, `Sin incentivo de financiación ${cat} para la marca ${e.idMarca === null ? "(sin marca)" : (plan.nombresMarca?.[e.idMarca] ?? `#${e.idMarca}`)}`));
    }
  }

  // Reglas Preference / BOX3: por cada columna de destino se aplica solo la más específica
  if (cat === "PREFERENCE") {
    const candidatas = plan.reglasPreference.filter(
      (r) =>
        r.activa !== false &&
        aplica(r.aplicaA, e) &&
        (r.idMarca === null || r.idMarca === e.idMarca) &&
        (r.idModelo === null || r.idModelo === e.idModelo) &&
        (r.tipo === null || r.tipo === "PREFERENCE") &&
        cumpleTasa(r),
    );
    for (const [destino, lineas] of porDestino(candidatas, "preference")) {
      const mejor = lineas.sort((a, b) => condicionada(a) - condicionada(b) || especificidad(b) - especificidad(a) || a.id - b.id)[0];
      const v = enteroValido(mejor.importe);
      const desc = `Preference / BOX3${mejor.nombre ? ` (${mejor.nombre})` : ""}`;
      res.push(v === null ? mk(destino, desc, 0, "Importe de la regla Preference no válido: se usa 0") : mk(destino, desc, v));
    }
  }
  return res;
}

