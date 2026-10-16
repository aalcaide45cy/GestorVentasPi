import { describe, expect, it } from "vitest";
import { aplicarEscenario, contarCambios, type PlanMotor } from "./index";

const plan: PlanMotor = {
  idPlan: 1, fechaInicio: "2026-06-01", fechaFin: "2026-06-30", estado: "activo", tramoMin: -4, tramoMax: 3, puntosPorPedido: 0, penalizacionImporte: 0,
  objetivos: { 1: { base: 1200, arrastre: 0 } }, puntosPorDefectoModelo: {}, puntosPorDefectoMarca: { 1: 100 },
  promociones: [{ id: 5, puntosEspeciales: 300, minimoUnidades: 3, puntosSiNoCumple: 50 }],
  tarifasVN: [{ idModelo: 1, tasaCumplida: true, importes: { "0": 20000 } }], tarifasUsadosPorSubtipo: [], patronesVO: [], financiacionPorMarcaTipo: [], reglasPreference: [],
  reglasYBonus: [{ id: 7, nombre: "R", evento: "afectacion", tipoVehiculo: "cualquiera", fechaInicio: null, fechaFin: null, idMarca: null, idModelo: null, tasaIntervencion: "indiferente", puntos: 0, importe: 5000, esPenalizacion: false, ligarACredito: false }],
  tasaIntervencionPorMarca: [{ idMarca: 1, tipoTasa: "porcentaje", objetivo: 70 }],
};

describe("aplicarEscenario", () => {
  it("no modifica el plan original y aplica cada tipo de cambio", () => {
    const copia = JSON.stringify(plan);
    const c = {
      objetivoBase: 900, puntosPorPedido: 25, penalizacionImporte: 3000, tramoMax: 5,
      tasas: { "1": { objetivo: 50, puntosDefecto: 150 } }, reglas: { "7": { activa: false, importe: 9000 } },
      promociones: { "5": { minimoUnidades: 2 } }, tarifas: [{ idModelo: 1, tasaCumplida: true, tramo: 1, importe: 31000 }, { idModelo: 2, tasaCumplida: false, tramo: 0, importe: 1 }],
    };
    const p = aplicarEscenario(plan, 1, c);
    expect(JSON.stringify(plan)).toBe(copia);
    expect(p.objetivos[1]).toEqual({ base: 900, arrastre: 0 });
    expect([p.puntosPorPedido, p.penalizacionImporte, p.tramoMax]).toEqual([25, 3000, 5]);
    expect(p.tasaIntervencionPorMarca[0].objetivo).toBe(50);
    expect(p.puntosPorDefectoMarca[1]).toBe(150);
    expect(p.reglasYBonus[0]).toMatchObject({ activa: false, importe: 9000 });
    expect(p.promociones[0].minimoUnidades).toBe(2);
    expect(p.tarifasVN[0].importes).toEqual({ "0": 20000, "1": 31000 });
    expect(p.tarifasVN).toHaveLength(2);
    expect(contarCambios(c)).toBe(11);
  });
  it("ignora reglas o promociones que no existen", () => {
    const p = aplicarEscenario(plan, 1, { reglas: { "999": { importe: 1 } }, promociones: { "999": { puntosEspeciales: 1 } } });
    expect(p).toEqual(plan);
  });
});
