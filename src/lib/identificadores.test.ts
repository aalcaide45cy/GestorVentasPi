import { describe, expect, it } from "vitest";
import { claveNif, limpiarNif, nifParecido, normalizarMatricula } from "./identificadores";

describe("documento del cliente", () => {
  it("limpia espacios, guiones y minúsculas", () => {
    expect(limpiarNif(" 03.217.951-k ")).toBe("03217951K");
  });
  it("compara sin ceros a la izquierda", () => {
    expect(claveNif("03217951K")).toBe(claveNif("3217951K"));
    expect(claveNif("00123456A")).toBe("123456A");
  });
  it("respeta la letra inicial de un NIE y de un CIF", () => {
    expect(claveNif("X0123456L")).toBe("X123456L");
    expect(claveNif("B-0123456")).toBe("B123456");
    expect(claveNif("X1234567L")).not.toBe(claveNif("Y1234567L"));
  });
  it("detecta un documento casi igual (un carácter distinto, de más o de menos)", () => {
    expect(nifParecido("51701814E", "51701814F")).toBe(true);
    expect(nifParecido("51701814E", "5170814E")).toBe(true);
    expect(nifParecido("51701814E", "51701814E")).toBe(false);
    expect(nifParecido("51701814E", "52801814E")).toBe(false);
  });
});

describe("matrícula", () => {
  it("quita la fecha entre paréntesis del listado", () => {
    expect(normalizarMatricula("9109KFP(28-11-2017)")).toBe("9109KFP");
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
