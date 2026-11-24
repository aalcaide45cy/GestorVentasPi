import { describe, expect, it } from "vitest";
import { claveNif, limpiarNif, nifParecido, normalizarMatricula } from "./identificadores";

describe("documento del cliente", () => {
  it("limpia espacios, guiones y minúsculas", () => {
    expect(limpiarNif(" 02.111.122-k ")).toBe("02111122K");
  });
  it("compara sin ceros a la izquierda", () => {
    expect(claveNif("02111122K")).toBe(claveNif("2111122K"));
    expect(claveNif("00123456A")).toBe("123456A");
  });
  it("respeta la letra inicial de un NIE y de un CIF", () => {
    expect(claveNif("X0123456L")).toBe("X123456L");
    expect(claveNif("B-0123456")).toBe("B123456");
    expect(claveNif("X1234567L")).not.toBe(claveNif("Y1234567L"));
  });
  it("detecta un documento casi igual (un carácter distinto, de más o de menos)", () => {
    expect(nifParecido("36914792E", "36914792F")).toBe(true);
    expect(nifParecido("36914792E", "3694792E")).toBe(true);
    expect(nifParecido("36914792E", "36914792E")).toBe(false);
    expect(nifParecido("36914792E", "35814792E")).toBe(false);
  });
});

describe("matrícula", () => {
  it("quita la fecha entre paréntesis del listado", () => {
    expect(normalizarMatricula("2222CCC(28-11-2017)")).toBe("2222CCC");
  });
  it("quita una E inicial solo si lo que queda tiene formato 1234ABC", () => {
    expect(normalizarMatricula("E1234ABC")).toBe("1234ABC");
    expect(normalizarMatricula("e-1234 abc")).toBe("1234ABC");
    expect(normalizarMatricula("E123ABC")).toBe("E123ABC");
  });
  it("deja intacta una matrícula normal y tolera vacíos", () => {
    expect(normalizarMatricula("4129 MCM")).toBe("4129MCM");
    expect(normalizarMatricula(null)).toBe("");
  });
});
