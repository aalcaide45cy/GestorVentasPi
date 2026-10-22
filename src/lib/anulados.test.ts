import { describe, expect, it } from "vitest";
import { claveMostrarAnulados, esAnulado } from "./anulados";

describe("expedientes anulados", () => {
  it("reconoce el estado Anulado de la intranet con cualquier escritura", () => {
    expect(esAnulado("Anulado")).toBe(true);
    expect(esAnulado("ANULADO")).toBe(true);
    expect(esAnulado("Pedido anulada")).toBe(true);
    expect(esAnulado("Archivado")).toBe(false);
    expect(esAnulado("Matriculación")).toBe(false);
    expect(esAnulado(null)).toBe(false);
    expect(esAnulado(undefined)).toBe(false);
    expect(esAnulado("")).toBe(false);
  });
  it("la preferencia de cada pantalla tiene su propia clave", () => {
    expect(claveMostrarAnulados("contraste")).not.toBe(claveMostrarAnulados("expedientes"));
  });
});
