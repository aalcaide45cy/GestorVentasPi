import { describe, expect, it } from "vitest";
import { nombreSospechoso } from "./documentos";

describe("nombre de cliente cortado o mal leído (para volver a leer con otro motor)", () => {
  it("da por buenos los nombres completos, con partículas", () => {
    expect(nombreSospechoso("Maria Montserrat Ibañez Risco")).toBe(false);
    expect(nombreSospechoso("Jose Francisco Gomez Garcia")).toBe(false);
    expect(nombreSospechoso("Maria De La Soledad Delgado Martin")).toBe(false);
    expect(nombreSospechoso("Ana Pérez")).toBe(false);
  });

  it("sospecha de nombres cortados, de una palabra, con trozos sueltos, cifras o símbolos", () => {
    expect(nombreSospechoso(null)).toBe(true);
    expect(nombreSospechoso("")).toBe(true);
    expect(nombreSospechoso("Maria")).toBe(true);
    expect(nombreSospechoso("Maria Montserrat Ib")).toBe(true); // apellido cortado
    expect(nombreSospechoso("Jose F Gomez")).toBe(true);
    expect(nombreSospechoso("Jose Franc1sco Gomez")).toBe(true);
    expect(nombreSospechoso("Maria Montserrat Ibañez -")).toBe(true);
    expect(nombreSospechoso("De La")).toBe(true);
  });
});
