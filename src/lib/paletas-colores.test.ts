import { describe, expect, it } from "vitest";
import { leerArchivoPaleta, normalizarPaleta, paraExportar, PALETA_POR_DEFECTO } from "./paletas-colores";

describe("paletas de colores", () => {
  it("la paleta por defecto es la de los botones de ahora", () => {
    expect(PALETA_POR_DEFECTO.tiposVenta).toEqual([
      { nombre: "Contado", color: "#ff0000" },
      { nombre: "Crédito", color: "#e69d00" },
      { nombre: "Preference", color: "#3b82f6" },
    ]);
  });

  it("lo exportado se vuelve a leer igual", () => {
    const datos = { tiposVenta: [{ nombre: "Contado", color: "#ff0000" }], marcas: [{ nombre: "Dacia", color: "#22c55e", punto: "●", puntoColor: "#facc15" }], estados: [{ nombre: "Nuevo", color: null, capsulaColor: "#112233", punto: null, puntoColor: null, prevalece: "estado" as const }] };
    const r = leerArchivoPaleta(JSON.stringify(paraExportar("Mi paleta", "para probar", datos)));
    expect(r).toMatchObject({ nombre: "Mi paleta", descripcion: "para probar", datos, avisos: [] });
  });

  it("tolera campos que sobran o faltan, colores mal escritos y versiones nuevas sin dar error", () => {
    const r = leerArchivoPaleta(JSON.stringify({ app: "GestorVentasPi", formato: "gv-paleta", version: 7, campoNuevo: true, datos: { tiposVenta: [{ nombre: "Contado", color: "#FF0000", otraCosa: 1 }, { color: "#00ff00" }, { nombre: "Crédito", color: "rojo" }], marcas: "no es una lista", temas: [] } }));
    expect(r.datos.tiposVenta).toEqual([{ nombre: "Contado", color: "#ff0000" }, { nombre: "Crédito", color: null }]);
    expect(r.datos.marcas).toEqual([]);
    expect(r.avisos.join(" ")).toContain("versión más nueva");
    expect(r.avisos.join(" ")).toContain("1 elemento");
  });

  it("acepta también solo los datos, sin envoltorio, y rechaza lo que no es una paleta", () => {
    expect(leerArchivoPaleta(JSON.stringify({ tiposVenta: [{ nombre: "Contado", color: "#ff0000" }] })).datos.tiposVenta).toHaveLength(1);
    expect(() => leerArchivoPaleta("esto no es json")).toThrow(/JSON/);
    expect(() => leerArchivoPaleta(JSON.stringify({ formato: "gv-seccion-1", datos: [] }))).toThrow(/otra sección/);
    expect(() => leerArchivoPaleta(JSON.stringify({ formato: "gv-paleta", datos: { tiposVenta: [] } }))).toThrow(/ningún color/);
    expect(normalizarPaleta(null)).toEqual({ datos: { tiposVenta: [], marcas: [], estados: [] }, descartados: 0 });
  });
});
