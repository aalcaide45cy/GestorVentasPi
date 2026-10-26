import { describe, expect, it } from "vitest";
import { coloresFilasDashboard, moverPanel, ordenPanelesDashboard, panelesOcultosDashboard, recientesDashboard, type IdPanelDashboard } from "./dashboard-paneles";

describe("paneles del dashboard", () => {
  it("el orden por defecto trae todos los paneles y un orden guardado se completa con los que falten", () => {
    expect(ordenPanelesDashboard(null)).toEqual(["validacion", "metricas", "documentos", "recientes", "rapida"]);
    expect(ordenPanelesDashboard(JSON.stringify(["recientes", "viejo", "metricas"]))).toEqual(["recientes", "metricas", "validacion", "documentos", "rapida"]);
    expect(ordenPanelesDashboard("no es json")).toHaveLength(5);
  });
  it("los ocultos ignoran lo que no existe", () => {
    expect(panelesOcultosDashboard(JSON.stringify(["rapida", "otro", "rapida"]))).toEqual(["rapida"]);
    expect(panelesOcultosDashboard(null)).toEqual([]);
  });
  it("los últimos expedientes valen de 1 a 50 y, si no, 5", () => {
    expect(recientesDashboard("12")).toBe(12);
    expect(recientesDashboard("0")).toBe(5);
    expect(recientesDashboard("51")).toBe(5);
    expect(recientesDashboard("x")).toBe(5);
    expect(recientesDashboard(null)).toBe(5);
  });
  it("arrastrar un panel lo deja en el sitio del panel sobre el que se suelta", () => {
    const o: IdPanelDashboard[] = ["validacion", "metricas", "documentos", "recientes", "rapida"];
    expect(moverPanel(o, "rapida", "metricas")).toEqual(["validacion", "rapida", "metricas", "documentos", "recientes"]);
    expect(moverPanel(o, "validacion", "documentos")).toEqual(["metricas", "documentos", "validacion", "recientes", "rapida"]);
    expect(moverPanel(o, "metricas", "metricas")).toEqual(o);
  });
  it("los colores de fila del Dashboard están activados salvo que se desactiven", () => {
    expect(coloresFilasDashboard(null)).toBe(true);
    expect(coloresFilasDashboard("true")).toBe(true);
    expect(coloresFilasDashboard("false")).toBe(false);
  });
});
