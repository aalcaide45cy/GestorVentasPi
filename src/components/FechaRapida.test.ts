import { describe, expect, it } from "vitest";
import { moverFecha, ponerParteActual } from "./FechaRapida";

describe("moverFecha", () => {
  it("suma y resta días cambiando de mes y de año", () => {
    expect(moverFecha("2026-10-31", "dia", 1)).toBe("2026-11-01");
    expect(moverFecha("2026-01-01", "dia", -1)).toBe("2025-12-31");
    expect(moverFecha("2028-02-28", "dia", 1)).toBe("2028-02-29");
  });
  it("mueve meses respetando la longitud del mes y el cambio de año", () => {
    expect(moverFecha("2026-03-31", "mes", -1)).toBe("2026-02-28");
    expect(moverFecha("2026-01-31", "mes", 1)).toBe("2026-02-28");
    expect(moverFecha("2026-12-15", "mes", 1)).toBe("2027-01-15");
    expect(moverFecha("2026-01-15", "mes", -1)).toBe("2025-12-15");
  });
  it("mueve años y ajusta el 29 de febrero", () => {
    expect(moverFecha("2028-02-29", "anio", 1)).toBe("2029-02-28");
    expect(moverFecha("2026-10-16", "anio", -1)).toBe("2025-10-16");
  });
});

describe("ponerParteActual", () => {
  it("cambia solo la parte pedida al valor de hoy", () => {
    expect(ponerParteActual("2025-03-05", "dia", "2026-10-16")).toBe("2025-03-16");
    expect(ponerParteActual("2025-03-05", "mes", "2026-10-16")).toBe("2025-10-05");
    expect(ponerParteActual("2025-03-05", "anio", "2026-10-16")).toBe("2026-03-05");
  });
  it("ajusta el día si el mes de destino es más corto", () => {
    expect(ponerParteActual("2025-03-31", "mes", "2026-02-10")).toBe("2025-02-28");
    expect(ponerParteActual("2028-02-29", "anio", "2026-10-16")).toBe("2026-02-28");
  });
});
