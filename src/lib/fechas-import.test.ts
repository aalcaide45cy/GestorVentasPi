import { describe, expect, it } from "vitest";
import { limpiarMatricula, limpiarTelefono, parseFechaFlexible } from "./fechas-import";

describe("parseFechaFlexible (10.4)", () => {
  it("acepta DD/MM/AAAA, DD-MM-AAAA y AAAA-MM-DD", () => {
    expect(parseFechaFlexible("15/10/2026")).toBe("2026-10-15");
    expect(parseFechaFlexible("5-3-2026")).toBe("2026-03-05");
    expect(parseFechaFlexible("2026-10-15")).toBe("2026-10-15");
    expect(parseFechaFlexible("2026-10-15T10:30:00.000Z")).toBe("2026-10-15");
  });

  it("acepta números de serie de Excel (base 25569)", () => {
    expect(parseFechaFlexible(25569)).toBe("1970-01-01");
    expect(parseFechaFlexible(46310)).toBe("2026-10-15");
  });

  it("devuelve null para valores vacíos o inexistentes", () => {
    expect(parseFechaFlexible("")).toBeNull();
    expect(parseFechaFlexible(null)).toBeNull();
    expect(parseFechaFlexible("31/02/2026")).toBeNull();
    expect(parseFechaFlexible("no es fecha")).toBeNull();
  });
});

describe("limpieza de datos importados", () => {
  it("quita el .0 final y los caracteres no numéricos del teléfono", () => {
    expect(limpiarTelefono("600123456.0")).toBe("600123456");
    expect(limpiarTelefono("+34 600-123-456")).toBe("+34600123456");
  });

  it("descarta lo que sigue a un paréntesis en la matrícula", () => {
    expect(limpiarMatricula("1234ABC (baja)")).toBe("1234ABC");
    expect(limpiarMatricula(null)).toBe("");
  });
});
