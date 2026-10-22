import { describe, expect, it } from "vitest";
import { contrastarRejillas, type CocheContraste, type RejillaContraste } from "./contraste-rejillas";

const coche = (id: number, matricula: string, o: Partial<CocheContraste> = {}): CocheContraste => ({
  origen: "app",
  id_expediente: id,
  cliente: `Cliente ${id}`,
  tipo_pago: "Crédito",
  marca: "Dacia",
  modelo: "Sandero",
  matricula,
  f_expediente: null,
  f_afectacion: null,
  f_matriculacion: "2026-04-10",
  f_entrega: null,
  estado: "Nuevo",
  usado: false,
  idUsuario: 1,
  vendedor: "Alfonso",
  ...o,
});
const fila = (matricula: string, o: Partial<RejillaContraste["filas"][number]> = {}) => ({ matricula, importe: null, cliente: null, concepto: null, confirmada: false, ...o });
const rejilla = (id: number, mes: string, matriculas: string[], o: Partial<RejillaContraste> = {}): RejillaContraste => ({ id, mes, idUsuario: 1, vendedor: "Alfonso", nombreArchivo: null, filas: matriculas.map((m) => fila(m)), ...o });

describe("contraste de rejillas", () => {
  it("pone cada matrícula de la rejilla junto a su expediente y agrupa por rejilla (la más reciente primero)", () => {
    const r = contrastarRejillas(
      [rejilla(1, "2026-04", ["1234-BCD", "5678 FGH"]), rejilla(2, "2026-05", ["9999ZZZ"])],
      [coche(1, "1234BCD"), coche(2, "5678FGH"), coche(3, "9999ZZZ", { f_matriculacion: "2026-05-02" })],
    );
    expect(r.filas.map((f) => [f.mes, f.matricula, f.expediente?.idExpediente, f.estado])).toEqual([
      ["2026-05", "9999ZZZ", 3, "coincide"],
      ["2026-04", "1234BCD", 1, "coincide"],
      ["2026-04", "5678FGH", 2, "coincide"],
    ]);
    expect(r.filas.filter((f) => f.primeraDelGrupo).map((f) => f.mes)).toEqual(["2026-05", "2026-04"]);
    expect(r.resumen).toMatchObject({ rejillas: 2, matriculas: 3, coinciden: 3, sinPagar: 0 });
  });

  it("avisa de las matrículas repetidas en dos rejillas (y dentro de la misma hoja)", () => {
    const r = contrastarRejillas(
      [rejilla(1, "2026-04", ["1234BCD"]), rejilla(2, "2026-05", ["1234BCD", "1111AAA", "1111AAA"])],
      [coche(1, "1234BCD"), coche(2, "1111AAA", { f_matriculacion: "2026-05-01" })],
    );
    const mayo = r.filas.filter((f) => f.mes === "2026-05");
    expect(mayo).toHaveLength(2); // la repetida dentro de la hoja sale en una sola línea
    const a = r.filas.find((f) => f.mes === "2026-04")!;
    expect(a.repetidaEn).toEqual([{ idRejilla: 2, mes: "2026-05", vendedor: "Alfonso", mismaRejilla: false }]);
    expect(mayo.find((f) => f.matricula === "1111AAA")!.repetidaEn).toEqual([{ idRejilla: 2, mes: "2026-05", vendedor: "Alfonso", mismaRejilla: true }]);
    expect(r.resumen.repetidas).toBe(3);
  });

  it("distingue lo pagado en otro mes, lo que no tiene expediente (con sugerencia) y lo de otro vendedor", () => {
    const r = contrastarRejillas(
      [rejilla(1, "2026-06", ["1234BCD", "7777XXX", "5678FGH"]), rejilla(2, "2026-06", ["4321ABC"], { idUsuario: 2, vendedor: "Ana" })],
      [coche(1, "1234BCD"), coche(2, "5678FGH", { f_matriculacion: "2026-06-03" }), coche(3, "7777XXY", { f_matriculacion: "2026-06-05" }), coche(4, "4321ABC")],
    );
    const por = (m: string) => r.filas.find((f) => f.matricula === m)!;
    expect(por("1234BCD").estado).toBe("otro_mes");
    expect(por("1234BCD").motivo).toContain("le correspondía");
    expect(por("5678FGH").estado).toBe("coincide");
    expect(por("7777XXX")).toMatchObject({ estado: "sin_expediente", sugerida: "7777XXY" });
    expect(por("4321ABC")).toMatchObject({ estado: "otro_vendedor" });
  });

  it("lista los expedientes que no están en ninguna rejilla, separando los que no figuran de los que aún no tienen rejilla", () => {
    const r = contrastarRejillas(
      [rejilla(1, "2026-04", ["1234BCD"])],
      [
        coche(1, "1234BCD"),
        coche(2, "2222CCC", { f_matriculacion: "2026-04-20" }), // le tocaba abril y hay rejilla de abril: no figura
        coche(3, "3333DDD", { f_matriculacion: "2026-07-01" }), // julio: aún no hay rejilla
        coche(4, "4444EEE", { f_matriculacion: null }), // sin fecha
        coche(5, ""), // sin matrícula
      ],
    );
    expect(r.sinMatricula).toBe(1);
    expect(r.sinPagar.map((s) => [s.expediente.idExpediente, s.estado])).toEqual([
      [2, "no_pagado"],
      [4, "sin_fecha"],
      [3, "sin_rejilla"],
    ]);
    expect(r.resumen).toMatchObject({ sinPagar: 1, sinRejilla: 2 });
  });

  it("un expediente sin pagar con una matrícula parecida en una rejilla lo dice", () => {
    const r = contrastarRejillas([rejilla(1, "2026-04", ["1234BCO"])], [coche(1, "1234BCD")]);
    expect(r.filas[0]).toMatchObject({ estado: "sin_expediente" });
    // La matrícula de la rejilla no tiene expediente y el expediente no figura: cada lado sugiere al otro
    expect(r.filas[0].sugerida).toBe("1234BCD");
    expect(r.sinPagar[0].parecidaEn).toEqual({ matricula: "1234BCO", mes: "2026-04" });
  });

  it("los expedientes anulados en la intranet no son ventas: no salen como sin pagar y los que se pagan en una rejilla se marcan aparte", () => {
    const r = contrastarRejillas(
      [rejilla(1, "2026-04", ["1234BCD", "5555FGH"])],
      [
        coche(1, "1234BCD", { estado: "Anulado" }), // anulado y pagado en la rejilla
        coche(2, "5555FGH"),
        coche(3, "3333DDD", { f_matriculacion: "2026-04-20", estado: "Anulado" }), // anulado y sin pagar: no se debe
        coche(4, "4444EEE", { f_matriculacion: "2026-04-21" }), // sin pagar de verdad
      ],
    );
    expect(r.filas.find((f) => f.matricula === "1234BCD")).toMatchObject({ estado: "anulado", expediente: { anulado: true } });
    expect(r.filas.find((f) => f.matricula === "5555FGH")?.estado).toBe("coincide");
    expect(r.sinPagar.map((s) => [s.expediente.idExpediente, s.expediente.anulado])).toEqual([
      [3, true],
      [4, false],
    ]);
    expect(r.resumen).toMatchObject({ anulados: 2, sinPagar: 1, coinciden: 1 });
  });

  it("si hay un expediente anulado y otro vivo con la misma matrícula, la rejilla se contrasta con el vivo", () => {
    const r = contrastarRejillas([rejilla(1, "2026-04", ["1234BCD"])], [coche(1, "1234BCD", { estado: "Anulado" }), coche(2, "1234BCD")]);
    expect(r.filas[0]).toMatchObject({ estado: "coincide", expediente: { idExpediente: 2 }, expedientesExtra: 1 });
  });
});
