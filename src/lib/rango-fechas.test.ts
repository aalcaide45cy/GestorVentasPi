import { describe, expect, it } from "vitest";
import { enRango, hayRango, normalizarRango, rangoDeAtajo, textoRango } from "./rango-fechas";

// Jueves 22 de octubre de 2026
const hoy = new Date(2026, 9, 22);

describe("rango de fechas del listado de expedientes", () => {
  it("calcula los atajos", () => {
    expect(rangoDeAtajo("hoy", hoy)).toEqual({ desde: "2026-10-22", hasta: "2026-10-22" });
    expect(rangoDeAtajo("semana", hoy)).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" });
    expect(rangoDeAtajo("mes", hoy)).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(rangoDeAtajo("mes_pasado", hoy)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(rangoDeAtajo("anio", hoy)).toEqual({ desde: "2026-01-01", hasta: "2026-12-31" });
  });
  it("la semana empieza en lunes también un domingo y cruzando de mes; el mes pasado cruza de año", () => {
    expect(rangoDeAtajo("semana", new Date(2026, 9, 25))).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" });
    expect(rangoDeAtajo("semana", new Date(2026, 10, 1))).toEqual({ desde: "2026-10-26", hasta: "2026-11-01" });
    expect(rangoDeAtajo("mes_pasado", new Date(2027, 0, 15))).toEqual({ desde: "2026-12-01", hasta: "2026-12-31" });
    expect(rangoDeAtajo("mes_pasado", new Date(2024, 2, 10))).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" });
  });
  it("compara las fechas de forma inclusiva y sin fecha no entra en un rango puesto", () => {
    const r = { desde: "2026-10-01", hasta: "2026-10-31" };
    expect(enRango("2026-10-01", r)).toBe(true);
    expect(enRango("2026-10-31", r)).toBe(true);
    expect(enRango("2026-09-30", r)).toBe(false);
    expect(enRango("2026-11-01", r)).toBe(false);
    expect(enRango(null, r)).toBe(false);
    expect(enRango(null, { desde: "", hasta: "" })).toBe(true);
    expect(enRango("2026-10-15", { desde: "2026-10-10", hasta: "" })).toBe(true);
    expect(enRango("2026-10-05", { desde: "2026-10-10", hasta: "" })).toBe(false);
    expect(enRango("2026-10-05", { desde: "", hasta: "2026-10-10" })).toBe(true);
  });
  it("si «desde» es posterior a «hasta» los cambia de sitio y descarta lo mal escrito", () => {
    expect(normalizarRango({ desde: "2026-10-20", hasta: "2026-10-10" })).toEqual({ desde: "2026-10-10", hasta: "2026-10-20" });
    expect(normalizarRango({ desde: "2026-1-2", hasta: "" })).toEqual({ desde: "", hasta: "" });
    expect(hayRango({ desde: "", hasta: "" })).toBe(false);
    expect(hayRango({ desde: "2026-10-10", hasta: "" })).toBe(true);
  });
  it("lo cuenta con palabras", () => {
    expect(textoRango({ desde: "2026-10-01", hasta: "2026-10-22" })).toBe("del 01/10/2026 al 22/10/2026");
    expect(textoRango({ desde: "2026-10-22", hasta: "2026-10-22" })).toBe("el 22/10/2026");
    expect(textoRango({ desde: "2026-10-01", hasta: "" })).toBe("desde el 01/10/2026");
    expect(textoRango({ desde: "", hasta: "2026-10-01" })).toBe("hasta el 01/10/2026");
  });
});
