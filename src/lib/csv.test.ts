import { describe, expect, it } from "vitest";
import { construirCsvClientes, interpretarCsvClientes } from "./csv-clientes";
import { CABECERAS_CSV, construirCsv, interpretarCsvExpedientes, partirLinea } from "./csv-expedientes";
import type { ExpedienteDto } from "./dto";

function expediente(parcial: Partial<ExpedienteDto> = {}): ExpedienteDto {
  return {
    id_expediente: 7,
    id_usuario: 1,
    id_cliente: 1,
    id_modelo: 1,
    id_tienda: null,
    id_tipo_de_venta: 1,
    id_estado_vehiculo: 1,
    fecha_expediente: "2026-03-10",
    fecha_afectacion: null,
    fecha_matriculacion: "2026-03-20",
    fecha_entrega: null,
    fecha_rci: null,
    fecha_facturacion: null,
    matricula: "1234ABC",
    vin: "VF1XYZ",
    cobrado_otra_fecha: false,
    fecha_cobrado: null,
    comision_cobrada: false,
    comision_coche_cobrada: false,
    comision_usado_cobrada: false,
    comision_financiacion_cobrada: false,
    comision_preference_cobrada: false,
    comision_bonus_cobrada: false,
    puntos: null,
    id_promocion: null,
    comision_coche_manual: null,
    comision_financiacion_manual: null,
    conceptos_especiales: [],
    cliente: {
      id: 1,
      cliente_id: "c1",
      dni: "1A",
      nombre: 'Ana "la Rápida" Ruiz',
      fecha_de_nacimiento: null,
      tienda_id: null,
      emails: [{ email: "ana@e.com", tipo_email: "Trabajo" }],
      telefonos: [{ telefono: "600", tipo_telefono: null }],
    },
    modelo: { id_modelo: 1, marca_id: 1, nombre_modelo: "Clio", acceso_rapido: true, orden_acceso_rapido: 2, marca: { id_marca: 1, nombre: "Renault", activo: true, acceso_rapido: true, sistema_comisiones: true } },
    tipoDeVenta: { id_tipo_de_venta: 1, nombre_tipo_venta: "Contado", color: "#3b82f6", orden: 0, categoria: "CONTADO" },
    estadoVehiculo: { id_estado_vehiculo: 1, nombre_estado_vehiculo: "Nuevo", predeterminado: true, clase: "VN", subtipo_vo: null },
    usuario: { id_usuario: 1, nombre: "Vendedor Uno" },
    ...parcial,
  };
}

describe("CSV de expedientes", () => {
  it("empieza con BOM y sep=;, usa las cabeceras del original y entrecomilla las celdas", () => {
    const csv = construirCsv([expediente()]);
    const lineas = csv.split("\n");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lineas[0].replace("﻿", "")).toBe("sep=;");
    expect(lineas[1]).toBe(CABECERAS_CSV.join(";"));
    expect(lineas[2]).toContain('"Ana ""la Rápida"" Ruiz"');
    expect(lineas[2]).toContain('"ana@e.com:Trabajo"');
    expect(lineas[2]).toContain('"600:Principal"');
  });

  it("lo exportado se puede volver a importar", () => {
    const filas = interpretarCsvExpedientes(construirCsv([expediente()]));
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ cliente_nombre: 'Ana "la Rápida" Ruiz', cliente_dni: "1A", marca_nombre: "Renault", modelo_nombre: "Clio", tipo_venta_nombre: "Contado", estado_vehiculo_nombre: "Nuevo", matricula: "1234ABC", vin: "VF1XYZ" });
    expect(filas[0].fecha_expediente).toBe("2026-03-10");
  });

  it("acepta coma como separador y rechaza archivos vacíos o sin datos", () => {
    const filas = interpretarCsvExpedientes("cliente,matricula,vin\nLuis,1111AAA,V9");
    expect(filas[0]).toMatchObject({ cliente_nombre: "Luis", matricula: "1111AAA", vin: "V9" });
    expect(() => interpretarCsvExpedientes("")).toThrow("Archivo vacío");
    expect(() => interpretarCsvExpedientes("solo,cabecera")).toThrow();
  });

  it("partirLinea respeta separadores entre comillas", () => {
    expect(partirLinea('"a;b";c;"d ""e"""', ";")).toEqual(["a;b", "c", 'd "e"']);
  });
});

describe("CSV de clientes", () => {
  it("exporta e importa con los mismos datos", () => {
    const csv = construirCsvClientes([
      { id: 1, nombre: "Pepe", dni: "9Z", fecha_de_nacimiento: "1990-01-02", tiendaNombre: "Centro", emails: [{ email: "p@e.com", tipo_email: null }], telefonos: [{ telefono: "611", tipo_telefono: "Móvil" }], numExpedientes: 3 },
    ]);
    const [c] = interpretarCsvClientes(csv);
    expect(c).toMatchObject({ nombre: "Pepe", dni: "9Z", fecha_de_nacimiento: "1990-01-02", tienda_nombre: "Centro", emails: "p@e.com:Principal", telefonos: "611:Móvil" });
  });

  it("ignora filas sin nombre y avisa si no queda ninguna", () => {
    expect(() => interpretarCsvClientes("nombre;dni\n;1")).toThrow("No se encontraron registros válidos en el CSV.");
  });
});
