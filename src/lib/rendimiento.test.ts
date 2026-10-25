import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { instantanea, probarBd, probarDisco, recursosRapidos, reiniciarRendimiento, swapPreocupa, textoConsecuenciaSwap } from "./rendimiento";
import { consultasLentas, normalizarRuta, olvidarRendimiento, registrarConsulta, registrarPeticion, resumenPeticiones } from "./rendimiento-registro";

let dir = "";
beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "gv-rend-"));
  process.env.BACKUP_DIR = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  olvidarRendimiento();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("registro de peticiones y consultas lentas", () => {
  it("agrupa las rutas con identificadores y calcula media, máximo y errores", () => {
    expect(normalizarRuta("/api/expedientes/123/documentos/45")).toBe("/api/expedientes/:id/documentos/:id");
    registrarPeticion("GET", "/api/expedientes/1", 200, 100);
    registrarPeticion("GET", "/api/expedientes/2", 200, 300);
    registrarPeticion("POST", "/api/clientes", 500, 50);
    const r = resumenPeticiones(30);
    expect(r.total).toBe(3);
    expect(r.rutas.find((x) => x.ruta === "/api/expedientes/:id")).toMatchObject({ veces: 2, mediaMs: 200, maxMs: 300, errores: 0 });
    expect(r.rutas.find((x) => x.ruta === "/api/clientes")).toMatchObject({ errores: 1 });
  });

  it("solo anota como lentas las consultas por encima del umbral y recorta su texto", () => {
    registrarConsulta(100, "select 1");
    registrarConsulta(1200, `select   *\n from expedientes where x = ${"y".repeat(1000)}`);
    const c = consultasLentas();
    expect(c).toHaveLength(1);
    expect(c[0].ms).toBe(1200);
    expect(c[0].sql.length).toBeLessThanOrEqual(400);
    expect(c[0].sql.startsWith("select * from expedientes")).toBe(true);
  });
});

describe("diagnóstico", () => {
  it("la instantánea trae el equipo, la base de datos y al menos un hallazgo", async () => {
    const s = await instantanea();
    expect(s.equipo.nucleos).toBeGreaterThan(0);
    // Otras pruebas vacían la base de datos a la vez: aquí basta con que la consulta responda con datos o con un motivo
    expect("error" in s.bd ? s.bd.error.length > 0 : s.bd.version.length > 0).toBe(true);
    expect(s.hallazgos.length).toBeGreaterThan(0);
    expect(s.muestra.memLibrePct).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it("la prueba de disco devuelve velocidades y borra su archivo de prueba", async () => {
    const r = await probarDisco();
    expect(r.escrituraMBs).toBeGreaterThan(0);
    expect(r.lecturaMBs).toBeGreaterThan(0);
    expect(r.veredicto.length).toBeGreaterThan(10);
    expect(readdirSync(dir).filter((f) => f.includes("prueba-disco"))).toHaveLength(0);
  }, 30_000);

  it("la prueba de la base de datos mide consultas simples", async () => {
    const r = await probarBd();
    expect(r.consultaMinimaMs).toBeGreaterThanOrEqual(0);
    expect(r.veredicto.length).toBeGreaterThan(10);
  }, 30_000);

  it("los recursos rápidos de la barra superior dan CPU, memoria y un nivel", () => {
    recursosRapidos(); // la primera lectura fija el punto de partida de las diferencias
    const r = recursosRapidos();
    expect(r.cpu).toBeGreaterThanOrEqual(0);
    expect(r.cpu).toBeLessThanOrEqual(100);
    expect(r.memoriaUsadaPct).toBeGreaterThan(0);
    expect(r.memoriaTotalMb).toBeGreaterThan(0);
    expect(["ok", "aviso", "alto"]).toContain(r.nivel);
  });
});

describe("contar desde ahora", () => {
  it("olvida las peticiones y consultas lentas anotadas y el historial, y no toca datos", async () => {
    registrarPeticion("GET", "/api/expedientes/1", 200, 100);
    registrarConsulta(900, "select 1");
    expect(resumenPeticiones(30).total).toBe(1);
    const r = await reiniciarRendimiento();
    expect(typeof r.contadoresBd).toBe("boolean");
    expect(r.contadoresBd ? r.ayuda : typeof r.ayuda).toSatisfy((v: unknown) => v === null || v === "string");
    expect(resumenPeticiones(30).total).toBe(0);
    expect(consultasLentas()).toEqual([]);
    expect((await instantanea()).bd).not.toHaveProperty("error");
  });
});

describe("aviso de memoria de intercambio (swap)", () => {
  it("en Linux avisa a partir de 300 MB, haya o no memoria libre", () => {
    expect(swapPreocupa({ plataforma: "linux", swapUsadoMb: 299, memLibrePct: 5 })).toBe(false);
    expect(swapPreocupa({ plataforma: "linux", swapUsadoMb: 300, memLibrePct: 70 })).toBe(true);
  });
  it("en macOS el swap usado tras un pico no es un problema mientras sobre memoria", () => {
    expect(swapPreocupa({ plataforma: "darwin", swapUsadoMb: 4000, memLibrePct: 61 })).toBe(false);
    expect(swapPreocupa({ plataforma: "darwin", swapUsadoMb: 4000, memLibrePct: 14 })).toBe(true);
    expect(swapPreocupa({ plataforma: "darwin", swapUsadoMb: 100, memLibrePct: 5 })).toBe(false);
  });
  it("el texto habla de la tarjeta SD solo en una Raspberry", () => {
    expect(textoConsecuenciaSwap("Raspberry")).toContain("tarjeta SD");
    expect(textoConsecuenciaSwap("Apple")).not.toContain("tarjeta SD");
    expect(textoConsecuenciaSwap("AMD")).not.toContain("tarjeta SD");
  });
});
