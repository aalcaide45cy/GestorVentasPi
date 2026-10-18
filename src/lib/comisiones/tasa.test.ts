import { describe, expect, it } from "vitest";
import { calcularMes, type ExpedienteMotor, type PlanMotor, type VendedorMotor } from "./index";

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
    tasaIntervencionPorMarca: [{ idMarca: 1, tipoTasa: "porcentaje", objetivo: 70 }],
    nombresModelo: { 1: "Clio" },
    ...o,
  };
}

function coche(id: number, o: Partial<ExpedienteMotor> = {}): ExpedienteMotor {
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
    fechaMatriculacion: "2026-06-15",
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

const importeDe = (r: ReturnType<typeof calcularMes>, concepto: string) => r.lineas.flatMap((l) => l.conceptos).filter((c) => c.concepto === concepto).reduce((s, c) => s + c.importe, 0);

/** 5 coches nuevos matriculados en junio, 4 de ellos a crédito (80 %); y 2 usados, 1 a crédito (50 %). */
const cartera = (): ExpedienteMotor[] => [
  ...[1, 2, 3, 4].map((i) => coche(i, { categoriaVenta: "CREDITO", fechaRci: "2026-06-10" })),
  coche(5),
  coche(6, { clase: "VO", categoriaVenta: "CREDITO", fechaRci: "2026-06-10", subtipoVO: "USADO" }),
  coche(7, { clase: "VO", subtipoVO: "USADO" }),
];

describe("tasa de intervención financiera: global, por marca y de usados", () => {
  it("se calcula la tasa global (todos los nuevos), la de cada marca y la de usados", () => {
    const r = calcularMes(plan({ tasaGlobal: { tipoTasa: "porcentaje", objetivo: 70 }, tasaVo: { tipoTasa: "porcentaje", objetivo: 60 } }), V, "2026-06", cartera());
    // Los usados financiados también cuentan en la global y en la de la marca: 5 financiados de 7
    expect(r.tasaGlobal).toMatchObject({ numerador: 5, denominador: 7, cumplida: true, conObjetivo: true });
    expect(r.tasaIntervencion[0]).toMatchObject({ idMarca: 1, numerador: 5, denominador: 7, cumplida: true });
    expect(r.tasaCoches).toHaveLength(7);
    // Si el plan lo desactiva, solo los nuevos: 4 de 5
    const soloVn = calcularMes(plan({ tasaIncluyeVo: false, tasaGlobal: { tipoTasa: "porcentaje", objetivo: 70 } }), V, "2026-06", cartera());
    expect(soloVn.tasaGlobal).toMatchObject({ numerador: 4, denominador: 5, porcentaje: 80 });
    expect(r.tasaVo).toMatchObject({ numerador: 1, denominador: 2, porcentaje: 50, cumplida: false, conObjetivo: true });
  });

  it("sin objetivo la tasa se da por cumplida", () => {
    const r = calcularMes(plan(), V, "2026-06", cartera());
    expect(r.tasaGlobal.conObjetivo).toBe(false);
    expect(r.tasaGlobal.cumplida).toBe(true);
    expect(r.tasaVo.cumplida).toBe(true);
  });

  it("una regla financiera solo se cobra si la tasa global está (o no) cumplida; la que lleva condición manda", () => {
    const filas = [
      { idMarca: 1, tipo: "CREDITO" as const, importe: 5000, tasaIntervencion: "cumplida" as const, tasaAmbito: "global" as const },
      { idMarca: 1, tipo: "CREDITO" as const, importe: 2000, tasaIntervencion: "no_cumplida" as const, tasaAmbito: "global" as const },
    ];
    const cumple = calcularMes(plan({ financiacionPorMarcaTipo: filas, tasaGlobal: { tipoTasa: "porcentaje", objetivo: 70 } }), V, "2026-06", cartera());
    expect(importeDe(cumple, "financiacion")).toBe(4 * 5000);
    const noCumple = calcularMes(plan({ financiacionPorMarcaTipo: filas, tasaGlobal: { tipoTasa: "porcentaje", objetivo: 90 } }), V, "2026-06", cartera());
    expect(importeDe(noCumple, "financiacion")).toBe(4 * 2000);
  });

  it("si solo hay una regla con condición y no se da, no se cobra y se explica", () => {
    const filas = [{ idMarca: 1, tipo: "CREDITO" as const, importe: 5000, tasaIntervencion: "cumplida" as const, tasaAmbito: "global" as const }];
    const r = calcularMes(plan({ financiacionPorMarcaTipo: filas, tasaGlobal: { tipoTasa: "porcentaje", objetivo: 90 } }), V, "2026-06", cartera());
    expect(importeDe(r, "financiacion")).toBe(0);
    expect(r.lineas.flatMap((l) => l.conceptos).some((c) => c.concepto === "financiacion" && /tasa de intervención/.test(c.aviso ?? ""))).toBe(true);
  });

  it("la tasa de usados condiciona el incentivo de los usados y la de la marca el de los nuevos", () => {
    const filas = [
      { idMarca: 1, tipo: "CREDITO" as const, aplicaA: "VO", importe: 3000, tasaIntervencion: "cumplida" as const, tasaAmbito: "vo" as const },
      { idMarca: 1, tipo: "CREDITO" as const, aplicaA: "VN", importe: 4000, tasaIntervencion: "cumplida" as const, tasaAmbito: "marca" as const },
    ];
    const noVo = calcularMes(plan({ financiacionPorMarcaTipo: filas, tasaVo: { tipoTasa: "porcentaje", objetivo: 60 } }), V, "2026-06", cartera());
    expect(importeDe(noVo, "financiacion")).toBe(4 * 4000); // los usados: tasa VO 50 % < 60 %, no cobran; los nuevos: marca 80 % ≥ 70 %
    const siVo = calcularMes(plan({ financiacionPorMarcaTipo: filas, tasaVo: { tipoTasa: "porcentaje", objetivo: 40 } }), V, "2026-06", cartera());
    expect(importeDe(siVo, "financiacion")).toBe(4 * 4000 + 3000);
  });

  it("las reglas Preference también pueden pedir la tasa", () => {
    const e = [coche(1, { categoriaVenta: "PREFERENCE", fechaRci: "2026-06-10" }), coche(2)];
    const regla = { id: 1, idMarca: null, idModelo: null, tipo: null, importe: 7000, tasaIntervencion: "cumplida" as const, tasaAmbito: "global" as const };
    const falla = calcularMes(plan({ reglasPreference: [regla], tasaGlobal: { tipoTasa: "porcentaje", objetivo: 80 } }), V, "2026-06", e); // 50 % < 80 %
    expect(importeDe(falla, "preference")).toBe(0);
    const cumple = calcularMes(plan({ reglasPreference: [regla], tasaGlobal: { tipoTasa: "porcentaje", objetivo: 40 } }), V, "2026-06", e);
    expect(importeDe(cumple, "preference")).toBe(7000);
  });

  const diez = (financiados: number, extra: Partial<ExpedienteMotor> = {}): ExpedienteMotor[] =>
    Array.from({ length: 10 }, (_, i) => coche(100 + i, i < financiados ? { categoriaVenta: "CREDITO", fechaRci: "2026-06-05", ...extra } : { categoriaVenta: "CONTADO" }));
  const plan65 = () => plan({ tasaGlobal: { tipoTasa: "porcentaje", objetivo: 65 } });

  it("una financiación contratada en el mes suma aunque el coche se matricule otro mes (6/10 = 60 % → 7/10 = 70 %)", () => {
    const sin = calcularMes(plan65(), V, "2026-06", diez(6));
    expect(sin.tasaGlobal).toMatchObject({ numerador: 6, denominador: 10, cumplida: false });
    const adelantada = coche(200, { categoriaVenta: "CREDITO", fechaRci: "2026-06-20", fechaMatriculacion: "2026-07-03" });
    const con = calcularMes(plan65(), V, "2026-06", [...diez(6), adelantada]);
    expect(con.tasaGlobal).toMatchObject({ numerador: 7, denominador: 10, porcentaje: 70, cumplida: true });
  });

  it("al mes siguiente, el coche con la financiación del mes anterior cuenta en el denominador pero no en el numerador (9/10)", () => {
    const e = [...diez(10).map((x, i) => ({ ...x, fechaMatriculacion: "2026-07-15", fechaRci: i === 0 ? "2026-06-20" : "2026-07-05" }))];
    const r = calcularMes(plan65(), V, "2026-07", e);
    expect(r.tasaGlobal).toMatchObject({ numerador: 9, denominador: 10, porcentaje: 90 });
  });

  it("qué tipos de pago suman a la tasa lo decide el propio tipo de pago, no la categoría", () => {
    const e = [
      coche(1, { categoriaVenta: "CREDITO", fechaRci: "2026-06-10", cuentaParaTasa: false }),
      coche(2, { categoriaVenta: "CONTADO", fechaRci: "2026-06-10", cuentaParaTasa: true }),
      coche(3, { categoriaVenta: "PREFERENCE", fechaRci: "2026-06-10", cuentaParaTasa: true }),
      coche(4),
    ];
    const r = calcularMes(plan65(), V, "2026-06", e);
    expect(r.tasaGlobal).toMatchObject({ numerador: 2, denominador: 4, porcentaje: 50 });
  });

  it("marca los coches con la financiación en un mes distinto al que cuentan (adelantada y del mes anterior)", () => {
    const adelantada = coche(200, { categoriaVenta: "CREDITO", fechaRci: "2026-06-20", fechaMatriculacion: "2026-07-03" });
    const junio = calcularMes(plan65(), V, "2026-06", [...diez(6), adelantada]);
    expect(junio.financiacionesFueraDeMes).toEqual([{ idExpediente: 200, clase: "VN", tipo: "adelantada", mesRci: "2026-06", mesComputo: "2026-07" }]);
    const julio = calcularMes(plan65(), V, "2026-07", [adelantada, coche(201, { categoriaVenta: "CONTADO", fechaMatriculacion: "2026-07-10" })]);
    expect(julio.financiacionesFueraDeMes).toEqual([{ idExpediente: 200, clase: "VN", tipo: "anterior", mesRci: "2026-06", mesComputo: "2026-07" }]);
  });

  it("un importe se puede repartir entre conceptos: 125 € de Preference = 50 € a financiación y 75 € a Preference", () => {
    const e = [coche(1, { categoriaVenta: "PREFERENCE", fechaRci: "2026-06-10" })];
    const fila = { idMarca: 1, tipo: "PREFERENCE" as const, aplicaA: "VN", importe: 12500, reparto: [{ concepto: "financiacion", importe: 5000 }] };
    const r = calcularMes(plan({ financiacionPorMarcaTipo: [fila] }), V, "2026-06", e);
    expect(importeDe(r, "financiacion")).toBe(5000);
    expect(importeDe(r, "preference")).toBe(7500);
    expect(r.bruto).toBe(12500);
  });

  it("los conceptos propios del reparto crean su propio concepto y nunca superan el importe", () => {
    const e = [coche(1, { categoriaVenta: "CREDITO", fechaRci: "2026-06-10" })];
    const fila = { idMarca: 1, tipo: "CREDITO" as const, aplicaA: "VN", importe: 5000, reparto: [{ concepto: "Seguro", importe: 2000 }, { concepto: "extra:Garantía", importe: 9000 }] };
    const r = calcularMes(plan({ financiacionPorMarcaTipo: [fila] }), V, "2026-06", e);
    expect(importeDe(r, "extra:Seguro")).toBe(2000);
    expect(importeDe(r, "extra:Garantía")).toBe(3000); // solo queda lo que no se ha repartido
    expect(importeDe(r, "financiacion")).toBe(0);
    expect(r.bruto).toBe(5000);
  });

  it("la regla Preference también se reparte y el resto va a Preference", () => {
    const e = [coche(1, { categoriaVenta: "PREFERENCE", fechaRci: "2026-06-10" })];
    const regla = { id: 1, idMarca: null, idModelo: null, tipo: null, importe: 10000, reparto: [{ concepto: "Seguro", importe: 4000 }] };
    const r = calcularMes(plan({ reglasPreference: [regla] }), V, "2026-06", e);
    expect(importeDe(r, "extra:Seguro")).toBe(4000);
    expect(importeDe(r, "preference")).toBe(6000);
  });

  it("un concepto especial cuenta en el mes de la fecha del expediente que se elija", () => {
    const e = coche(1, {
      fechaExpediente: "2026-04-05",
      fechaAfectacion: "2026-05-02",
      fechaRci: "2026-05-20",
      fechaMatriculacion: "2026-06-15",
      fechaFacturacion: "2026-07-01",
      fechaEntrega: "2026-08-10",
      fechaCobro: "2026-09-03",
    });
    const mesDe = { pedido: "2026-04", afectacion: "2026-05", rci: "2026-05", fecha_matriculacion: "2026-06", facturacion: "2026-07", entrega: "2026-08", cobro: "2026-09" } as const;
    for (const [evento, mes] of Object.entries(mesDe)) {
      const conc = { ...e, conceptosEspeciales: [{ titulo: "Bonus", importe: 3000, evento: evento as keyof typeof mesDe }] };
      const r = calcularMes(plan({ fechaInicio: "2026-01-01", fechaFin: "2026-12-31" }), V, mes, [conc]);
      expect(importeDe(r, "especial"), evento).toBe(3000);
      const otro = calcularMes(plan({ fechaInicio: "2026-01-01", fechaFin: "2026-12-31" }), V, mes === "2026-04" ? "2026-10" : "2026-04", [conc]);
      expect(importeDe(otro, "especial"), `${evento} en otro mes`).toBe(0);
    }
  });
});
