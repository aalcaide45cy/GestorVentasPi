import { describe, expect, it } from "vitest";
import { factorZoom, moverZoom, zoomValido } from "./zoom";

describe("tamaño de la página", () => {
  it("acepta cualquier entero entre 60 y 200", () => {
    expect(zoomValido("125")).toBe(125);
    expect(zoomValido("133")).toBe(133);
    expect(zoomValido("59")).toBe(100);
    expect(zoomValido("201")).toBe(100);
    expect(zoomValido("120.5")).toBe(100);
    expect(zoomValido(undefined)).toBe(100);
    expect(zoomValido("abc")).toBe(100);
  });
  it("sube y baja de 1 en 1 sin salirse de los límites", () => {
    expect(moverZoom(100, 1)).toBe(101);
    expect(moverZoom(100, -1)).toBe(99);
    expect(moverZoom(60, -1)).toBe(60);
    expect(moverZoom(200, 1)).toBe(200);
    expect(factorZoom(125)).toBe(1.25);
  });
});
