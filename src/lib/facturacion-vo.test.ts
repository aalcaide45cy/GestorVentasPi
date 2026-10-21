import { describe, expect, it } from "vitest";
import { facturacionPorDefectoVo } from "./facturacion-vo";

describe("facturación por defecto de un VO", () => {
  it("usa la fecha RCI y, sin ella (contado), el último día del mes del pedido", () => {
    expect(facturacionPorDefectoVo("2026-05-12", "2026-04-03")).toBe("2026-05-12");
    expect(facturacionPorDefectoVo(null, "2026-04-03")).toBe("2026-04-30");
    expect(facturacionPorDefectoVo(null, "2026-02-10")).toBe("2026-02-28");
    expect(facturacionPorDefectoVo(null, "2028-02-10")).toBe("2028-02-29");
    expect(facturacionPorDefectoVo(null, "2026-12-31")).toBe("2026-12-31");
    expect(facturacionPorDefectoVo(null, null)).toBeNull();
  });
});
