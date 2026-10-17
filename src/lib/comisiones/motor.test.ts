import { describe, expect, it } from "vitest";
import {
  apuntesDeSincronizacion,
  calcularMes,
  diferenciaNeto,
  etiquetaTramo,
  floorDiv,
  mesesAfectados,
  seleccionarPlan,
  simularExpediente,
  sumarMeses,
  type ExpedienteMotor,
  type PlanMotor,
  type ReglaBonusMotor,
  type VendedorMotor,
} from "./index";

const V: VendedorMotor = { id: 1, tipo: "VN" };

function plan(o: Partial<PlanMotor> = {}): PlanMotor {
  return {
    idPlan: 1,
    nombre: "Plan",
    fechaInicio: "2026-06-01",
    fechaFin: "2026-06-30",
    estado: "activo",
    tramoMin: -4,
    tramoMax: 3,
    puntosPorPedido: 0,
    penalizacionImporte: 0,
    objetivos: { 1: { base: 1300, arrastre: 0 } },
    puntosPorDefectoModelo: {},
    puntosPorDefectoMarca: {},
    promociones: [],
    tarifasVN: [],
    tarifasUsadosPorSubtipo: [],
    patronesVO: [],
    financiacionPorMarcaTipo: [],
    reglasPreference: [],
    reglasYBonus: [],
    tasaIntervencionPorMarca: [],
    nombresModelo: { 1: "Clio" },
    ...o,
  };
}

function exp(id: number, o: Partial<ExpedienteMotor> = {}): ExpedienteMotor {
  return {
    id,
    idVendedor: 1,
    clase: "VN",
    subtipoVO: null,
    idMarca: 1,
    idModelo: 1,
    categoriaVenta: "CONTADO",
    fechaExpediente: null,
    fechaAfectacion: null,
    fechaRci: null,
    fechaMatriculacion: null,
    fechaCobro: null,
    cobradoOtraFecha: false,
    puntos: null,
    idPromocion: null,
    comisionCocheManual: null,
    comisionFinanciacionManual: null,
    conceptosEspeciales: [],
    ...o,
  };
}

function regla(o: Partial<ReglaBonusMotor> & Pick<ReglaBonusMotor, "id" | "evento">): ReglaBonusMotor {
  return {
    nombre: `Regla ${o.id}`,
    tipoVehiculo: "cualquiera",
    fechaInicio: null,
    fechaFin: null,
    idMarca: null,
    idModelo: null,
    tasaIntervencion: "indiferente",
    puntos: 0,
    importe: 0,
    esPenalizacion: false,
    ligarACredito: false,
    ...o,
  };
}

/** n VN matriculados en junio con 1,00 puntos por defecto. */
function vnJunio(desde: number, n: number, o: Partial<ExpedienteMotor> = {}): ExpedienteMotor[] {
  return Array.from({ length: n }, (_, k) => exp(desde + k, { fechaMatriculacion: "2026-06-15", ...o }));
}

const importeDe = (r: ReturnType<typeof calcularMes>, concepto: string) =>
  r.lineas.flatMap((l) => l.conceptos).filter((c) => c.concepto === concepto).reduce((s, c) => s + c.importe, 0);

describe("utilidades", () => {
  it("floorDiv redondea hacia −∞", () => {
    expect(floorDiv(-50, 100)).toBe(-1);
    expect(floorDiv(50, 100)).toBe(0);
    expect(floorDiv(-300, 100)).toBe(-3);
    expect(floorDiv(-100, 100)).toBe(-1);
  });
  it("sumarMeses y etiquetas", () => {
    expect(sumarMeses("2026-12", 1)).toBe("2027-01");
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
    expect(etiquetaTramo(0)).toBe("X");
    expect(etiquetaTramo(1)).toBe("X+1");
    expect(etiquetaTramo(-2)).toBe("X-2");
  });
});

describe("tramo (T1–T7)", () => {
  const tramo = (puntos: number, objetivo: number) =>
    calcularMes(plan({ objetivos: { 1: { base: objetivo, arrastre: 0 } } }), V, "2026-06", [exp(1, { fechaMatriculacion: "2026-06-10", puntos })]).tramo;

  it("T1 13,00 / 13,00 → 0", () => expect(tramo(1300, 1300)).toBe(0));
  it("T2 13,50 / 13,00 → 0", () => expect(tramo(1350, 1300)).toBe(0));
  it("T3 12,50 / 13,00 → −1", () => expect(tramo(1250, 1300)).toBe(-1));
  it("T4 13,00 / 12,50 → 0", () => expect(tramo(1300, 1250)).toBe(0));
  it("T5 10,00 / 13,00 → −3", () => expect(tramo(1000, 1300)).toBe(-3));
  it("T6 17,40 / 13,00 → limitado a +3", () => expect(tramo(1740, 1300)).toBe(3));
  it("T7 5,00 / 13,00 → limitado a −4", () => expect(tramo(500, 1300)).toBe(-4));
  it("el arrastre se suma al objetivo", () => {
    const r = calcularMes(plan({ objetivos: { 1: { base: 1300, arrastre: 50 } } }), V, "2026-06", [exp(1, { fechaMatriculacion: "2026-06-10", puntos: 1300 })]);
    expect(r.objetivoX).toBe(1350);
    expect(r.tramo).toBe(-1);
  });
});

