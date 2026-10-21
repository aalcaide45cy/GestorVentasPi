import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearColector, esRuidoDelNavegador, type EventoNavegador } from "./incidencias-cliente";

let enviados: EventoNavegador[][] = [];
let reloj = 1_000_000;

const nuevo = (extra: Partial<Parameters<typeof crearColector>[0]> = {}) =>
  crearColector({ enviar: (e) => enviados.push(e), contextoBase: () => ({ pantalla: "/dashboard/clientes" }), ahora: () => reloj, esperaMs: 1000, ...extra });

beforeEach(() => {
  vi.useFakeTimers();
  enviados = [];
  reloj = 1_000_000;
});
afterEach(() => vi.useRealTimers());

describe("vigilante del navegador", () => {
  it("junta los fallos iguales y los envía por lotes con sus pasos previos", () => {
    const c = nuevo();
    c.paso("Abre /dashboard/clientes");
    c.paso("pulsa «Guardar»");
    c.paso("pulsa «Guardar»");
    c.fallo({ origen: "navegador", nivel: "error", titulo: "x is not a function", ruta: "/dashboard/clientes" });
    c.fallo({ origen: "navegador", nivel: "error", titulo: "x is not a function", ruta: "/dashboard/clientes" });
    c.fallo({ origen: "peticion", nivel: "error", titulo: "POST /api/clientes respondió 500", ruta: "POST /api/clientes" });
    expect(enviados).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toHaveLength(2);
    expect(enviados[0][0]).toMatchObject({ titulo: "x is not a function", veces: 2 });
    const ctx = enviados[0][0].contexto as { pantalla: string; pasos: string[] };
    expect(ctx.pantalla).toBe("/dashboard/clientes");
    // El mismo paso repetido seguido solo se anota una vez
    expect(ctx.pasos.filter((p) => p.includes("pulsa «Guardar»"))).toHaveLength(1);
  });

  it("no vuelve a avisar del mismo fallo en menos de un minuto y no pasa del máximo por sesión", () => {
    const c = nuevo({ maxPorSesion: 3 });
    const f = (n: number): EventoNavegador => ({ origen: "navegador", nivel: "error", titulo: `Fallo ${String.fromCharCode(65 + n)}` });
    c.fallo(f(0));
    vi.advanceTimersByTime(1000);
    c.fallo(f(0));
    vi.advanceTimersByTime(1000);
    expect(enviados).toHaveLength(1);
    reloj += 61_000;
    c.fallo(f(0));
    vi.advanceTimersByTime(1000);
    expect(enviados).toHaveLength(2);
    c.fallo(f(1));
    c.fallo(f(2));
    c.fallo(f(3));
    vi.advanceTimersByTime(1000);
    expect(enviados.flat().length).toBe(3);
  });

  it("los pasos no guardan datos personales y solo se conservan los últimos", () => {
    const c = nuevo();
    c.paso("consola: error con ana@correo.es y DNI 12345678Z");
    for (let i = 0; i < 50; i++) c.paso(`paso ${i}`);
    const pasos = c.ultimosPasos(100);
    expect(pasos.length).toBeLessThanOrEqual(30);
    expect(pasos.join(" ")).not.toMatch(/ana@correo|12345678Z/);
    expect(pasos[pasos.length - 1]).toContain("paso 49");
  });

  it("reconoce el ruido del navegador que no merece aviso", () => {
    expect(esRuidoDelNavegador("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(esRuidoDelNavegador("Script error.")).toBe(true);
    expect(esRuidoDelNavegador("TypeError: x is not a function")).toBe(false);
  });
});
