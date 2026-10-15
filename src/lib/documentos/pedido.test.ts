import { describe, expect, it } from "vitest";
import { parsearPedido } from "./pedido";

const catalogo = {
  modelos: [
    { id: 1, nombre: "Clio", marca: "Renault" },
    { id: 2, nombre: "Captur", marca: "Renault" },
    { id: 3, nombre: "Sandero", marca: "Dacia" },
  ],
  tiposVenta: [
    { id: 10, nombre: "Contado", categoria: "CONTADO" },
    { id: 11, nombre: "Crédito", categoria: "CREDITO" },
    { id: 12, nombre: "Renting", categoria: "RENTING" },
  ],
};

describe("lectura de pedidos", () => {
  it("extrae bastidor, matrícula, DNI, cliente, fechas, modelo y forma de pago", () => {
    const texto = [
      "RENAULT RETAIL GROUP - PEDIDO DE VEHÍCULO",
      "Fecha de pedido: 05/09/2026",
      "Cliente: JUAN PEREZ GARCIA",
      "NIF: 12345678Z",
      "Vehículo: Renault Captur Techno",
      "Bastidor VF1RJA00123456789",
      "Matrícula 1234 BCD",
      "Forma de pago: Financiación RCI",
      "Fecha de entrega prevista: 30/09/2026",
    ].join("\n");
    const d = parsearPedido(texto, catalogo);
    expect(d).toMatchObject({
      vin: "VF1RJA00123456789",
      matricula: "1234BCD",
      dni: "12345678Z",
      cliente: "JUAN PEREZ GARCIA",
      fechaExpediente: "2026-09-05",
      fechaEntrega: "2026-09-30",
      idModelo: 2,
      idTipoDeVenta: 11,
    });
  });

  it("corrige O/I/Q del bastidor y avisa cuando no hay nada útil", () => {
    expect(parsearPedido("VIN VF1RJAOO123456789", catalogo).vin).toBe("VF1RJA0012345678".concat("9"));
    const vacio = parsearPedido("hola mundo", catalogo);
    expect(vacio.vin).toBeNull();
    expect(vacio.avisos.join(" ")).toContain("ningún dato útil");
  });

  it("detecta renting y contado", () => {
    expect(parsearPedido("Operación de renting a 48 meses", catalogo).idTipoDeVenta).toBe(12);
    expect(parsearPedido("Pago al contado", catalogo).idTipoDeVenta).toBe(10);
  });
});