describe("puntos y calendario (T8–T16)", () => {
  it("T8 pedidos que se matriculan el mes siguiente", () => {
    const pedidos = [1, 2, 3].map((k) => exp(100 + k, { fechaExpediente: "2026-06-05", fechaMatriculacion: "2026-07-05" }));
    const todos = [...vnJunio(1, 10), ...pedidos];
    const con = calcularMes(plan({ puntosPorPedido: 100 }), V, "2026-06", todos);
    expect(con.puntosMes).toBe(1300);
    expect(con.tramo).toBe(0);
    const sin = calcularMes(plan({ puntosPorPedido: 0 }), V, "2026-06", todos);
    expect(sin.puntosMes).toBe(1000);
    expect(sin.tramo).toBe(-3);
    const julio = calcularMes(plan({ fechaInicio: "2026-07-01", fechaFin: "2026-07-31", puntosPorPedido: 100 }), V, "2026-07", todos);
    expect(julio.puntosMes).toBe(300);
  });

  it("T9 pedido y matriculación en el mismo mes cuentan una vez", () => {
    const r = calcularMes(plan({ puntosPorPedido: 100 }), V, "2026-06", [exp(1, { fechaExpediente: "2026-06-02", fechaMatriculacion: "2026-06-20" })]);
    expect(r.puntosMes).toBe(100);
  });

  const promo = (minimo: number) => ({ id: 1, puntosEspeciales: 200, minimoUnidades: minimo, puntosSiNoCumple: 100 });
  const tarifa = { idModelo: 1, tasaCumplida: true, importes: { "-4": 1000, "-3": 1000, "-2": 1000, "-1": 1000, "0": 1000, "1": 1000, "2": 1000, "3": 1000 } };
  const ambas = (t: typeof tarifa) => [t, { ...t, tasaCumplida: false }];

  it("T10 promoción cumplida: 4,00 puntos y 2 comisiones", () => {
    const e = [exp(1, { fechaMatriculacion: "2026-06-03", idPromocion: 1, idModelo: 1 }), exp(2, { fechaMatriculacion: "2026-06-04", idPromocion: 1, idModelo: 2 })];
    const r = calcularMes(plan({ promociones: [promo(2)], tarifasVN: [...ambas(tarifa), ...ambas({ ...tarifa, idModelo: 2 })] }), V, "2026-06", e);
    expect(r.puntosMes).toBe(400);
    expect(r.lineas.flatMap((l) => l.conceptos).filter((c) => c.concepto === "coche_vn" && c.importe === 1000)).toHaveLength(2);
  });

  it("T11 la misma promoción repartida en dos meses vale 1,00 en cada uno", () => {
    const e = [exp(1, { fechaMatriculacion: "2026-06-03", idPromocion: 1 }), exp(2, { fechaMatriculacion: "2026-07-03", idPromocion: 1 })];
    expect(calcularMes(plan({ promociones: [promo(2)] }), V, "2026-06", e).puntosMes).toBe(100);
    expect(calcularMes(plan({ promociones: [promo(2)], fechaInicio: "2026-07-01", fechaFin: "2026-07-31" }), V, "2026-07", e).puntosMes).toBe(100);
  });

  it("T12 promoción con mínimo 3 y 3 coches: 6,00", () => {
    const e = vnJunio(1, 3, { idPromocion: 1 });
    expect(calcularMes(plan({ promociones: [promo(3)] }), V, "2026-06", e).puntosMes).toBe(600);
  });

  it("T13 puntos = 0 aporta 0 pero sigue siendo una unidad comisionable", () => {
    const r = calcularMes(plan({ tarifasVN: ambas(tarifa) }), V, "2026-06", [exp(1, { fechaMatriculacion: "2026-06-10", puntos: 0 })]);
    expect(r.puntosMes).toBe(0);
    expect(r.lineas[0].unidades).toBe(1);
    expect(importeDe(r, "coche_vn")).toBe(1000);
  });

  it("puntos por defecto: modelo > marca > 1,00", () => {
    const e = [exp(1, { fechaMatriculacion: "2026-06-10", idModelo: 1, idMarca: 1 }), exp(2, { fechaMatriculacion: "2026-06-10", idModelo: 9, idMarca: 1 }), exp(3, { fechaMatriculacion: "2026-06-10", idModelo: 8, idMarca: 5 })];
    const r = calcularMes(plan({ puntosPorDefectoModelo: { 1: 150 }, puntosPorDefectoMarca: { 1: 120 } }), V, "2026-06", e);
    expect(r.lineas.map((l) => l.puntos)).toEqual([150, 120, 100]);
  });

  it("T14 VN matriculado 12/02 y cobrado 20/01", () => {
    const base = { fechaMatriculacion: "2026-02-12", fechaCobro: "2026-01-20" };
    const enero = plan({ fechaInicio: "2026-01-01", fechaFin: "2026-01-31" });
    const febrero = plan({ fechaInicio: "2026-02-01", fechaFin: "2026-02-28" });
    const con = [exp(1, { ...base, cobradoOtraFecha: true })];
    expect(calcularMes(enero, V, "2026-01", con).puntosMes).toBe(100);
    expect(calcularMes(febrero, V, "2026-02", con).puntosMes).toBe(0);
    const sin = [exp(1, base)];
    expect(calcularMes(enero, V, "2026-01", sin).puntosMes).toBe(0);
    expect(calcularMes(febrero, V, "2026-02", sin).puntosMes).toBe(100);
    expect(calcularMes(enero, V, "2026-01", con).mesPago).toBe("2026-02");
  });

  it("T15 VN con casilla y sin fecha de cobro no cuenta en ningún mes (aviso)", () => {
    const e = [exp(1, { fechaExpediente: "2026-06-02", fechaMatriculacion: "2026-06-20", cobradoOtraFecha: true })];
    const r = calcularMes(plan(), V, "2026-06", e);
    expect(r.puntosMes).toBe(0);
    expect(r.avisos.some((a) => a.includes("falta fecha de cobro"))).toBe(true);
  });

  it("T16 cada concepto en el mes de su evento", () => {
    const p = plan({
      fechaInicio: "2026-05-01",
      fechaFin: "2026-07-31",
      puntosPorPedido: 100,
      objetivos: { 1: { base: 100, arrastre: 0 } },
      tarifasVN: [true, false].map((tasaCumplida) => ({ idModelo: 1, tasaCumplida, importes: { "0": 40000, "-1": 40000, "1": 40000, "2": 40000 } })),
      financiacionPorMarcaTipo: [{ idMarca: 1, tipo: "PREFERENCE", importe: 5000 }],
      reglasPreference: [{ id: 1, idMarca: null, idModelo: null, tipo: null, importe: 7000 }],
      reglasYBonus: [
        regla({ id: 1, evento: "pedido", importe: 1000 }),
        regla({ id: 2, evento: "afectacion", importe: 2000 }),
        regla({ id: 3, evento: "matriculacion", importe: 3000, puntos: 50 }),
      ],
    });
    const e = [
      exp(1, {
        categoriaVenta: "PREFERENCE",
        fechaExpediente: "2026-05-20",
        fechaAfectacion: "2026-05-28",
        fechaRci: "2026-06-10",
        fechaMatriculacion: "2026-07-05",
        conceptosEspeciales: [{ titulo: "Rappel", importe: 10000 }],
      }),
    ];
    const mayo = calcularMes(p, V, "2026-05", e);
    expect(mayo.bruto).toBe(3000);
    expect(mayo.puntosMes).toBe(100);
    const junio = calcularMes(p, V, "2026-06", e);
    expect(junio.bruto).toBe(12000);
    expect(junio.puntosMes).toBe(0);
    const julio = calcularMes(p, V, "2026-07", e);
    expect(importeDe(julio, "coche_vn")).toBe(40000);
    expect(importeDe(julio, "regla")).toBe(3000);
    expect(importeDe(julio, "especial")).toBe(10000);
    expect(julio.bruto).toBe(53000);
    expect(julio.puntosMes).toBe(150);
    expect(julio.mesPago).toBe("2026-08");
  });
});

