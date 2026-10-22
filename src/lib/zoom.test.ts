import { describe, expect, it } from "vitest";
import { factorZoom, moverZoom, zoomValido } from "./zoom";

describe("tamaño de la página", () => {
  it("solo acepta los tamaños de la lista", () => {
    expect(zoomValido("125")).toBe(125);
    expect(zoomValido("133")).toBe(100);
    expect(zoomValido(undefined)).toBe(100);
    expect(zoomValido("abc")).toBe(100);
  });
  it("sube y baja sin salirse de la lista", () => {
    expect(moverZoom(100, 1)).toBe(110);
    expect(moverZoom(100, -1)).toBe(90);
    expect(moverZoom(60, -1)).toBe(60);
    expect(moverZoom(200, 1)).toBe(200);
    expect(factorZoom(125)).toBe(1.25);
  });
});
