import { describe, expect, it } from "vitest";
import { cotejarPagos, diaClave, distancia, filasPorDia, filasDelMes, filasSinMes, mesDeFila, mesesEsperados, resumenPorMes, sugerirMes, type CocheCotejo, type FilaCotejo, type PagoRejilla } from "./cotejo-pagos";

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
  it("una lectura parecida ofrece corregirla, y una lectura confirmada ya no se empareja con el coche", () => {
    const sinConfirmar = cotejarPagos([coche({ matricula: "9831NRB" })], [pago({ matricula: "9834NRB" })]);
    expect(sinConfirmar.filas[0].matriculaHoja).toBe("9834NRB");
    const confirmada = cotejarPagos([coche({ matricula: "9831NRB" })], [pago({ matricula: "9834NRB", confirmada: true })]);
    expect(confirmada.filas.find((f) => f.matricula === "9831NRB")?.estado).toBe("no_pagado");
    expect(confirmada.filas.find((f) => f.matricula === "9834NRB")?.motivo).toContain("lectura confirmada");
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

describe("ajustarLecturas", () => {
  it("cambia una lectura dudosa por la matrícula de un coche tuyo si es la única parecida", async () => {
    const { ajustarLecturas } = await import("./cotejo-pagos");
    const r = ajustarLecturas(
      [
        { matricula: "5913NDZ", confianza: 70 },
        { matricula: "5912NPZ", confianza: 95 },
        { matricula: "0882MTX", confianza: 55 },
      ],
      ["5913NPZ", "5912NPZ", "9882MTX", "1111AAA"],
    );
    expect(r[0]).toMatchObject({ matricula: "5913NPZ", corregidaDe: "5913NDZ" });
    expect(r[1]).toEqual({ matricula: "5912NPZ", confianza: 95 });
    expect(r[2].matricula).toBe("9882MTX");
  });
  it("no toca lecturas seguras ni inventa si hay dos candidatas", async () => {
    const { ajustarLecturas } = await import("./cotejo-pagos");
    expect(ajustarLecturas([{ matricula: "1234BCD", confianza: 95 }], ["1234BCE"])[0].matricula).toBe("1234BCD");
    expect(ajustarLecturas([{ matricula: "1234BCX", confianza: 55 }], ["1234BCD", "1234BCE"])[0].matricula).toBe("1234BCX");
  });
});

describe("cotejo por meses", () => {
  const cocheMes = (matricula: string, f_matriculacion: string | null, extra: Partial<CocheCotejo> = {}): CocheCotejo => ({ origen: "app", id_expediente: 1, cliente: "X", tipo_pago: "", marca: "Renault", modelo: "Clio", matricula, f_expediente: null, f_afectacion: null, f_matriculacion, f_entrega: null, estado: "", usado: false, ...extra });

  it("asigna cada coche al mes en que debía cobrarse y cuenta los estados por mes", () => {
    const r = cotejarPagos(
      [cocheMes("1111AAA", "2026-04-10"), cocheMes("2222BBB", "2026-04-20"), cocheMes("3333CCC", "2026-03-05"), cocheMes("4444DDD", null)],
      [{ mes: "2026-04", matricula: "1111AAA", importe: null }, { mes: "2026-03", matricula: "9999ZZZ", importe: null }, { mes: "2026-03", matricula: "3333CCC", importe: null }],
    );
    const abril = filasDelMes(r.filas, "2026-04");
    expect(abril.map((f) => [f.matricula, f.estado]).sort()).toEqual([["1111AAA", "pagado"], ["2222BBB", "no_pagado"]]);
    // La matrícula de la rejilla de marzo que no es de ningún coche cuenta en marzo
    expect(filasDelMes(r.filas, "2026-03").map((f) => f.matricula).sort()).toEqual(["3333CCC", "9999ZZZ"]);
    expect(filasSinMes(r.filas).map((f) => f.matricula)).toEqual(["4444DDD"]);
    expect(resumenPorMes(r.filas).get("2026-04")).toEqual({ total: 2, pagados: 1, dudosos: 0, noPagados: 1, sinRejilla: 0 });
  });

  it("un usado cobrado en uno de sus meses cuenta en ese mes; si falta, en el último que le correspondía", () => {
    const usado = cocheMes("5555EEE", null, { usado: true, f_afectacion: "2026-02-10", f_entrega: "2026-03-20" });
    const pagado = cotejarPagos([usado], [{ mes: "2026-02", matricula: "5555EEE", importe: null }]);
    expect(mesDeFila(pagado.filas[0])).toBe("2026-02");
    const falta = cotejarPagos([usado], [{ mes: "2026-02", matricula: "0000ZZZ", importe: null }, { mes: "2026-03", matricula: "0001ZZZ", importe: null }]);
    expect(mesDeFila(falta.filas.find((f) => f.matricula === "5555EEE")!)).toBe("2026-03");
  });
});

describe("calendario del cotejo", () => {
  const coche = (o: Partial<CocheCotejo>): CocheCotejo => ({ origen: "app", id_expediente: 1, cliente: "Ana", tipo_pago: "", marca: "", modelo: "", matricula: "1111ABC", f_expediente: null, f_afectacion: null, f_matriculacion: null, f_entrega: null, estado: "", usado: false, ...o });
  const fila = (c: CocheCotejo | null): FilaCotejo => ({ estado: "sin_rejilla", motivo: "", coche: c, matricula: c?.matricula ?? "9999ZZZ", mesRejilla: c ? null : "2026-04", importe: null });

  it("coloca cada coche en su día: matriculación en un nuevo, afectación en un usado", () => {
    expect(diaClave(coche({ f_matriculacion: "2026-04-14", f_entrega: "2026-04-20" }))).toBe("2026-04-14");
    expect(diaClave(coche({ usado: true, f_afectacion: "2026-04-03", f_matriculacion: "2015-01-01" }))).toBe("2026-04-03");
    expect(diaClave(coche({}))).toBeNull();
  });

  it("agrupa por día solo los coches de ese mes y deja aparte los que no tienen día", () => {
    const filas = [fila(coche({ f_matriculacion: "2026-04-14" })), fila(coche({ matricula: "2222BCD", f_matriculacion: "2026-04-14" })), fila(coche({ matricula: "3333CDF", f_matriculacion: "2026-05-02" })), fila(null)];
    const { dias, sinDia } = filasPorDia(filas, "2026-04");
    expect([...dias.keys()]).toEqual(["2026-04-14"]);
    expect(dias.get("2026-04-14")).toHaveLength(2);
    expect(sinDia).toHaveLength(1);
  });
});
