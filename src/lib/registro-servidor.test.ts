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

  it("recoge también lo que sale directamente por la salida estándar y de errores (por ejemplo, lo que escribe Next), sin ruido de peticiones ni repeticiones", async () => {
    // Lo que escribe console ya se recogió con su nivel: la salida estándar no lo repite
    const antes = (await leerRegistro({ nivel: "todo", lineas: 5000 })).entradas.length;
    process.stdout.write("Mensaje directo del servidor\n");
    process.stdout.write(" GET /api/documentos/lecturas 200 in 17ms (next.js: 2ms)\n");
    // Las líneas de compilar de Next no se anotan: el archivo está en el proyecto y provocarían un bucle de recargas en desarrollo
    process.stdout.write("\u001b[32m✓\u001b[0m Compiled in 3ms\n");
    process.stdout.write(" ⚠ Compiling /dashboard ...\n");
    process.stdout.write("\u001b[31mLinea con color\u001b[0m\n");
    process.stderr.write("fallo directo por stderr\n");
    await esperar(300);
    const nuevas = (await leerRegistro({ nivel: "todo", lineas: 5000 })).entradas.slice(antes);
    expect(nuevas).toHaveLength(3);
    expect(nuevas[0]).toMatch(/\[INFO\] Mensaje directo del servidor$/);
    expect(nuevas[1]).toMatch(/\[INFO\] Linea con color$/);
    expect(nuevas[2]).toMatch(/\[ERROR\] fallo directo por stderr$/);
  });

  it("tampoco anota las líneas de compilar y de peticiones que Next escribe con console (provocarían el bucle de recargas)", async () => {
    const antes = (await leerRegistro({ nivel: "todo", lineas: 5000 })).entradas.length;
    console.log("\u001b[32m✓\u001b[0m Compiled in 2ms");
    console.log(" GET /login 200 in 43ms (next.js: 4ms)");
    console.log("Línea que sí cuenta");
    await esperar(300);
    const nuevas = (await leerRegistro({ nivel: "todo", lineas: 5000 })).entradas.slice(antes);
    expect(nuevas).toHaveLength(1);
    expect(nuevas[0]).toMatch(/Línea que sí cuenta$/);
  });
});
