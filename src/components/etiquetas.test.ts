import { describe, expect, it } from "vitest";
import { columnasVehiculo } from "./etiquetas";

describe("columnas estándar de vehículo", () => {
  const datos = (f: { clase: string; marca: string; modelo: string; estado: string; pago: string }) => ({ clase: f.clase, marca: f.marca, modelo: f.modelo, estado: f.estado, tipoPago: f.pago });
  const fila = { clase: "VN", marca: "Dacia", modelo: "Sandero", estado: "Nuevo", pago: "Crédito" };

  it("siempre las mismas columnas, con los mismos nombres y claves, en cualquier tabla", () => {
    const c = columnasVehiculo(datos);
    expect(c.map((x) => [x.clave, x.etiqueta])).toEqual([
      ["clase", "VN / VO"],
      ["marca", "Marca"],
      ["modelo", "Modelo"],
      ["marcaModelo", "Marca y modelo"],
      ["estado", "Estado"],
      ["tipoPago", "Tipo de pago"],
    ]);
    // «Marca y modelo» empieza oculta porque ya están Marca y Modelo por separado
    expect(c.find((x) => x.clave === "marcaModelo")?.oculta).toBe(true);
    expect(c.find((x) => x.clave === "marca")?.oculta).toBeUndefined();
  });

  it("ordena y busca por el dato, no por la etiqueta dibujada", () => {
    const c = Object.fromEntries(columnasVehiculo(datos).map((x) => [x.clave, x]));
    expect(c.clase.valor(fila)).toBe("VN");
    expect(c.estado.valor(fila)).toBe("Nuevo");
    expect(c.marcaModelo.valor(fila)).toBe("Dacia Sandero");
    expect(c.tipoPago.valor(fila)).toBe("Crédito");
  });

  it("se pueden quitar columnas y, sin marca ni modelo sueltos, «Marca y modelo» se ve", () => {
    const sin = columnasVehiculo(datos, { sin: ["estado", "tipoPago"] });
    expect(sin.map((x) => x.clave)).toEqual(["clase", "marca", "modelo", "marcaModelo"]);
    const junto = columnasVehiculo<{ v: string }>((f) => ({ marcaModelo: f.v }), { sin: ["clase", "marca", "modelo", "estado", "tipoPago"] });
    expect(junto).toHaveLength(1);
    expect(junto[0].oculta).toBeUndefined();
    expect(junto[0].valor({ v: "Renault Clio" })).toBe("Renault Clio");
  });
});
