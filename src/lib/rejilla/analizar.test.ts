import { describe, expect, it } from "vitest";
import { esMatricula, filasDeMatriz, filasDeTexto, importesEnTexto, matriculasEnTexto, matrizDeCsv, normalizarMatricula, parseImporte, proponerMapeo } from "./analizar";

describe("matrículas", () => {
  it("normaliza y reconoce formatos actual y antiguo", () => {
    expect(normalizarMatricula("1234-bcd")).toBe("1234BCD");
    expect(normalizarMatricula("M-1234-AB")).toBe("M1234AB");
    expect(esMatricula("1234 BCD")).toBe(true);
    expect(esMatricula("M-1234-AB")).toBe(true);
    expect(esMatricula("HOLA")).toBe(false);
  });

  it("corrige confusiones del OCR en los números", () => {
    expect(matriculasEnTexto("Cliente 1Z34 BCD total")).toEqual(["1234BCD"]);
    expect(matriculasEnTexto("O123-FGH")).toEqual(["0123FGH"]);
    expect(matriculasEnTexto("sin matricula 12345")).toEqual([]);
  });
});

describe("importes", () => {
  it("lee formato español, inglés, negativos y paréntesis", () => {
    expect(parseImporte("1.234,56 €")).toBe(123456);
    expect(parseImporte("1234,5")).toBe(123450);
    expect(parseImporte("1,234.56")).toBe(123456);
    expect(parseImporte("45.00")).toBe(4500);
    expect(parseImporte("1.500")).toBe(150000);
    expect(parseImporte("-45,00")).toBe(-4500);
    expect(parseImporte("(45,00)")).toBe(-4500);
    expect(parseImporte("abc")).toBeNull();
    expect(parseImporte("")).toBeNull();
  });

  it("encuentra importes en una línea sin confundirlos con la matrícula", () => {
    expect(importesEnTexto("1234 BCD Juan 120,00 € 1.050,50")).toEqual([12000, 105050]);
  });
});

describe("tabla", () => {
  const csv = "Rejilla agosto;;;\nMatrícula;Cliente;Financiación;Comisión coche;Comisión financiación\n1234 BCD;Juan Pérez;Crédito;450,00;120,00\n5678-FGH;Ana Ruiz;Contado;300,00;\n;;;;\n";
  it("propone el mapeo y extrae las filas, sumando columnas de importe", () => {
    const m = matrizDeCsv(csv);
    const mapeo = proponerMapeo(m);
    expect(mapeo).toMatchObject({ filaCabecera: 1, matricula: 0, cliente: 1, financiacion: 2, importes: [3, 4] });
    const filas = filasDeMatriz(m, mapeo);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ matricula: "1234 BCD", cliente: "Juan Pérez", financiacion: "Crédito", importe: 57000, concepto: "Comisión coche + Comisión financiación" });
    expect(filas[1].importe).toBe(30000);
  });

  it("si hay una columna Total usa solo esa", () => {
    const m = matrizDeCsv("Matricula,Comision,Total\n1234BCD,10,40\n");
    expect(proponerMapeo(m).importes).toEqual([2]);
  });
});

describe("texto OCR", () => {
  it("saca matrícula, cliente, financiación e importe de cada línea", () => {
    const texto = "REJILLA AGOSTO\n1234 BCD  JUAN PEREZ GARCIA  Crédito  450,00  120,00\nTotal 570,00\n5678-FGH Ana Ruiz Contado 300,00 €\n";
    const filas = filasDeTexto(texto);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ matricula: "1234BCD", cliente: "JUAN PEREZ GARCIA", financiacion: "Crédito", importe: 12000 });
    expect(filas[1]).toMatchObject({ matricula: "5678FGH", financiacion: "Contado", importe: 30000 });
  });
});
