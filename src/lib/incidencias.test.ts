import { describe, expect, it } from "vitest";
import { claveDeFallo, informeDe, limpiarSensible, prepararEvento } from "./incidencias";

describe("incidencias: utilidades", () => {
  it("quita correos, documentos, números largos y claves de lo que se guarda", () => {
    const t = limpiarSensible("Falla con ana.perez@correo.es y DNI 12345678Z, tel 600 123 456, Bearer abcdefghijklmnop12345 password=secreto123 clave deadbeefdeadbeefdeadbeefdeadbeef");
    expect(t).not.toMatch(/ana\.perez|12345678Z|600 123 456|abcdefghijklmnop|secreto123|deadbeef/);
    expect(t).toContain("<correo>");
    expect(t).toContain("<documento>");
    expect(t).toContain("password=<oculto>");
  });

  it("junta como el mismo fallo los que solo cambian en números e identificadores", () => {
    const a = claveDeFallo("servidor", "No se encontró el expediente 123 en 45 ms", "GET /api/expedientes/123?x=1");
    const b = claveDeFallo("servidor", "No se encontró el expediente 9876 en 2 ms", "GET /api/expedientes/9876");
    expect(a).toBe(b);
    expect(claveDeFallo("servidor", "Otro mensaje", "GET /api/expedientes/1")).not.toBe(a);
    expect(claveDeFallo("navegador", "No se encontró el expediente 1", "GET /api/expedientes/1")).not.toBe(claveDeFallo("servidor", "No se encontró el expediente 1", "GET /api/expedientes/1"));
  });

  it("prepara el evento: nivel por defecto, título limpio y recortado", () => {
    const p = prepararEvento({ origen: "navegador", titulo: `  Falló   para ana@x.es ${"x".repeat(500)}`, detalle: "traza" });
    expect(p.nivel).toBe("error");
    expect(p.titulo.length).toBeLessThan(330);
    expect(p.titulo).toContain("<correo>");
    expect(p.titulo).not.toMatch(/\s{2}/);
  });

  it("el informe lleva qué pasó, dónde, cuántas veces y los pasos previos", () => {
    const md = informeDe([{ id: 7, origen: "navegador", nivel: "error", titulo: "x is not a function", detalle: "at a (b.js:1)", ruta: "/dashboard/clientes", contexto: { navegador: "Safari", pasos: ["Entra en /dashboard/clientes", "Pulsa «Guardar»"] }, veces: 3, primeraVez: "2026-10-21T08:00:00Z", ultimaVez: "2026-10-21T09:00:00Z", estado: "nueva", nota: null, version: "1.9.0" }]);
    expect(md).toContain("#7");
    expect(md).toContain("x is not a function");
    expect(md).toContain("/dashboard/clientes");
    expect(md).toContain("Veces: 3");
    expect(md).toContain("Pulsa «Guardar»");
    expect(md).toContain("navegador: Safari");
  });
});
