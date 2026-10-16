import { describe, expect, it } from "vitest";
import type { ExpedienteDto } from "@/lib/dto";
import { firmaExpedientes } from "./ComisionesYCartera";

const exp = (o: Partial<ExpedienteDto> = {}): ExpedienteDto =>
  ({ id_expediente: 1, id_usuario: 1, id_modelo: 1, id_tipo_de_venta: 1, id_estado_vehiculo: 1, fecha_expediente: "2026-09-03", fecha_afectacion: null, fecha_matriculacion: null, fecha_facturacion: null, fecha_rci: null, fecha_cobrado: null, cobrado_otra_fecha: false, puntos: null, id_promocion: null, comision_coche_manual: null, comision_financiacion_manual: null, conceptos_especiales: [], ...o }) as ExpedienteDto;

describe("firmaExpedientes", () => {
  it("cambia al poner una fecha de matriculación o de afectación (la comisión se recalcula)", () => {
    const antes = firmaExpedientes([exp()]);
    expect(firmaExpedientes([exp({ fecha_matriculacion: "2026-10-05" })])).not.toBe(antes);
    expect(firmaExpedientes([exp({ fecha_afectacion: "2026-09-20" })])).not.toBe(antes);
  });
  it("es estable si no cambia nada relevante", () => {
    expect(firmaExpedientes([exp()])).toBe(firmaExpedientes([exp()]));
  });
});