describe("tasa de intervención y comisión del coche (T17–T18)", () => {
  const importes = (n: number) => ({ "1": n, "0": n, "2": n, "-1": n, "-2": n, "-3": n, "-4": n, "3": n });
  const baseTarifas = [
    { idModelo: 1, tasaCumplida: true, importes: importes(25000) },
    { idModelo: 1, tasaCumplida: false, importes: importes(18000) },
  ];
  // 10 VN con 1,00 puntos y objetivo 9,00 → tramo X+1
  const conFinanciados = (n: number, extra: Partial<ExpedienteMotor> = {}) =>
    vnJunio(1, 10).map((e, k) => (k < n ? { ...e, categoriaVenta: "CREDITO" as const, fechaRci: "2026-06-20", ...extra } : e));
  const p = (o: Partial<PlanMotor> = {}) =>
    plan({ objetivos: { 1: { base: 900, arrastre: 0 } }, tasaIntervencionPorMarca: [{ idMarca: 1, tipoTasa: "porcentaje", objetivo: 65 }], tarifasVN: baseTarifas, ...o });

  it("T17 70 % con objetivo 65 % → cumplida → 250 €", () => {
    const r = calcularMes(p(), V, "2026-06", conFinanciados(7));
    expect(r.tramo).toBe(1);
    expect(r.tasaIntervencion[0]).toMatchObject({ idMarca: 1, numerador: 7, denominador: 10, cumplida: true });
    expect(importeDe(r, "coche_vn")).toBe(25000 * 10);
  });
  it("T17 60 % → no cumplida → 180 €", () => {
    const r = calcularMes(p(), V, "2026-06", conFinanciados(6));
    expect(r.tasaIntervencion[0].cumplida).toBe(false);
    expect(importeDe(r, "coche_vn")).toBe(18000 * 10);
  });
  it("T17 comisión a mano de 300 € sustituye a la tarifa", () => {
    const e = conFinanciados(7);
    e[9] = { ...e[9], comisionCocheManual: 30000 };
    expect(importeDe(calcularMes(p(), V, "2026-06", e), "coche_vn")).toBe(25000 * 9 + 30000);
  });
  it("T17 sin tarifa → 0 € y aviso", () => {
    const r = calcularMes(p({ tarifasVN: [] }), V, "2026-06", conFinanciados(7).slice(0, 1));
    expect(importeDe(r, "coche_vn")).toBe(0);
    expect(r.avisos.some((a) => a.includes("Sin tarifa para el modelo Clio en el tramo"))).toBe(true);
  });
  it("tasa por unidades", () => {
    const r = calcularMes(p({ tasaIntervencionPorMarca: [{ idMarca: 1, tipoTasa: "unidades", objetivo: 7 }] }), V, "2026-06", conFinanciados(6));
    expect(r.tasaIntervencion[0].cumplida).toBe(false);
    expect(calcularMes(p({ tasaIntervencionPorMarca: [{ idMarca: 1, tipoTasa: "unidades", objetivo: 7 }] }), V, "2026-06", conFinanciados(7)).tasaIntervencion[0].cumplida).toBe(true);
  });
  it("los VO no cuentan para la tasa", () => {
    const e = [...conFinanciados(7), exp(50, { clase: "VO", subtipoVO: "USADO", fechaFacturacion: "2026-06-10" })];
    expect(calcularMes(p(), V, "2026-06", e).tasaIntervencion[0].denominador).toBe(10);
  });
  it("T18 sin VN de la marca en el mes → cumplida", () => {
    const e = [exp(1, { idMarca: 2, categoriaVenta: "CREDITO", fechaRci: "2026-06-10", fechaMatriculacion: "2026-07-10" })];
    const r = calcularMes(p(), V, "2026-06", e);
    expect(r.tasaIntervencion).toHaveLength(1);
    expect(r.tasaIntervencion[0]).toMatchObject({ idMarca: 2, denominador: 0, cumplida: true });
  });
});

