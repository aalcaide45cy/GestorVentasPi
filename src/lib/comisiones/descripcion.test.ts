import { describe, expect, it } from "vitest";
import { calcularMes, seleccionarPlan, type ExpedienteMotor, type PlanMotor, type ReglaBonusMotor, type VendedorMotor } from "./index";

/**
 * Contrato del motor: cada prueba fija una frase de la descripción del funcionamiento acordada con el propietario
 * (puntos, tramo, tasa de intervención, conceptos y totales). Las cifras están calculadas a mano.
 */

const V: VendedorMotor = { id: 1, tipo: "VN" };
const MES = "2026-06";

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
    objetivos: { 1: { base: 1200, arrastre: 0 } },
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

const vn = (desde: number, n: number, o: Partial<ExpedienteMotor> = {}) => Array.from({ length: n }, (_, k) => exp(desde + k, { fechaMatriculacion: "2026-06-15", ...o }));
const importe = (r: ReturnType<typeof calcularMes>, c: string) => r.lineas.flatMap((l) => l.conceptos).filter((x) => x.concepto === c).reduce((s, x) => s + x.importe, 0);
const regla = (o: Partial<ReglaBonusMotor> & Pick<ReglaBonusMotor, "id" | "evento">): ReglaBonusMotor => ({
  nombre: `R${o.id}`, tipoVehiculo: "cualquiera", fechaInicio: null, fechaFin: null, idMarca: null, idModelo: null,
  tasaIntervencion: "indiferente", puntos: 0, importe: 0, esPenalizacion: false, ligarACredito: false, ...o,
});
const tarifa = (importes: Record<string, number>, tasaCumplida = true) => ({ idModelo: 1, tasaCumplida, importes });

describe("1. Qué plan se usa", () => {
  it("gana el Activo y, entre activos, el de inicio más reciente", () => {
    const a = plan({ idPlan: 1, estado: "activo", fechaInicio: "2026-01-01", fechaFin: "2026-12-31" });
    const b = plan({ idPlan: 2, estado: "activo", fechaInicio: "2026-05-01", fechaFin: "2026-12-31" });
    const c = plan({ idPlan: 3, estado: "borrador", fechaInicio: "2026-06-01", fechaFin: "2026-12-31" });
    expect(seleccionarPlan([a, b, c], MES)?.idPlan).toBe(2);
    expect(seleccionarPlan([a, c], MES)?.idPlan).toBe(1);
  });
  it("sin plan el resultado es 0 con aviso, y se cobra el mes siguiente", () => {
    const r = calcularMes(null, V, MES, vn(1, 3));
    expect(r.neto).toBe(0);
    expect(r.avisos.length).toBe(1);
    expect(calcularMes(plan(), V, "2026-06", []).mesPago).toBe("2026-07");
    expect(calcularMes(plan(), V, "2026-12", []).mesPago).toBe("2027-01");
  });
});

describe("2. Cuándo cuenta un coche", () => {
  it("VN: cuenta por facturación si la hay; si no, por matriculación", () => {
    const facturadoAntes = exp(1, { fechaMatriculacion: "2026-07-02", fechaFacturacion: "2026-06-28" });
    expect(calcularMes(plan(), V, "2026-06", [facturadoAntes]).lineas.find((l) => l.idExpediente === 1)?.cuenta).toBe(true);
    expect(calcularMes(plan({ fechaFin: "2026-07-31" }), V, "2026-07", [facturadoAntes]).lineas.length).toBe(0);
    const sinFactura = exp(2, { fechaMatriculacion: "2026-06-10" });
    expect(calcularMes(plan(), V, "2026-06", [sinFactura]).lineas[0].cuenta).toBe(true);
  });
  it("un usado cuenta por su fecha de facturación; un nuevo «cobrado en otra fecha», por la de cobro", () => {
    const vo = exp(1, { clase: "VO", fechaFacturacion: "2026-06-20", fechaMatriculacion: "2026-05-01" });
    const vnCobro = exp(2, { fechaCobro: "2026-06-21", fechaMatriculacion: "2026-05-02", cobradoOtraFecha: true });
    const r = calcularMes(plan(), V, MES, [vo, vnCobro]);
    expect(r.lineas.filter((l) => l.cuenta).length).toBe(2);
  });
  it("sin fecha no cuenta en ningún mes y avisa (si tiene otro evento en el mes)", () => {
    const r = calcularMes(plan(), V, MES, [exp(1, { fechaExpediente: "2026-06-03" })]);
    expect(r.puntosMes).toBe(0);
    expect(r.avisos.some((a) => a.includes("no cuenta en ningún mes"))).toBe(true);
  });
});

