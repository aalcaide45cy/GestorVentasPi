import { describe, expect, it } from "vitest";
import { fechaLarga, mesLargo, nombreAutomatico, nombrePropio } from "./biblioteca-categorias";

describe("nombre automático de los archivos de la biblioteca", () => {
  it("fechas y meses en letra", () => {
    expect(fechaLarga("2026-07-07")).toBe("07 Julio 2026");
    expect(fechaLarga("2026-13-01")).toBeNull();
    expect(fechaLarga(null)).toBeNull();
    expect(mesLargo("2024-04")).toBe("Abril 2024");
    expect(mesLargo("2024-4")).toBeNull();
  });

  it("nombres propios con mayúsculas bien puestas y sin caracteres prohibidos", () => {
    expect(nombrePropio("MARIA  DE LA SOLEDAD delgado/martin")).toBe("Maria de la Soledad Delgado Martin");
  });

  it("pedido, pago de RCI y rejilla", () => {
    expect(nombreAutomatico({ categoria: "pedido", cliente: "JOSE FRANCISCO GOMEZ", fecha: "2026-07-07", nombreOriginal: "SC332-1i26.PDF" })).toBe("Pedido - Jose Francisco Gomez - 07 Julio 2026.pdf");
    expect(nombreAutomatico({ categoria: "pago_rci", cliente: "Jose Francisco Gomez", fecha: "2026-07-07", nombreOriginal: "pago.pdf" })).toBe("Pago RCI - Jose Francisco Gomez - 07 Julio 2026.pdf");
    expect(nombreAutomatico({ categoria: "rejilla", mes: "2024-04", nombreOriginal: "Rejilla Comisiones - Abril 2024.pdf" })).toBe("Rejilla - Abril 2024.pdf");
    // Sin fecha: solo tipo y cliente
    expect(nombreAutomatico({ categoria: "pedido", cliente: "Ana Pérez", nombreOriginal: "x.pdf" })).toBe("Pedido - Ana Pérez.pdf");
  });

  it("si falta lo imprescindible no renombra", () => {
    expect(nombreAutomatico({ categoria: "pedido", cliente: null, fecha: "2026-07-07", nombreOriginal: "x.pdf" })).toBeNull();
    expect(nombreAutomatico({ categoria: "rejilla", mes: null, nombreOriginal: "x.pdf" })).toBeNull();
    expect(nombreAutomatico({ categoria: "listado", cliente: "Ana", nombreOriginal: "x.xlsx" })).toBeNull();
  });
});