describe("comisión VO (T19–T20)", () => {
  const km0 = { subtipo: "KM0", importePrimera: 12000, importeResto: 6000, minAplicar: 0 };
  const vo = (id: number, subtipo: string, dia: number) => exp(id, { clase: "VO", subtipoVO: subtipo, fechaFacturacion: `2026-06-${String(dia).padStart(2, "0")}` });

  it("T19 KM0 primera 120 / resto 60 con 3 unidades → 240 €", () => {
    const r = calcularMes(plan({ tarifasUsadosPorSubtipo: [km0] }), V, "2026-06", [vo(1, "KM0", 5), vo(2, "KM0", 6), vo(3, "KM0", 7)]);
    expect(importeDe(r, "vo")).toBe(24000);
  });
  it("T19 mínimo 2 con 1 unidad → 0 €; con 3 → 240 €", () => {
    const p = plan({ tarifasUsadosPorSubtipo: [{ ...km0, minAplicar: 2 }] });
    expect(importeDe(calcularMes(p, V, "2026-06", [vo(1, "KM0", 5)]), "vo")).toBe(0);
    expect(importeDe(calcularMes(p, V, "2026-06", [vo(1, "KM0", 5), vo(2, "KM0", 6), vo(3, "KM0", 7)]), "vo")).toBe(24000);
  });
  it("T19 KM0 + Usado: cada subtipo con su primera", () => {
    const p = plan({ tarifasUsadosPorSubtipo: [km0, { subtipo: "USADO", importePrimera: 9000, importeResto: 4000, minAplicar: 0 }] });
    expect(importeDe(calcularMes(p, V, "2026-06", [vo(1, "KM0", 5), vo(2, "USADO", 6)]), "vo")).toBe(12000 + 9000);
  });
  it("sin tarifa de subtipo → 0 € y aviso; el orden es cobro y después id", () => {
    const r = calcularMes(plan({ tarifasUsadosPorSubtipo: [km0] }), V, "2026-06", [vo(1, "BUYBACK", 5)]);
    expect(importeDe(r, "vo")).toBe(0);
    expect(r.avisos.some((a) => a.includes("Sin tarifa de VO"))).toBe(true);
    const orden = calcularMes(plan({ tarifasUsadosPorSubtipo: [km0] }), V, "2026-06", [vo(1, "KM0", 9), vo(2, "KM0", 3)]);
    expect(orden.lineas.find((l) => l.idExpediente === 2)?.importe).toBe(12000);
    expect(orden.lineas.find((l) => l.idExpediente === 1)?.importe).toBe(6000);
  });
  it("T20 vendedor VO con escala 150/170/190 y 5 unidades → 890 €", () => {
    const vendedor: VendedorMotor = { id: 1, tipo: "VO", patronVo: "Estándar VO" };
    const patron = { nombre: "Estándar VO", aplicaAVn: false, tiers: [{ unidad: 1, importe: 15000 }, { unidad: 2, importe: 17000 }, { unidad: 3, importe: 19000 }] };
    const e = [1, 2, 3, 4, 5].map((k) => vo(k, "USADO", k));
    expect(importeDe(calcularMes(plan({ patronesVO: [patron] }), vendedor, "2026-06", e), "vo")).toBe(89000);
    expect(importeDe(calcularMes(plan(), vendedor, "2026-06", e), "vo")).toBe(75000);
  });
  it("la comisión VN de un vendedor de VO se omite", () => {
    const vendedor: VendedorMotor = { id: 1, tipo: "VO" };
    const r = calcularMes(plan({ tarifasVN: [{ idModelo: 1, tasaCumplida: true, importes: { "0": 1000 } }] }), vendedor, "2026-06", [exp(1, { fechaMatriculacion: "2026-06-10", puntos: 1300 })]);
    expect(importeDe(r, "coche_vn")).toBe(0);
    expect(r.avisos.some((a) => a.includes("omitida: vendedor de VO"))).toBe(true);
  });
  it("el patrón con «aplica a VN» usa la escala aunque el vendedor sea de VN", () => {
    const patron = { nombre: "Mixto", aplicaAVn: true, tiers: [{ unidad: 1, importe: 10000 }] };
    const r = calcularMes(plan({ patronesVO: [patron] }), { id: 1, tipo: "VN", patronVo: "Mixto" }, "2026-06", [vo(1, "USADO", 5), vo(2, "USADO", 6)]);
    expect(importeDe(r, "vo")).toBe(20000);
  });
});