describe("3. Puntos y tramo", () => {
  it("orden de puntos: propios (0 vale) → modelo → marca → 1,00", () => {
    const p = plan({ puntosPorDefectoModelo: { 1: 200 }, puntosPorDefectoMarca: { 1: 150, 2: 150 } });
    const puntos = (e: ExpedienteMotor) => calcularMes(p, V, MES, [e]).puntosMes;
    expect(puntos(exp(1, { fechaMatriculacion: "2026-06-05", puntos: 0 }))).toBe(0);
    expect(puntos(exp(1, { fechaMatriculacion: "2026-06-05", puntos: 75 }))).toBe(75);
    expect(puntos(exp(1, { fechaMatriculacion: "2026-06-05" }))).toBe(200);
    expect(puntos(exp(1, { fechaMatriculacion: "2026-06-05", idModelo: 9, idMarca: 2 }))).toBe(150);
    expect(puntos(exp(1, { fechaMatriculacion: "2026-06-05", idModelo: 9, idMarca: 7 }))).toBe(100);
  });
  it("promoción: con el mínimo cada coche vale los especiales; si no, los «si no cumple»", () => {
    const p = plan({ promociones: [{ id: 5, puntosEspeciales: 300, minimoUnidades: 3, puntosSiNoCumple: 50 }] });
    expect(calcularMes(p, V, MES, vn(1, 3, { idPromocion: 5 })).puntosMes).toBe(900);
    expect(calcularMes(p, V, MES, vn(1, 2, { idPromocion: 5 })).puntosMes).toBe(100);
  });
  it("puntos por pedido: solo si el coche no cuenta ya ese mismo mes", () => {
    const p = plan({ puntosPorPedido: 25 });
    const pedidoOtroMes = exp(1, { fechaExpediente: "2026-06-02", fechaMatriculacion: "2026-07-10" });
    const pedidoMismoMes = exp(2, { fechaExpediente: "2026-06-03", fechaMatriculacion: "2026-06-20" });
    const r = calcularMes(p, V, MES, [pedidoOtroMes, pedidoMismoMes]);
    expect(r.puntosMes).toBe(25 + 100);
  });
  it("puntos de reglas se suman al mes en su evento", () => {
    const p = plan({ reglasYBonus: [regla({ id: 1, evento: "afectacion", puntos: 40 })] });
    const r = calcularMes(p, V, MES, [exp(1, { fechaAfectacion: "2026-06-09", fechaMatriculacion: "2026-07-01" })]);
    expect(r.puntosMes).toBe(40);
  });
  it("tramo: X=12,00 con 13,00 → X+1; con 11,50 → X-1 (redondea hacia abajo)", () => {
    expect(calcularMes(plan(), V, MES, vn(1, 13)).tramo).toBe(1);
    expect(calcularMes(plan(), V, MES, [...vn(1, 11), exp(99, { fechaMatriculacion: "2026-06-15", puntos: 50 })]).tramo).toBe(-1);
    expect(calcularMes(plan(), V, MES, vn(1, 12)).tramo).toBe(0);
  });
  it("tramo limitado al rango del plan y arrastre suma al objetivo", () => {
    expect(calcularMes(plan(), V, MES, vn(1, 30)).tramo).toBe(3);
    expect(calcularMes(plan(), V, MES, vn(1, 1)).tramo).toBe(-4);
    const conArrastre = plan({ objetivos: { 1: { base: 1200, arrastre: 100 } } });
    expect(calcularMes(conArrastre, V, MES, vn(1, 13)).objetivoX).toBe(1300);
    expect(calcularMes(conArrastre, V, MES, vn(1, 13)).tramo).toBe(0);
  });
});

