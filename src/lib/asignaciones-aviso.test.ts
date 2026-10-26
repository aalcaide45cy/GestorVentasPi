import { describe, expect, it } from "vitest";
import { textoAsignaciones } from "./asignaciones-aviso";
import { textoExpedientePago } from "./pagos-rci-cliente";

describe("a qué expediente va cada pedido o pago, en el aviso", () => {
  it("nombra las primeras y cuenta el resto", () => {
    expect(textoAsignaciones([])).toBe("");
    expect(textoAsignaciones(["Ana → expediente nuevo"])).toBe(" Asignación: Ana → expediente nuevo.");
    const seis = ["a", "b", "c", "d", "e", "f"].map((x) => `${x} → nuevo`);
    expect(textoAsignaciones(seis)).toBe(" Asignación: a → nuevo; b → nuevo; c → nuevo; d → nuevo; e → nuevo y 1 más.");
  });
  it("en los pagos se dice «Asignado» o «Asignados» según cuántos sean", () => {
    expect(textoAsignaciones(["x"], "Asignado")).toBe(" Asignado: x.");
    expect(textoAsignaciones(["x", "y"], "Asignado")).toBe(" Asignados: x; y.");
  });
  it("un pago se describe por su expediente, con cliente y matrícula si los hay", () => {
    expect(textoExpedientePago({ idExpediente: 12, clienteExpediente: "Ana Ruiz", matricula: "1234ABC" })).toBe("expediente nº 12 de Ana Ruiz (1234ABC)");
    expect(textoExpedientePago({ idExpediente: 12, clienteExpediente: null, matricula: null })).toBe("expediente nº 12");
    expect(textoExpedientePago({ idExpediente: null, clienteExpediente: null, matricula: null })).toBeNull();
  });
});
