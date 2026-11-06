import { describe, expect, it } from "vitest";
import {
  limpiarMatricula,
  limpiarTelefono,
  parseFechaFlexible,
  parseHoraFlexible,
} from "./fechas-import";

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

describe("parseHoraFlexible", () => {
  it("saca la hora de un número de serie de Excel, de un Date y de un texto; sin hora (o medianoche) es null", () => {
    expect(parseHoraFlexible(46332.4375)).toBe("10:30");
    expect(parseHoraFlexible(46332)).toBeNull();
    expect(parseHoraFlexible(new Date(Date.UTC(2026, 10, 5, 9, 5)))).toBe(
      "09:05",
    );
    expect(parseHoraFlexible("05/11/2026 10:30")).toBe("10:30");
    expect(parseHoraFlexible("2026-11-05T16:45:00")).toBe("16:45");
    expect(parseHoraFlexible("05/11/2026 4:15 pm")).toBe("16:15");
    expect(parseHoraFlexible("05/11/2026")).toBeNull();
    expect(parseHoraFlexible("05/11/2026 00:00")).toBeNull();
    expect(parseHoraFlexible("")).toBeNull();
  });
});