describe("opciones de los usados en el plan (puntos)", () => {
  const usado = (id: number, extra: Partial<ExpedienteMotor> = {}) => exp(id, { clase: "VO", subtipoVO: "KM0", fechaFacturacion: "2026-07-05", ...extra });

  it("un usado cuenta por su fecha de facturación y suma 1 punto; su fecha de cobro no cuenta", () => {
    const u = usado(1, { fechaFacturacion: "2026-06-20", fechaCobro: "2026-07-05", cobradoOtraFecha: true });
    expect(calcularMes(plan(), V, "2026-06", [u]).puntosMes).toBe(100);
    expect(calcularMes(plan(), V, "2026-07", [u]).puntosMes).toBe(0);
  });
  it("puntos por usado configurables o sin puntos", () => {
    expect(calcularMes(plan({ voPuntos: 250 }), V, "2026-07", [usado(1), usado(2)]).puntosMes).toBe(500);
    const sin = calcularMes(plan({ voPuntosModo: "no" }), V, "2026-07", [usado(1), exp(2, { fechaMatriculacion: "2026-07-10", puntos: 100 })]);
    expect(sin.puntosMes).toBe(100); // solo suma el nuevo
    expect(sin.lineas.find((l) => l.idExpediente === 1)?.cuenta).toBe(true); // el usado sigue contando para su comisión
  });
});

describe("totales (T21–T22)", () => {
  it("T21 bruto 1.795,00 · penalización 150,00 · neto 1.645,00", () => {
    const p = plan({
      penalizacionImporte: 15000,
      tarifasUsadosPorSubtipo: [{ subtipo: "KM0", importePrimera: 12000, importeResto: 6000, minAplicar: 0 }],
      financiacionPorMarcaTipo: [{ idMarca: 1, tipo: "PREFERENCE", importe: 0 }],
      reglasPreference: [{ id: 1, idMarca: 1, idModelo: null, tipo: null, importe: 15000 }],
      reglasYBonus: [regla({ id: 1, evento: "pedido", importe: 20000 })],
    });
    const e = [
      exp(1, { fechaMatriculacion: "2026-06-10", fechaExpediente: "2026-06-01", comisionCocheManual: 89000, conceptosEspeciales: [{ titulo: "Rappel", importe: 7500 }] }),
      exp(2, { clase: "VO", subtipoVO: "KM0", fechaFacturacion: "2026-06-11" }),
      exp(3, { categoriaVenta: "CREDITO", fechaRci: "2026-06-12", fechaMatriculacion: "2026-07-12", comisionFinanciacionManual: 36000 }),
      exp(4, { categoriaVenta: "PREFERENCE", fechaRci: "2026-06-13", fechaMatriculacion: "2026-07-13" }),
    ];
    const r = calcularMes(p, V, "2026-06", e);
    expect(importeDe(r, "coche_vn")).toBe(89000);
    expect(importeDe(r, "vo")).toBe(12000);
    expect(importeDe(r, "financiacion")).toBe(36000);
    expect(importeDe(r, "preference")).toBe(15000);
    expect(importeDe(r, "regla")).toBe(20000);
    expect(importeDe(r, "especial")).toBe(7500);
    expect(r.bruto).toBe(179500);
    expect(r.penalizacion).toBe(15000);
    expect(r.neto).toBe(164500);
  });
  it("T22 el neto nunca es negativo", () => {
    const r = calcularMes(plan({ penalizacionImporte: 50000 }), V, "2026-06", []);
    expect(r.bruto).toBe(0);
    expect(r.neto).toBe(0);
  });
  it("las penalizaciones dinámicas restan del bruto", () => {
    const p = plan({ reglasYBonus: [regla({ id: 1, evento: "cobro", importe: 5000, esPenalizacion: true })] });
    const r = calcularMes(p, V, "2026-06", [exp(1, { clase: "VO", subtipoVO: "USADO", fechaFacturacion: "2026-06-05", fechaCobro: "2026-06-05", comisionCocheManual: 20000 })]);
    expect(r.bruto).toBe(15000);
  });
});