describe("4. Tasa de intervención", () => {
  const credito = (desde: number, n: number) => vn(desde, n, { categoriaVenta: "CREDITO", fechaRci: "2026-06-20" });
  it("marca sin tasa configurada: objetivo por defecto del 70 %", () => {
    const sieteDeDiez = [...credito(1, 7), ...vn(8, 3)];
    expect(calcularMes(plan(), V, MES, sieteDeDiez).tasaIntervencion[0].cumplida).toBe(true);
    const seisDeDiez = [...credito(1, 6), ...vn(7, 4)];
    const t = calcularMes(plan(), V, MES, seisDeDiez).tasaIntervencion[0];
    expect(t.cumplida).toBe(false);
    expect(t.numerador).toBe(6);
    expect(t.denominador).toBe(10);
  });
  it("tasa en unidades y en porcentaje configurado", () => {
    const e = [...credito(1, 3), ...vn(4, 7)];
    expect(calcularMes(plan({ tasaIntervencionPorMarca: [{ idMarca: 1, tipoTasa: "unidades", objetivo: 3 }] }), V, MES, e).tasaIntervencion[0].cumplida).toBe(true);
    expect(calcularMes(plan({ tasaIntervencionPorMarca: [{ idMarca: 1, tipoTasa: "unidades", objetivo: 4 }] }), V, MES, e).tasaIntervencion[0].cumplida).toBe(false);
    expect(calcularMes(plan({ tasaIntervencionPorMarca: [{ idMarca: 1, tipoTasa: "porcentaje", objetivo: 30 }] }), V, MES, e).tasaIntervencion[0].cumplida).toBe(true);
  });
  it("contado no suma al numerador; Preference y Renting sí; los VO financiados también cuentan", () => {
    const e = [
      ...vn(1, 1, { categoriaVenta: "PREFERENCE", fechaRci: "2026-06-02" }),
      ...vn(2, 1, { categoriaVenta: "RENTING", fechaRci: "2026-06-03" }),
      ...vn(3, 1, { categoriaVenta: "CONTADO", fechaRci: "2026-06-04" }),
      exp(4, { clase: "VO", fechaFacturacion: "2026-06-05", categoriaVenta: "CREDITO", fechaRci: "2026-06-05" }),
    ];
    const t = calcularMes(plan(), V, MES, e).tasaIntervencion[0];
    expect(t.numerador).toBe(3);
    expect(t.denominador).toBe(4);
    const sinVo = calcularMes(plan({ tasaIncluyeVo: false }), V, MES, e).tasaIntervencion[0];
    expect(sinVo.numerador).toBe(2);
    expect(sinVo.denominador).toBe(3);
  });
  it("sin VN de esa marca en el mes se considera cumplida", () => {
    const soloRci = [exp(1, { fechaMatriculacion: "2026-05-10", categoriaVenta: "CREDITO", fechaRci: "2026-06-10" })];
    const t = calcularMes(plan(), V, MES, soloRci).tasaIntervencion[0];
    expect(t.denominador).toBe(0);
    expect(t.cumplida).toBe(true);
  });
  it("⚠️ el numerador va por mes de RCI y el denominador por mes de cómputo (comportamiento antiguo)", () => {
    // 2 coches cuentan en junio sin RCI; 2 coches de mayo tienen su RCI en junio → 2/2 = 100 %
    const e = [...vn(1, 2), ...vn(3, 2, { fechaMatriculacion: "2026-05-20", categoriaVenta: "CREDITO", fechaRci: "2026-06-05" })];
    const t = calcularMes(plan(), V, MES, e).tasaIntervencion[0];
    expect(t.numerador).toBe(2);
    expect(t.denominador).toBe(2);
    expect(t.cumplida).toBe(true);
  });
});

