import { describe, expect, it } from "vitest";
import { ajustarFechasDelPlan, contarFechasInternas, sumarMesesIso, trasladarFecha } from "./ajustar-fechas";

const septiembre = { inicio: "2026-09-01", fin: "2026-09-30" };
const octubre = { inicio: "2026-10-01", fin: "2026-10-31" };

describe("ajustar las fechas internas de un plan al duplicarlo", () => {
  it("las fechas del inicio y del fin del plan pasan a las del nuevo plan", () => {
    expect(trasladarFecha("2026-09-01", septiembre, octubre)).toBe("2026-10-01");
    expect(trasladarFecha("2026-09-30", septiembre, octubre)).toBe("2026-10-31");
  });

  it("las demás fechas se mueven los meses de diferencia conservando el día", () => {
    expect(trasladarFecha("2026-09-05", septiembre, octubre)).toBe("2026-10-05");
    expect(trasladarFecha("2026-09-20", septiembre, { inicio: "2026-11-01", fin: "2026-11-30" })).toBe("2026-11-20");
    // Pasando de un año a otro y a un mes más corto
    expect(trasladarFecha("2026-12-31", { inicio: "2026-12-01", fin: "2026-12-30" }, { inicio: "2027-02-01", fin: "2027-02-28" })).toBe("2027-02-28");
    expect(sumarMesesIso("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("si los planes no empiezan el día 1, se mueven los mismos días que haya entre los dos inicios", () => {
    expect(trasladarFecha("2026-09-20", { inicio: "2026-09-15", fin: "2026-10-14" }, { inicio: "2026-10-15", fin: "2026-11-14" })).toBe("2026-10-20");
  });

  it("traslada la validez de reglas y bonus y cuenta lo que ha cambiado; lo vacío se queda vacío", () => {
    const plan = {
      fechaInicio: "2026-09-01",
      fechaFin: "2026-09-30",
      reglas: [{ fechaInicio: null, fechaFin: null }],
      bonus: [
        { fechaInicio: "2026-09-05", fechaFin: "2026-09-30" },
        { fechaInicio: "2026-09-10", fechaFin: null },
      ],
    };
    expect(contarFechasInternas(plan)).toBe(3);
    const r = ajustarFechasDelPlan(plan, octubre);
    expect(r.plan.fechaInicio).toBe("2026-10-01");
    expect(r.plan.fechaFin).toBe("2026-10-31");
    expect(r.plan.reglas).toEqual([{ fechaInicio: null, fechaFin: null }]);
    expect(r.plan.bonus).toEqual([
      { fechaInicio: "2026-10-05", fechaFin: "2026-10-31" },
      { fechaInicio: "2026-10-10", fechaFin: null },
    ]);
    expect(r.cambiadas).toBe(3);
  });
});