describe("corrección de meses cerrados (T23–T26)", () => {
  it("T23 la diferencia de neto de un mes corregido", () => {
    expect(diferenciaNeto(160000, 175000)).toEqual({ anterior: 160000, nuevo: 175000, diferencia: 15000 });
    const antes = exp(1, { fechaMatriculacion: "2026-06-30", comisionCocheManual: 160000 });
    const despues = exp(1, { fechaMatriculacion: "2026-07-02", comisionCocheManual: 175000 });
    const af = mesesAfectados(antes, despues);
    expect(af.map((a) => a.mes)).toEqual(["2026-06", "2026-07"]);
  });

  it("T24 idempotencia del cálculo y de la sincronización del libro", () => {
    const p = plan({ puntosPorPedido: 100, reglasYBonus: [regla({ id: 1, evento: "matriculacion", puntos: 50, importe: 100 })] });
    const e = [...vnJunio(1, 3), exp(9, { fechaExpediente: "2026-06-03", fechaMatriculacion: "2026-07-03" })];
    const a = calcularMes(p, V, "2026-06", e);
    const b = calcularMes(p, V, "2026-06", e);
    expect(b).toEqual(a);
    const ctx = { idVendedor: 1, mes: "2026-06" };
    const primera = apuntesDeSincronizacion(a.apuntesPuntos, [], ctx);
    expect(primera.reduce((s, x) => s + x.puntos, 0)).toBe(a.puntosMes);
    const libro = primera.map((x) => ({ idExpediente: x.idExpediente, evento: x.evento, regla: x.regla, puntos: x.puntos }));
    expect(apuntesDeSincronizacion(b.apuntesPuntos, libro, ctx)).toEqual([]);
  });

  it("T24 una corrección genera un apunte negativo y anular un coche, otro de signo contrario", () => {
    const ctx = { idVendedor: 1, mes: "2026-06" };
    const antes = calcularMes(plan(), V, "2026-06", vnJunio(1, 2));
    const libro = apuntesDeSincronizacion(antes.apuntesPuntos, [], ctx).map((x) => ({ idExpediente: x.idExpediente, evento: x.evento, regla: x.regla, puntos: x.puntos }));
    const despues = calcularMes(plan(), V, "2026-06", vnJunio(1, 1));
    const corr = apuntesDeSincronizacion(despues.apuntesPuntos, libro, ctx);
    expect(corr).toHaveLength(1);
    expect(corr[0]).toMatchObject({ idExpediente: 2, puntos: -100 });
    const vacio = apuntesDeSincronizacion([], libro, ctx);
    expect(vacio.reduce((s, x) => s + x.puntos, 0)).toBe(-200);
  });

  it("T25 un importe no numérico da aviso y 0 € sin lanzar excepción", () => {
    const sucio = exp(1, {
      fechaMatriculacion: "2026-06-10",
      comisionCocheManual: "abc" as unknown as number,
      conceptosEspeciales: [{ titulo: "Roto", importe: Number.NaN }],
    });
    const r = calcularMes(plan(), V, "2026-06", [sucio]);
    expect(r.bruto).toBe(0);
    expect(r.avisos.length).toBeGreaterThanOrEqual(2);
  });

  it("T26 reasignar un expediente recalcula a los dos vendedores", () => {
    const antes = exp(1, { idVendedor: 1, fechaMatriculacion: "2026-06-10" });
    const despues = exp(1, { idVendedor: 2, fechaMatriculacion: "2026-06-10" });
    expect(mesesAfectados(antes, despues)).toEqual([
      { idVendedor: 1, mes: "2026-06" },
      { idVendedor: 2, mes: "2026-06" },
    ]);
    expect(mesesAfectados(null, antes)).toEqual([{ idVendedor: 1, mes: "2026-06" }]);
    expect(mesesAfectados(antes, null)).toEqual([{ idVendedor: 1, mes: "2026-06" }]);
  });

  it("los meses afectados incluyen pedido, afectación, RCI y cómputo", () => {
    const e = exp(1, { fechaExpediente: "2026-03-01", fechaAfectacion: "2026-04-01", fechaRci: "2026-05-01", fechaMatriculacion: "2026-06-01" });
    expect(mesesAfectados(null, e).map((a) => a.mes)).toEqual(["2026-03", "2026-04", "2026-05", "2026-06"]);
  });
});

