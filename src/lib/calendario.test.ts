import { describe, expect, it } from "vitest";
import { diasDeOcurrencia, esquemaEvento, momentoDe, ocurreEn, sumarDias } from "./calendario";

const ev = (fecha: string, repeticion: "ninguna" | "diaria" | "semanal" | "mensual" | "anual", repetir_hasta: string | null = null) => ({ fecha, repeticion, repetir_hasta });

describe("calendario: repeticiones", () => {
  it("una nota sin repetición solo cae en su día", () => {
    expect(diasDeOcurrencia(ev("2026-10-15", "ninguna"), "2026-10-01", "2026-10-31")).toEqual(["2026-10-15"]);
    expect(diasDeOcurrencia(ev("2026-10-15", "ninguna"), "2026-11-01", "2026-11-30")).toEqual([]);
  });
  it("diaria y semanal empiezan en su día y respetan «repetir hasta»", () => {
    expect(diasDeOcurrencia(ev("2026-10-28", "diaria", "2026-10-30"), "2026-10-01", "2026-11-05")).toEqual(["2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(diasDeOcurrencia(ev("2026-10-05", "semanal"), "2026-10-01", "2026-10-31")).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(ocurreEn(ev("2026-10-05", "semanal"), "2026-10-04")).toBe(false);
  });
  it("mensual y anual se ajustan al último día del mes si no llega", () => {
    expect(diasDeOcurrencia(ev("2026-01-31", "mensual"), "2026-02-01", "2026-04-30")).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(diasDeOcurrencia(ev("2024-02-29", "anual"), "2026-02-01", "2026-03-31")).toEqual(["2026-02-28"]);
    expect(diasDeOcurrencia(ev("2020-03-10", "anual"), "2026-01-01", "2026-12-31")).toEqual(["2026-03-10"]);
  });
  it("sumar días cruza meses y años", () => {
    expect(sumarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("un evento de todo el día cuenta a las 9:00", () => {
    const m = momentoDe("2026-10-30", null);
    expect([m.getHours(), m.getMinutes()]).toEqual([9, 0]);
    const h = momentoDe("2026-10-30", "17:45");
    expect([h.getHours(), h.getMinutes()]).toEqual([17, 45]);
  });
  it("valida los datos de una nota", () => {
    expect(esquemaEvento.safeParse({ titulo: "Llamar", fecha: "2026-10-30" }).success).toBe(true);
    expect(esquemaEvento.safeParse({ titulo: "", fecha: "2026-10-30" }).success).toBe(false);
    expect(esquemaEvento.safeParse({ titulo: "x", fecha: "30/10/2026" }).success).toBe(false);
    expect(esquemaEvento.safeParse({ titulo: "x", fecha: "2026-10-30", hora: "25:00" }).success).toBe(false);
  });
});
