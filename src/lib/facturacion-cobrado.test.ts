import { describe, expect, it } from "vitest";
import { estadoYaCobrado, facturacionPorEstadoCobrado } from "./facturacion-cobrado";

const base = { esUsado: false, estadoListado: "Matriculación", facturacionActual: null, facturacionListado: null, matriculacion: null, hoy: "2026-10-27" };

describe("facturacionPorEstadoCobrado", () => {
  it("sin matriculación pone la fecha de hoy", () => expect(facturacionPorEstadoCobrado(base)).toBe("2026-10-27"));
  it("con matriculación pone esa fecha", () => expect(facturacionPorEstadoCobrado({ ...base, matriculacion: "2026-09-04" })).toBe("2026-09-04"));
  it("vale en Post-venta y Archivado", () => {
    expect(facturacionPorEstadoCobrado({ ...base, estadoListado: "Post-venta" })).toBe("2026-10-27");
    expect(facturacionPorEstadoCobrado({ ...base, estadoListado: "ARCHIVADO" })).toBe("2026-10-27");
  });
  it("no hace nada en Comercial ni en Distribución", () => {
    expect(facturacionPorEstadoCobrado({ ...base, estadoListado: "Comercial" })).toBeNull();
    expect(facturacionPorEstadoCobrado({ ...base, estadoListado: "Distribución" })).toBeNull();
  });
  it("nunca pisa una fecha ya puesta", () => {
    expect(facturacionPorEstadoCobrado({ ...base, facturacionActual: "2026-08-01" })).toBeNull();
    expect(facturacionPorEstadoCobrado({ ...base, facturacionListado: "2026-08-01" })).toBeNull();
  });
  it("no se aplica a los usados", () => expect(facturacionPorEstadoCobrado({ ...base, esUsado: true })).toBeNull());
  it("reconoce el estado sin acentos ni mayúsculas", () => {
    expect(estadoYaCobrado("matriculacion")).toBe(true);
    expect(estadoYaCobrado(null)).toBe(false);
  });
});