describe("Preference y bonus (T27–T28)", () => {
  const pref = (id: number, idMarca: number | null, idModelo: number | null, importe: number) => ({ id, idMarca, idModelo, tipo: null, importe });
  const e = [exp(1, { categoriaVenta: "PREFERENCE", fechaRci: "2026-06-10", fechaMatriculacion: "2026-07-10" })];

  it("T27 solo se aplica la regla más específica", () => {
    const todas = [pref(1, null, null, 1000), pref(2, 1, null, 2000), pref(3, 1, 1, 3000)];
    expect(importeDe(calcularMes(plan({ reglasPreference: todas }), V, "2026-06", e), "preference")).toBe(3000);
    expect(importeDe(calcularMes(plan({ reglasPreference: todas.slice(0, 2) }), V, "2026-06", e), "preference")).toBe(2000);
    expect(importeDe(calcularMes(plan({ reglasPreference: todas.slice(0, 1) }), V, "2026-06", e), "preference")).toBe(1000);
    expect(importeDe(calcularMes(plan({ reglasPreference: [pref(4, 2, null, 9000), pref(1, null, null, 1000)] }), V, "2026-06", e), "preference")).toBe(1000);
  });

  it("T28 un bonus de pedido no entra por la afectación", () => {
    const p = plan({ reglasYBonus: [regla({ id: 1, evento: "pedido", importe: 5000 })] });
    const x = [exp(1, { fechaExpediente: "2026-05-20", fechaAfectacion: "2026-06-05" })];
    expect(calcularMes(p, V, "2026-06", x).bruto).toBe(0);
    expect(calcularMes(p, V, "2026-05", x).bruto).toBe(5000);
  });

  it("filtros: vehículo, marca, validez y tasa de intervención", () => {
    const x = [exp(1, { fechaMatriculacion: "2026-06-10", idMarca: 1 })];
    const r = (o: Partial<ReglaBonusMotor>) => calcularMes(plan({ reglasYBonus: [regla({ id: 1, evento: "matriculacion", importe: 100, ...o })] }), V, "2026-06", x).bruto;
    expect(r({})).toBe(100);
    expect(r({ tipoVehiculo: "usado" })).toBe(0);
    expect(r({ tipoVehiculo: "nuevo" })).toBe(100);
    expect(r({ idMarca: 2 })).toBe(0);
    expect(r({ fechaFin: "2026-06-05" })).toBe(0);
    expect(r({ fechaInicio: "2026-06-05" })).toBe(100);
    // sin financiados la tasa del 70 % no se cumple
    expect(r({ tasaIntervencion: "cumplida" })).toBe(0);
    expect(r({ tasaIntervencion: "no_cumplida" })).toBe(100);
  });

  it("«ligar a crédito» exige otra regla de crédito aplicable", () => {
    const base = [regla({ id: 1, evento: "preference", importe: 400, ligarACredito: true })];
    const credito = regla({ id: 2, evento: "credito", importe: 0 });
    expect(calcularMes(plan({ reglasYBonus: base }), V, "2026-06", e).bruto).toBe(0);
    expect(calcularMes(plan({ reglasYBonus: [...base, credito] }), V, "2026-06", e).bruto).toBe(400);
  });

  it("la financiación a mano ignora Preference y las reglas de financiación", () => {
    const p = plan({
      reglasPreference: [pref(1, null, null, 1000)],
      reglasYBonus: [regla({ id: 1, evento: "preference", importe: 400 })],
    });
    const x = [exp(1, { categoriaVenta: "PREFERENCE", fechaRci: "2026-06-10", comisionFinanciacionManual: 5000 })];
    expect(calcularMes(p, V, "2026-06", x).bruto).toBe(5000);
  });

  it("el contado no genera incentivo de financiación", () => {
    const p = plan({ financiacionPorMarcaTipo: [{ idMarca: 1, tipo: "CONTADO", importe: 9999 }] });
    expect(calcularMes(p, V, "2026-06", [exp(1, { fechaRci: "2026-06-10" })]).bruto).toBe(0);
  });
});

describe("plan, simulador y avisos", () => {
  it("sin plan para el mes → resultado vacío con aviso", () => {
    const r = calcularMes(null, V, "2026-06", vnJunio(1, 2));
    expect(r.avisos).toEqual(["No hay plan para 2026-06"]);
    expect(r.neto).toBe(0);
  });
  it("seleccionarPlan: el activo con mayor fecha de inicio", () => {
    const a = plan({ idPlan: 1, estado: "borrador", fechaInicio: "2026-06-10" });
    const b = plan({ idPlan: 2, estado: "activo", fechaInicio: "2026-06-01" });
    const c = plan({ idPlan: 3, estado: "activo", fechaInicio: "2026-06-05" });
    expect(seleccionarPlan([a, b, c], "2026-06")?.idPlan).toBe(3);
    expect(seleccionarPlan([a, b, c], "2026-08")).toBeNull();
  });
  it("vendedor sin objetivo en el plan → X = 0 con aviso", () => {
    const r = calcularMes(plan({ objetivos: {} }), V, "2026-06", vnJunio(1, 2));
    expect(r.objetivoX).toBe(0);
    expect(r.avisos.some((a) => a.includes("no tiene objetivo"))).toBe(true);
  });
  it("solo cuenta los expedientes del vendedor", () => {
    const r = calcularMes(plan(), V, "2026-06", [...vnJunio(1, 2), exp(9, { idVendedor: 2, fechaMatriculacion: "2026-06-10" })]);
    expect(r.puntosMes).toBe(200);
  });
  it("el simulador usa la copia en memoria del expediente", () => {
    const imp5 = { "0": 5000, "1": 5000, "-1": 5000, "-2": 5000, "-3": 5000, "-4": 5000, "2": 5000, "3": 5000 };
    const p = plan({ tarifasVN: [true, false].map((tasaCumplida) => ({ idModelo: 1, tasaCumplida, importes: imp5 })), objetivos: { 1: { base: 100, arrastre: 0 } } });
    const editado = exp(1, { fechaMatriculacion: "2026-06-10" });
    const s = simularExpediente(p, V, editado, []);
    expect(s.mes).toBe("2026-06");
    expect(s.linea?.importe).toBe(5000);
    expect(simularExpediente(p, V, exp(2), []).aviso).toContain("matriculación");
  });
});

