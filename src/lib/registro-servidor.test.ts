import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { instalarRegistroServidor, leerRegistro } from "./registro-servidor";

let dir = "";
beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "gv-registro-"));
  process.env.BACKUP_DIR = dir;
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("registro del servidor", () => {
  it("guarda lo que sale por console (con su traza en varias líneas) y se puede filtrar por nivel y texto", async () => {
    // No se ensucia la salida de las pruebas
    const sinSalida = () => undefined;
    console.log = sinSalida;
    console.info = sinSalida;
    console.warn = sinSalida;
    console.error = sinSalida;
    instalarRegistroServidor();
    console.info("Servidor iniciado");
    console.warn("Aviso de prueba");
    console.error("Restauración fallida:", new Error("pg_restore ha fallado: versión no soportada").stack);
    console.log("otra cosa %s", "normal");
    await esperar(300);

    const todo = await leerRegistro({ nivel: "todo" });
    expect(todo.entradas).toHaveLength(4);
    expect(todo.entradas[0]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z \[INFO\] Servidor iniciado$/);
    // La traza de un error (varias líneas) queda dentro de una sola entrada
    expect(todo.entradas[2]).toMatch(/\[ERROR\] Restauración fallida:[\s\S]+pg_restore ha fallado/);
    expect(todo.entradas[2].split("\n").length).toBeGreaterThan(1);
    expect(todo.entradas[3]).toContain("otra cosa normal");

    expect((await leerRegistro({ nivel: "avisos" })).entradas).toHaveLength(2);
    expect((await leerRegistro({ nivel: "errores" })).entradas).toHaveLength(1);
    expect((await leerRegistro({ texto: "AVISO DE PRUEBA" })).entradas).toHaveLength(1);
    expect((await leerRegistro({ lineas: 2 })).entradas).toHaveLength(2);
  });
});