describe("5. Qué cobra cada concepto", () => {
  it("coche VN: tarifa por tramo y tasa; sin tarifa o línea inactiva = 0 con aviso", () => {
    const p = plan({ tarifasVN: [tarifa({ "1": 30000, "0": 20000 }, true), tarifa({ "1": 10000 }, false)] });
    const e = vn(1, 13, { categoriaVenta: "CREDITO", fechaRci: "2026-06-10" }); // 13 pts → X+1, tasa 100 % cumplida
    expect(importe(calcularMes(p, V, MES, e), "coche_vn")).toBe(13 * 30000);
    const noCumple = [...vn(1, 13)]; // contado: tasa 0 % → no cumplida
    expect(importe(calcularMes(p, V, MES, noCumple), "coche_vn")).toBe(13 * 10000);
    const inactiva = plan({ tarifasVN: [{ ...tarifa({ "1": 30000 }), activo: false }] });
    const r = calcularMes(inactiva, V, MES, vn(1, 13, { categoriaVenta: "CREDITO", fechaRci: "2026-06-10" }));
    expect(importe(r, "coche_vn")).toBe(0);
    expect(r.avisos.some((a) => a.includes("Sin tarifa"))).toBe(true);
  });
  it("un vendedor de VO no cobra comisión de coche VN", () => {
    const p = plan({ tarifasVN: [tarifa({ "-4": 20000 }, false)], objetivos: { 1: { base: 1200, arrastre: 0 } } });
    const r = calcularMes(p, { id: 1, tipo: "VO" }, MES, vn(1, 1));
    expect(importe(r, "coche_vn")).toBe(0);
    expect(r.avisos.some((a) => a.includes("vendedor de VO"))).toBe(true);
  });
  it("importe a mano sustituye al cálculo automático", () => {
    const p = plan({ tarifasVN: [tarifa({ "-4": 20000 }, false)] });
    const r = calcularMes(p, V, MES, [exp(1, { fechaMatriculacion: "2026-06-05", comisionCocheManual: 12345 })]);
    expect(importe(r, "coche_vn")).toBe(12345);
  });
  it("VO por subtipo: 1ª unidad y resto, con mínimo para aplicar", () => {
    const p = plan({ tarifasUsadosPorSubtipo: [{ subtipo: "DEMO", importePrimera: 20000, importeResto: 10000, minAplicar: 2 }] });
    const vo = (id: number) => exp(id, { clase: "VO", subtipoVO: "demo", fechaFacturacion: `2026-06-${10 + id}`, fechaMatriculacion: "2026-01-01" });
    expect(importe(calcularMes(p, V, MES, [vo(1), vo(2), vo(3)]), "vo")).toBe(20000 + 10000 + 10000);
    expect(importe(calcularMes(p, V, MES, [vo(1)]), "vo")).toBe(0); // mínimo no alcanzado
  });
  it("VO sin tarifa de subtipo = 0 con aviso; con escalones, por unidad; sin escalones fijos, 150 €", () => {
    const sinTarifa = calcularMes(plan(), V, MES, [exp(1, { clase: "VO", subtipoVO: "KM0", fechaFacturacion: "2026-06-10" })]);
    expect(importe(sinTarifa, "vo")).toBe(0);
    expect(sinTarifa.avisos.some((a) => a.includes("Sin tarifa de VO"))).toBe(true);
    const vendedorVO: VendedorMotor = { id: 1, tipo: "VO", patronVo: "P" };
    const vo = (id: number) => exp(id, { clase: "VO", fechaFacturacion: `2026-06-${10 + id}` });
    const conEscalones = plan({ patronesVO: [{ nombre: "P", aplicaAVn: false, tiers: [{ unidad: 1, importe: 5000 }, { unidad: 2, importe: 8000 }] }] });
    expect(importe(calcularMes(conEscalones, vendedorVO, MES, [vo(1), vo(2), vo(3)]), "vo")).toBe(5000 + 8000 + 8000);
    expect(importe(calcularMes(plan(), { id: 1, tipo: "VO" }, MES, [vo(1), vo(2)]), "vo")).toBe(30000);
    const aplicaAVn: VendedorMotor = { id: 1, tipo: "VN", patronVo: "P" };
    const pAVn = plan({ patronesVO: [{ nombre: "P", aplicaAVn: true, tiers: [{ unidad: 1, importe: 7000 }] }] });
    expect(importe(calcularMes(pAVn, aplicaAVn, MES, [vo(1)]), "vo")).toBe(7000);
  });
  it("financiación: por marca y tipo en el mes de la RCI; contado no genera", () => {
    const p = plan({ financiacionPorMarcaTipo: [{ idMarca: 1, tipo: "CREDITO", importe: 9000 }, { idMarca: 1, tipo: "RENTING", importe: 4000 }] });
    const e = [
      exp(1, { fechaMatriculacion: "2026-05-02", categoriaVenta: "CREDITO", fechaRci: "2026-06-03" }),
      exp(2, { fechaMatriculacion: "2026-05-02", categoriaVenta: "RENTING", fechaRci: "2026-06-04" }),
      exp(3, { fechaMatriculacion: "2026-06-02", categoriaVenta: "CONTADO", fechaRci: "2026-06-05" }),
    ];
    expect(importe(calcularMes(p, V, MES, e), "financiacion")).toBe(13000);
    expect(importe(calcularMes(plan({ fechaInicio: "2026-05-01", fechaFin: "2026-05-31" }), V, "2026-05", e), "financiacion")).toBe(0);
  });
  it("Preference/BOX3: solo la regla más específica (marca+modelo > modelo > marca > general)", () => {
    const r = (id: number, idMarca: number | null, idModelo: number | null, importe: number) => ({ id, idMarca, idModelo, tipo: null, importe });
    const p = plan({ reglasPreference: [r(1, null, null, 1000), r(2, 1, null, 2000), r(3, null, 1, 3000), r(4, 1, 1, 4000)] });
    const e = [exp(1, { fechaMatriculacion: "2026-06-02", categoriaVenta: "PREFERENCE", fechaRci: "2026-06-03" })];
    expect(importe(calcularMes(p, V, MES, e), "preference")).toBe(4000);
    const sinMarcaModelo = plan({ reglasPreference: [r(1, null, null, 1000), r(2, 1, null, 2000), r(3, null, 1, 3000)] });
    expect(importe(calcularMes(sinMarcaModelo, V, MES, e), "preference")).toBe(3000);
    // un expediente de crédito no genera Preference
    const cred = [exp(2, { fechaMatriculacion: "2026-06-02", categoriaVenta: "CREDITO", fechaRci: "2026-06-03" })];
    expect(importe(calcularMes(p, V, MES, cred), "preference")).toBe(0);
  });
  it("reglas y bonus: en el mes de su evento, con filtros; la penalización resta", () => {
    const p = plan({
      reglasYBonus: [
        regla({ id: 1, evento: "afectacion", importe: 5000 }),
        regla({ id: 2, evento: "afectacion", importe: 2000, esPenalizacion: true }),
        regla({ id: 3, evento: "matriculacion", importe: 7000, tipoVehiculo: "usado" }),
        regla({ id: 4, evento: "afectacion", importe: 9000, idMarca: 99 }),
      ],
    });
    const e = [exp(1, { fechaAfectacion: "2026-06-12", fechaMatriculacion: "2026-06-20" })];
    expect(importe(calcularMes(p, V, MES, e), "regla")).toBe(5000 - 2000);
  });
  it("«ligar a crédito»: la regla Preference solo suma si también aplica una regla de crédito", () => {
    const p = plan({ reglasYBonus: [regla({ id: 1, evento: "preference", importe: 3000, ligarACredito: true })] });
    const e = [exp(1, { fechaMatriculacion: "2026-06-02", categoriaVenta: "PREFERENCE", fechaRci: "2026-06-03" })];
    expect(importe(calcularMes(p, V, MES, e), "regla")).toBe(0);
    const conCredito = plan({ reglasYBonus: [regla({ id: 1, evento: "preference", importe: 3000, ligarACredito: true }), regla({ id: 2, evento: "credito", importe: 1000 })] });
    expect(importe(calcularMes(conCredito, V, MES, e), "regla")).toBe(3000);
  });
  it("conceptos especiales: importe a mano en el mes de su evento", () => {
    const e = [exp(1, { fechaAfectacion: "2026-06-10", fechaMatriculacion: "2026-07-05", conceptosEspeciales: [{ titulo: "Extra", importe: 4500, evento: "afectacion" }] })];
    expect(importe(calcularMes(plan(), V, MES, e), "especial")).toBe(4500);
    expect(importe(calcularMes(plan({ fechaFin: "2026-07-31" }), V, "2026-07", e), "especial")).toBe(0);
  });
});

describe("6. Totales", () => {
  it("neto = bruto − penalización global, nunca menos de 0", () => {
    const p = plan({ tarifasVN: [tarifa({ "-4": 10000 }, false)], penalizacionImporte: 3000 });
    const r = calcularMes(p, V, MES, vn(1, 2));
    expect(r.bruto).toBe(20000);
    expect(r.penalizacion).toBe(3000);
    expect(r.neto).toBe(17000);
    const grande = calcularMes(plan({ penalizacionImporte: 99999 }), V, MES, vn(1, 1));
    expect(grande.neto).toBe(0);
  });
});