describe("VN: el mes de comisionado es el de la facturación", () => {
  it("sin facturación cuenta la matriculación; con facturación en agosto cuenta en agosto aunque matricule en septiembre", () => {
    const vendedor = { id: 1, tipo: "VN" as const, patronVo: null };
    const mat = exp(1, { fechaMatriculacion: "2026-09-10" });
    const fac = exp(2, { fechaMatriculacion: "2026-09-10", fechaFacturacion: "2026-08-28" });
    const septiembre = calcularMes(plan(), vendedor, "2026-09", [mat, fac]);
    const agosto = calcularMes(plan(), vendedor, "2026-08", [mat, fac]);
    expect(septiembre.lineas.filter((l) => l.cuenta).map((l) => l.idExpediente)).toEqual([1]);
    expect(agosto.lineas.filter((l) => l.cuenta).map((l) => l.idExpediente)).toEqual([2]);
  });
});

describe("financiación según nuevos o usados", () => {
  const fin = (aplicaA: "VN" | "VO" | "TODOS") => plan({ financiacionPorMarcaTipo: [{ idMarca: 1, tipo: "CREDITO", aplicaA, importe: 5000 }] });
  const credito = (clase: "VN" | "VO") =>
    exp(1, { clase, categoriaVenta: "CREDITO", fechaRci: "2026-06-10", fechaMatriculacion: "2026-06-10", fechaFacturacion: "2026-06-10", fechaCobro: "2026-06-10" });
  const importeFin = (p: PlanMotor, clase: "VN" | "VO") =>
    calcularMes(p, V, "2026-06", [credito(clase)]).lineas[0].conceptos.filter((c) => c.concepto === "financiacion").reduce((s, c) => s + c.importe, 0);

  it("una regla para nuevos no paga a un usado", () => {
    expect(importeFin(fin("VN"), "VN")).toBe(5000);
    expect(importeFin(fin("VN"), "VO")).toBe(0);
  });
  it("una regla para usados no paga a un nuevo, y «todos» paga a los dos", () => {
    expect(importeFin(fin("VO"), "VO")).toBe(5000);
    expect(importeFin(fin("VO"), "VN")).toBe(0);
    expect(importeFin(fin("TODOS"), "VN")).toBe(5000);
    expect(importeFin(fin("TODOS"), "VO")).toBe(5000);
  });
});

describe("patrones de usados: rotativo o no", () => {
  const VO: VendedorMotor = { id: 1, tipo: "VO", patronVo: "Estándar" };
  const escala = [
    { unidad: 1, importe: 15000 },
    { unidad: 2, importe: 20000 },
    { unidad: 3, importe: 25000 },
  ];
  const cobros = (rotativo: boolean) => {
    const usados = [1, 2, 3, 4, 5].map((id) => exp(id, { clase: "VO", subtipoVO: "USADO", fechaFacturacion: `2026-06-0${id}` }));
    const r = calcularMes(plan({ patronesVO: [{ nombre: "Estándar", aplicaAVn: false, rotativo, tiers: escala }] }), VO, "2026-06", usados);
    return r.lineas.map((l) => l.conceptos.find((c) => c.concepto === "vo")?.importe);
  };
  it("sin rotativo, desde el cuarto se repite el último escalón", () => {
    expect(cobros(false)).toEqual([15000, 20000, 25000, 25000, 25000]);
  });
  it("con rotativo, el cuarto vuelve a cobrar como el primero", () => {
    expect(cobros(true)).toEqual([15000, 20000, 25000, 15000, 20000]);
  });
});

describe("reglas por subtipo de usado", () => {
  const bonus = (tipoVehiculo: string) =>
    plan({ reglasYBonus: [regla({ id: 1, evento: "matriculacion", tipoVehiculo, importe: 1000 })] });
  const importe = (tipoVehiculo: string, subtipo: string | null, clase: "VN" | "VO" = "VO") =>
    calcularMes(bonus(tipoVehiculo), V, "2026-06", [exp(1, { clase, subtipoVO: subtipo, fechaFacturacion: "2026-06-10" })]).bruto;
  it("una regla de un subtipo solo vale para ese subtipo", () => {
    expect(importe("usado:KM0", "KM0")).toBeGreaterThanOrEqual(1000);
    expect(importe("usado:KM0", "DEMO")).toBeLessThan(1000);
    expect(importe("usado", "DEMO")).toBeGreaterThanOrEqual(1000);
    expect(importe("nuevo", "KM0")).toBeLessThan(1000);
  });
});

describe("columna Preference", () => {
  it("el incentivo de una venta Preference sale como «preference», no como «financiacion»", () => {
    const p = plan({ financiacionPorMarcaTipo: [{ idMarca: 1, tipo: "PREFERENCE", aplicaA: "VN", importe: 7500 }] });
    const l = calcularMes(p, V, "2026-06", [exp(1, { categoriaVenta: "PREFERENCE", fechaRci: "2026-06-10", fechaMatriculacion: "2026-06-10" })]).lineas[0];
    expect(l.conceptos.find((c) => c.concepto === "preference")?.importe).toBe(7500);
    expect(l.conceptos.some((c) => c.concepto === "financiacion")).toBe(false);
  });
});
