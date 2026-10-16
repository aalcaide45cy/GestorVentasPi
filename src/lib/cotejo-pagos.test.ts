import { describe, expect, it } from "vitest";
import { cotejarPagos, distancia, mesesEsperados, sugerirMes, type CocheCotejo, type PagoRejilla } from "./cotejo-pagos";

const coche = (o: Partial<CocheCotejo>): CocheCotejo => ({
  origen: "app", id_expediente: 1, cliente: "Ana Ruiz", tipo_pago: "Contado", marca: "Dacia", modelo: "Sandero", matricula: "1234BCD",
  f_expediente: "2026-03-02", f_afectacion: "2026-03-02", f_matriculacion: "2026-03-20", f_entrega: "2026-03-22", estado: "", usado: false, ...o,
});
const pago = (o: Partial<PagoRejilla>): PagoRejilla => ({ mes: "2026-03", matricula: "1234BCD", importe: null, ...o });
const estado = (r: ReturnType<typeof cotejarPagos>, m: string) => r.filas.find((f) => f.matricula === m)?.estado;

describe("cotejarPagos", () => {
  it("verde si la matrícula está en la rejilla de su mes, aunque se escriba distinto", () => {
    expect(estado(cotejarPagos([coche({ matricula: "1234 bcd" })], [pago({})]), "1234BCD")).toBe("pagado");
  });
  it("rojo si hay rejilla de su mes y no aparece", () => {
    const r = cotejarPagos([coche({}), coche({ id_expediente: 2, matricula: "9999XYZ" })], [pago({})]);
    expect(estado(r, "9999XYZ")).toBe("no_pagado");
    expect(r.resumen.noPagados).toBe(1);
  });
  it("gris si no se ha subido la rejilla de su mes", () => {
    const r = cotejarPagos([coche({ f_matriculacion: "2026-08-10", matricula: "7777KKK" })], [pago({})]);
    expect(estado(r, "7777KKK")).toBe("sin_rejilla");
  });
  it("amarillo si está pagado en un mes distinto del esperado", () => {
    const r = cotejarPagos([coche({})], [pago({ mes: "2026-05" })]);
    expect(estado(r, "1234BCD")).toBe("dudoso");
  });
  it("amarillo si la rejilla trae una matrícula casi igual", () => {
    const r = cotejarPagos([coche({ matricula: "9586NFJ" })], [pago({ matricula: "9S86NFJ" })]);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].estado).toBe("dudoso");
    expect(r.filas[0].motivo).toContain("9S86NFJ");
  });
  it("amarillo para lo que está en la rejilla y no es de ningún coche", () => {
    const r = cotejarPagos([], [pago({ matricula: "5555ZZZ" })]);
    expect(r.filas[0].estado).toBe("dudoso");
    expect(r.filas[0].coche).toBeNull();
  });
  it("los coches sin matrícula (anulados) se muestran aparte y no se descartan", () => {
    const r = cotejarPagos([coche({ matricula: "", origen: "listado", estado: "Anulado" })], []);
    expect(r.sinMatricula).toHaveLength(1);
    expect(r.filas).toHaveLength(0);
  });
  it("une el mismo coche de la app y del listado", () => {
    const r = cotejarPagos([coche({ marca: "" }), coche({ origen: "listado", id_expediente: null, marca: "RENAULT", estado: "Archivado" })], [pago({})]);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].coche?.origen).toBe("ambos");
    expect(r.filas[0].coche?.marca).toBe("RENAULT");
  });
  it("en un usado vale el mes de afectación o el de entrega", () => {
    const u = coche({ usado: true, f_afectacion: "2026-07-24", f_entrega: "2026-08-03", f_matriculacion: "2023-04-28" });
    expect(mesesEsperados(u)).toEqual(["2026-07", "2026-08"]);
    expect(estado(cotejarPagos([u], [pago({ mes: "2026-07" })]), "1234BCD")).toBe("pagado");
    expect(estado(cotejarPagos([u], [pago({ mes: "2026-07", matricula: "0000AAA" })]), "1234BCD")).toBe("sin_rejilla");
  });
  it("distancia entre matrículas", () => {
    expect(distancia("9586NFJ", "9S86NFJ")).toBe(1);
  });
  it("sugiere el mes más repetido entre los coches conocidos", () => {
    const cs = [coche({ matricula: "1111BBB" }), coche({ matricula: "2222CCC" }), coche({ matricula: "3333DDD", f_matriculacion: "2026-05-02" })];
    expect(sugerirMes(["1111 BBB", "2222CCC", "3333DDD", "9999ZZZ"], cs)).toBe("2026-03");
    expect(sugerirMes(["9999ZZZ"], cs)).toBeNull();
  });
  it("también empareja si el OCR añade un carácter de más", () => {
    const r = cotejarPagos([coche({ matricula: "5582NNS" })], [pago({ matricula: "S5582NNS" })]);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].estado).toBe("dudoso");
  });
});
