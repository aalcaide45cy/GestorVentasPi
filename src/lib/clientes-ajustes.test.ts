import { describe, expect, it } from "vitest";
import { clientesPorPantalla, columnasOcultasClientes, ordenClientes } from "./clientes-ajustes";

describe("ajustes de la lista de clientes", () => {
  it("el orden por defecto son los más recientes y un valor desconocido vuelve a él", () => {
    expect(ordenClientes(null)).toEqual({ campo: "id", asc: false });
    expect(ordenClientes("raro")).toEqual({ campo: "id", asc: false });
    expect(ordenClientes("nombre:asc")).toEqual({ campo: "nombre", asc: true });
    expect(ordenClientes("expedientes:desc")).toEqual({ campo: "expedientes", asc: false });
  });
  it("las columnas ocultas ignoran lo que no existe", () => {
    expect(columnasOcultasClientes(null)).toEqual([]);
    expect(columnasOcultasClientes("no json")).toEqual([]);
    expect(columnasOcultasClientes(JSON.stringify(["correos", "otra", "correos", "ventas"]))).toEqual(["correos", "ventas"]);
  });
  it("los clientes por pantalla solo admiten las opciones previstas (0 = todos)", () => {
    expect(clientesPorPantalla(null)).toBe(0);
    expect(clientesPorPantalla("50")).toBe(50);
    expect(clientesPorPantalla("51")).toBe(0);
    expect(clientesPorPantalla("x")).toBe(0);
  });
});
