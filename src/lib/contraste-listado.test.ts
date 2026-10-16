import { describe, expect, it } from "vitest";
import { contrastarListado, type ExpedienteApp, type FilaListado } from "./contraste-listado";

const fila = (o: Partial<FilaListado>): FilaListado => ({
  fila: 2, numero: "1", cliente: "ANA RUIZ", nif: "11111111A", estado: "Archivado", usado: false, marca: "DACIA", modelo: "Sandero",
  bastidor: "VIN1", matricula: "1234ABC", f_creado: "2026-03-10", f_afect: null, f_mat: "2026-03-20", f_entrega: null, ...o,
});
const exp = (o: Partial<ExpedienteApp>): ExpedienteApp => ({
  id_expediente: 1, cliente: "Ana Ruiz", nif: "11111111A", marca: "Dacia", modelo: "Sandero", bastidor: "vin1", matricula: "1234 ABC",
  f_expediente: "2026-03-10", f_afectacion: null, f_matriculacion: "2026-03-20", f_entrega: null, ...o,
});

describe("contrastarListado", () => {
  it("empareja por bastidor ignorando mayúsculas y espacios", () => {
    const r = contrastarListado([fila({})], [exp({})]);
    expect(r.coinciden).toHaveLength(1);
    expect(r.difieren).toHaveLength(0);
  });
  it("señala las diferencias de fecha y matrícula", () => {
    const r = contrastarListado([fila({ f_mat: "2026-03-21", matricula: "9999ZZZ" })], [exp({})]);
    expect(r.difieren[0].diferencias.map((d) => d.campo)).toEqual(["Matrícula", "Fecha matriculación"]);
  });
  it("separa lo que solo está en el Excel y lo que solo está en la app", () => {
    const r = contrastarListado([fila({ bastidor: "VIN2" })], [exp({ id_expediente: 7 })]);
    expect(r.soloExcel).toHaveLength(1);
    expect(r.soloApp.map((e) => e.id_expediente)).toEqual([7]);
  });
  it("no cuenta las anuladas y las deja solo en el total", () => {
    const r = contrastarListado([fila({ estado: "Anulado", bastidor: "" })], []);
    expect(r.totales.anuladas).toBe(1);
    expect(r.soloExcel).toHaveLength(0);
  });
  it("detecta bastidores duplicados en la app", () => {
    const r = contrastarListado([fila({})], [exp({ id_expediente: 1 }), exp({ id_expediente: 2 })]);
    expect(r.duplicadosApp).toHaveLength(1);
    expect(r.soloApp.map((e) => e.id_expediente)).toEqual([2]);
  });
  it("casa por NIF una venta sin bastidor si solo hay un candidato", () => {
    const r = contrastarListado([fila({ bastidor: "", matricula: "", f_mat: null })], [exp({ bastidor: "", matricula: "", f_matriculacion: null })]);
    expect(r.coinciden).toHaveLength(1);
  });
  it("no considera «faltantes» los expedientes de la app anteriores al listado", () => {
    const r = contrastarListado([fila({})], [exp({}), exp({ id_expediente: 9, bastidor: "OLD", f_expediente: "2020-01-01" })]);
    expect(r.soloApp).toHaveLength(0);
  });
  it("tolera nombres de modelo del fabricante distintos al catálogo", () => {
    const r = contrastarListado([fila({ modelo: "CLIO (CL6)" })], [exp({ modelo: "Clio" })]);
    expect(r.difieren).toHaveLength(0);
  });
  it("en usados no compara la fecha de matriculación (es la primera del coche)", () => {
    const r = contrastarListado([fila({ usado: true, f_mat: "2017-11-28" })], [exp({})]);
    expect(r.difieren).toHaveLength(0);
  });
});
