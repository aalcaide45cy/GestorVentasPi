import { describe, expect, it } from "vitest";
import { completarConBanda, faltasDeLaCabecera, hayFaltas, pareceUnPedido } from "./cabecera-pedido";

const completo = ["PEDIDO DE VEHÍCULO NUEVO", "Número Pedido 12706016 - 7063-00 - dnt - DJF774949654", "Emitido: Miércoles, 07 Mayo 2025 / 19:24 hs.", "Modelo:  DACIA BIGSTER Extreme hybrid 155  25.549,50 €"].join("\n");

describe("refuerzo de la cabecera de un pedido escaneado", () => {
  it("una lectura completa no necesita refuerzo, y lo que no parece un pedido tampoco", () => {
    expect(hayFaltas(faltasDeLaCabecera(completo))).toBe(false);
    expect(pareceUnPedido("FICHA DE MANTENIMIENTO DEL TALLER")).toBe(false);
    expect(hayFaltas(faltasDeLaCabecera("FICHA DE MANTENIMIENTO DEL TALLER"))).toBe(false);
  });

  it("detecta que faltan el número, la fecha de «Emitido» o el modelo", () => {
    const sin = ["PEDIDO DE VEHÍCULO NUEVO", "e-", "Emitido: Miércoles, 07ay.", "Modelo:  25.549,50 €"].join("\n");
    expect(faltasDeLaCabecera(sin)).toEqual({ numero: true, emitido: true, modelo: true });
    // El modelo leído con la marca rota («Rullt Ci») también cuenta como falta
    expect(faltasDeLaCabecera(completo.replace("DACIA BIGSTER Extreme", "Rullt Ci"))).toMatchObject({ modelo: true });
  });

  it("completa con la franja el número y la fecha (arriba) y sustituye la línea del modelo rota, sin tocar lo que estaba bien", () => {
    const sin = ["PEDIDO DE VEHÍCULO NUEVO", "e-", "Cliente Ana", "Modelo:  Rullt Ci  20.846,82 €"].join("\n");
    const banda = ["Número Pedido 12706016 - 7063-00", "Emitido: Miércoles, 07 Mayo 2025 / 19:24 hs.", "Modelo:  RENAULT Renault Clio techno full hybrid  20.846,82 €"];
    const r = completarConBanda(sin, banda).split("\n");
    expect(r.slice(0, 2)).toEqual(["Número Pedido 12706016 - 7063-00", "Emitido: Miércoles, 07 Mayo 2025 / 19:24 hs."]);
    expect(r).toContain("Cliente Ana");
    expect(r).toContain("Modelo:  RENAULT Renault Clio techno full hybrid  20.846,82 €");
    expect(r).not.toContain("Modelo:  Rullt Ci  20.846,82 €");
    // Lo ya completo queda igual
    expect(completarConBanda(completo, banda)).toBe(completo);
  });

  it("si la franja tampoco trae nada útil, el texto queda como estaba", () => {
    const sin = ["PEDIDO DE VEHÍCULO NUEVO", "Modelo:  454,55 €"].join("\n");
    expect(completarConBanda(sin, ["Modelo:  454,55 €", "ruido"])).toBe(sin);
  });
});
