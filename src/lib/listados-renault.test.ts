import { describe, expect, it } from "vitest";
import { leerListadoRenault } from "./listados-renault";

const csv = (texto: string) => new TextEncoder().encode(texto).buffer as ArrayBuffer;

describe("listado de Renault", () => {
  it("reconoce «Fra. prevista» como la fecha de facturación", () => {
    const l = leerListadoRenault(csv("Cliente,Bastidor,Matrícula,F. Afect,Fra. prevista\nANA PEREZ,VF1ABC,1234BCD,01/10/2026,31/10/2026\n"), "usados.csv");
    expect(l.filas[0].fFactura).toBe("2026-10-31");
    expect(l.columnasUsadas).toContain("Fra. prevista");
  });
});
