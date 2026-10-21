import { describe, expect, it } from "vitest";
import type { PlanEditable } from "@/lib/servicios/planes";
import { FRAGMENTO_POR_DEFECTO, conAjustesPorDefecto } from "./defecto";

const planVacio = { idPlan: 0, nombre: "Noviembre 2026", fechaInicio: "2026-11-01", fechaFin: "2026-11-30", estado: "borrador", tramoMin: -2, tramoMax: 5, puntosPorPedido: 3, voPuntosModo: "no_cuentan", voPuntos: 0, tasaGlobalTipo: "unidades", tasaGlobalObjetivo: 9, tasaVoTipo: "unidades", tasaVoObjetivo: 4, tasaIncluyeVo: false, penalizacionImporte: 50, penalizacionTitulo: "x", penalizacionDescripcion: "y", notas: "mis notas", vendedores: [{ idUsuario: 1, objetivoBase: 10, arrastre: 0 }], promociones: [], puntosModelo: [], tasas: [], tarifasVN: [], usados: [], patrones: [], financiacion: [], preference: [], reglas: [], bonus: [], pendientes: [] } as unknown as PlanEditable;
const cat = { marcas: [{ id: 1, nombre: "Dacia" }, { id: 2, nombre: "Renault" }], modelos: [{ id: 10, nombre: "Sandero", marcaId: 1 }, { id: 20, nombre: "Clio", marcaId: 2 }], vendedores: [] };

describe("ajustes por defecto de un plan nuevo", () => {
  it("trae los 20 modelos con sus dos tarifas y los tramos de siempre", () => {
    expect(FRAGMENTO_POR_DEFECTO.tarifasVN).toHaveLength(40);
    expect(FRAGMENTO_POR_DEFECTO.resumen).toMatchObject({ tramoMin: -4, tramoMax: 3 });
  });

  it("pone tramos, tarifas de los modelos que existen y opciones de usados, y respeta nombre, fechas, vendedores y notas", () => {
    const { plan, tarifas } = conAjustesPorDefecto(planVacio, cat);
    expect(tarifas).toBe(4);
    expect(plan.tarifasVN).toHaveLength(4);
    expect(plan).toMatchObject({ tramoMin: -4, tramoMax: 3, puntosPorPedido: 0, voPuntosModo: "cuentan", voPuntos: 100, tasaGlobalTipo: "porcentaje", penalizacionImporte: 0 });
    expect(plan).toMatchObject({ idPlan: 0, nombre: "Noviembre 2026", fechaInicio: "2026-11-01", fechaFin: "2026-11-30", notas: "mis notas" });
    expect(plan.vendedores).toHaveLength(1);
  });

  it("sin modelos en el catálogo no rompe: el plan se queda sin tarifas", () => {
    const { plan, tarifas } = conAjustesPorDefecto(planVacio, { marcas: [], modelos: [], vendedores: [] });
    expect(tarifas).toBe(0);
    expect(plan.tarifasVN).toHaveLength(0);
  });
});
