import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { instantanea, probarBd, probarDisco } from "./rendimiento";
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
    expect("error" in s.bd).toBe(false);
    expect(s.hallazgos.length).toBeGreaterThan(0);
    expect(s.muestra.memLibrePct).toBeGreaterThanOrEqual(0);
  });

  it("la prueba de disco devuelve velocidades y borra su archivo de prueba", async () => {
    const r = await probarDisco();
    expect(r.escrituraMBs).toBeGreaterThan(0);
    expect(r.lecturaMBs).toBeGreaterThan(0);
    expect(r.veredicto.length).toBeGreaterThan(10);
    expect(readdirSync(dir).filter((f) => f.includes("prueba-disco"))).toHaveLength(0);
  });

  it("la prueba de la base de datos mide consultas simples", async () => {
    const r = await probarBd();
    expect(r.consultaMinimaMs).toBeGreaterThanOrEqual(0);
    expect(r.veredicto.length).toBeGreaterThan(10);
  });
});
