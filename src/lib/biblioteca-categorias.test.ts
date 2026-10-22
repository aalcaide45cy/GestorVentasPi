import { describe, expect, it } from "vitest";
import { fechaLarga, mesLargo, necesitaRenombrar, nombreAutomatico, nombrePropio } from "./biblioteca-categorias";

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

  it("con respaldo siempre queda con nombre y con fecha (la del documento o, si no, la de subida)", () => {
    const base = { fechaSubida: "2026-10-22", conRespaldo: true, nombreOriginal: "SCAN_0001.pdf" };
    expect(nombreAutomatico({ categoria: "pedido", cliente: null, fecha: null, ...base })).toBe("Pedido - Sin cliente - 22 Octubre 2026.pdf");
    expect(nombreAutomatico({ categoria: "pago_rci", cliente: "Ana Pérez", fecha: null, ...base })).toBe("Pago RCI - Ana Pérez - 22 Octubre 2026.pdf");
    expect(nombreAutomatico({ categoria: "pedido", cliente: "Ana Pérez", fecha: "2026-07-07", ...base })).toBe("Pedido - Ana Pérez - 07 Julio 2026.pdf");
    expect(nombreAutomatico({ categoria: "rejilla", mes: null, ...base })).toBe("Rejilla - 22 Octubre 2026.pdf");
    expect(nombreAutomatico({ categoria: "otro", ...base })).toBe("Documento - 22 Octubre 2026.pdf");
  });

  it("reconoce los archivos que aún tienen nombre de escáner", () => {
    expect(necesitaRenombrar("SC332-1i26.PDF", "pedido", "application/pdf")).toBe(true);
    expect(necesitaRenombrar("IMG_2031.jpg", "otro", "image/jpeg")).toBe(true);
    expect(necesitaRenombrar("Pedido - Jose Gomez - 07 Julio 2026.pdf", "pedido", "application/pdf")).toBe(false);
    expect(necesitaRenombrar("Pedido - Jose Gomez - 07 Julio 2026 (2).pdf", "pedido", "application/pdf")).toBe(false);
    expect(necesitaRenombrar("Pago RCI - Sin cliente - 22 Octubre 2026.pdf", "pago_rci", "application/pdf")).toBe(false);
    expect(necesitaRenombrar("Rejilla - Abril 2024.pdf", "rejilla", "application/pdf")).toBe(false);
    expect(necesitaRenombrar("comisiones.xlsx", "listado", "application/vnd.ms-excel")).toBe(false);
  });
});
