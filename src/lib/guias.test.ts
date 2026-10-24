import { describe, expect, it } from "vitest";
import { GUIAS } from "./guias";

// Una guía por cada entrada del menú lateral y por cada pestaña que lleva «i»: si se añade una, hay que escribir su guía
const PESTANAS = [
  ...["usuarios", "incidencias", "marcas", "modelos", "tiendas", "pagos", "estados", "expedientes", "dashboard", "bbdd", "temas"].map((c) => `config.${c}`),
  ...["analisis", "datos", "copias", "sistema", "rendimiento", "registro", "peligro"].map((c) => `config.bbdd.${c}`),
  "herramientas.papelera",
  ...["lista", "modos", "foto"].map((c) => `config.expedientes.${c}`),
  ...["oscuros", "claros", "originales"].map((c) => `config.temas.${c}`),
  ...["dashboard", "expedientes", "clientes", "herramientas", "configuracion", "comisiones", "cotejo", "informes", "log-importacion", "laboratorio"].map((c) => `menu.${c}`),
  ...["resumen", "objetivo", "modelos", "usados", "reglas", "bonus", "penalizaciones", "liquidacion", "notas"].map((c) => `plan.${c}`),
];

describe("guías de las pestañas", () => {
  it.each(PESTANAS)("%s tiene su guía completa", (clave) => {
    const g = GUIAS[clave];
    expect(g, `falta la guía ${clave}`).toBeDefined();
    expect(g.titulo.trim()).not.toBe("");
    expect(g.queEs.trim().length).toBeGreaterThan(20);
    expect(g.pasos.length).toBeGreaterThan(0);
    g.pasos.forEach((p) => expect(p.trim()).not.toBe(""));
  });
});
