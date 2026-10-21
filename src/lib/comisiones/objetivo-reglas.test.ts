import { describe, expect, it } from "vitest";
import { calcularMes, type ExpedienteMotor, type PlanMotor, type VendedorMotor } from "./index";
import { ajustesDeObjetivo } from "./motor";

const V: VendedorMotor = { id: 1, tipo: "VN" };

const plan = (o: Partial<PlanMotor> = {}): PlanMotor => ({
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
  ...o,
});

const coche = (id: number, o: Partial<ExpedienteMotor> = {}): ExpedienteMotor => ({
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
});

const sinUsados = { metrica: "vo", comparador: "menos_de", cantidad: 1, puntos: 100 } as const;

describe("reglas que cambian el objetivo del mes", () => {
  it("sin ningún usado el objetivo sube 1 punto; con un usado no cambia", () => {
    const p = plan({ reglasObjetivo: [{ ...sinUsados, nombre: "Mes sin usados" }] });
    const sin = calcularMes(p, V, "2026-06", [coche(1), coche(2)]);
    expect(sin.objetivoX).toBe(1400);
    expect(sin.objetivoBase).toBe(1300);
    expect(sin.objetivoAjustes).toEqual([{ nombre: "Mes sin usados", puntos: 100 }]);
    const con = calcularMes(p, V, "2026-06", [coche(1), coche(2, { clase: "VO", subtipoVO: "USADO" })]);
    expect(con.objetivoX).toBe(1300);
    expect(con.objetivoAjustes).toEqual([]);
  });

  it("el ajuste cambia el tramo (se compara con el objetivo ya ajustado)", () => {
    const coches = Array.from({ length: 13 }, (_, i) => coche(i + 1));
    const normal = calcularMes(plan(), V, "2026-06", coches);
    const con = calcularMes(plan({ reglasObjetivo: [sinUsados] }), V, "2026-06", coches);
    expect(con.tramo).toBe(normal.tramo - 1);
  });

  it("también por matriculados en total, con puntos negativos y reglas desactivadas", () => {
    const coches = [1, 2, 3].map((i) => coche(i));
    expect(ajustesDeObjetivo([{ metrica: "total", comparador: "al_menos", cantidad: 3, puntos: -50 }], ["VN", "VN", "VN"])).toEqual([{ nombre: "Al menos 3 coches", puntos: -50 }]);
    expect(ajustesDeObjetivo([{ metrica: "total", comparador: "al_menos", cantidad: 4, puntos: -50 }], ["VN", "VN", "VN"])).toEqual([]);
    expect(ajustesDeObjetivo([{ ...sinUsados, activa: false }], [])).toEqual([]);
    const r = calcularMes(plan({ reglasObjetivo: [{ metrica: "total", comparador: "al_menos", cantidad: 3, puntos: -50 }] }), V, "2026-06", coches);
    expect(r.objetivoX).toBe(1250);
  });

  it("el objetivo nunca baja de 0 y sin objetivo del vendedor no se aplica nada", () => {
    const r = calcularMes(plan({ objetivos: { 1: { base: 20, arrastre: 0 } }, reglasObjetivo: [{ ...sinUsados, puntos: -500 }] }), V, "2026-06", [coche(1)]);
    expect(r.objetivoX).toBe(0);
    const sinObj = calcularMes(plan({ objetivos: {}, reglasObjetivo: [sinUsados] }), V, "2026-06", [coche(1)]);
    expect(sinObj.objetivoX).toBe(0);
  });
});
