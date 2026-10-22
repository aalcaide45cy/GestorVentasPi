import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { adjuntos, ajustes, auditoria, biblioteca, clientes, copiasSeguridad, expedientes, marcas, modelos, papeleraElementos, plantillasPlan, plantillasTarifasVn, tipoDeVenta, usuarios } from "@/db/schema";
import { sembrar, sembrarCatalogoInicial } from "@/db/semilla";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { guardarArchivo, eliminarArchivos } from "./biblioteca";
import { borrarAbsolutamenteTodo } from "./borrado-total";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";
import { crearIncidenciaManual } from "./incidencias";
import { eliminarRejilla, esquemaGuardarRejilla, guardarRejilla } from "./rejillas";

let carpeta = "";
beforeAll(() => {
  // Las copias y la cola de lectura de la prueba van a carpetas temporales: nunca a las de verdad
  carpeta = mkdtempSync(path.join(os.tmpdir(), "gv-borrado-total-"));
  process.env.BACKUP_DIR = path.join(carpeta, "copias");
  process.env.LECTURAS_DIR = path.join(carpeta, "lecturas");
  mkdirSync(process.env.BACKUP_DIR, { recursive: true });
});
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));
beforeEach(async () => {
  await reiniciarBd();
  await sembrar(db);
  await sembrarCatalogoInicial(db);
});

describe("borrar absolutamente todo", () => {
  it("deja la base como de fábrica y conserva solo lo grabado a fuego y al administrador", async () => {
    const admin = await crearUsuarioPrueba("administrador", "Admin");
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    await crearExpediente(db, ana, esquemaCrearExpediente.parse({ cliente: { nombre: "Cliente", dni: "11111111H" }, expediente: {} }));
    const [exp] = await db.select().from(expedientes);
    await db.insert(adjuntos).values({ ambito: "expediente", idExpediente: exp.idExpediente, tipo: "pedido", nombre: "x.pdf", mime: "application/pdf", tamano: 3 });
    const { archivo } = await guardarArchivo(db, { datos: Buffer.from("hola"), nombre: "b.pdf", creadoPor: ana.idUsuario });
    await eliminarArchivos(db, [archivo.id]); // en la Papelera
    await guardarRejilla(db, ana.idUsuario, ana.idUsuario, esquemaGuardarRejilla.parse({ mes: "2026-07", origen: "excel", filas: [{ matricula: "1234BCD", importe: 5000 }] }));
    await eliminarRejilla(db, ana.idUsuario, "2026-07"); // en la Papelera de elementos
    await crearIncidenciaManual(db, { texto: "Falla", ruta: null, contexto: {}, idUsuario: null, version: null });
    await db.insert(auditoria).values({ accion: "algo" });
    await db.insert(plantillasPlan).values({ ambito: "x", nombre: "Mi plantilla", datos: {} });
    await db.insert(plantillasPlan).values({ ambito: "x", nombre: "Plantilla base", datos: {}, sistema: true });
    await db.insert(ajustes).values([{ clave: "cifrado_activo", valor: "false" }, { clave: "ocr_motor", valor: "rapidocr" }]);
    writeFileSync(path.join(process.env.BACKUP_DIR as string, "gv_20261022_120000_manual.dump"), "dump");
    mkdirSync(path.join(process.env.BACKUP_DIR as string, "papelera"), { recursive: true });
    writeFileSync(path.join(process.env.BACKUP_DIR as string, "papelera", "gv_20261022_110000_manual.dump"), "dump");
    const nMarcas = (await db.select().from(marcas)).length;
    const nModelos = (await db.select().from(modelos)).length;
    expect(nMarcas).toBeGreaterThan(0);

    const r = await borrarAbsolutamenteTodo(db, admin.idUsuario, { confirmacion: "BORRAR ABSOLUTAMENTE TODO", hacerCopia: false });
    expect(r.copiaPrevia).toBeNull();

    // Todo lo demás, a cero (incluida la Papelera y lo «eliminado»)
    expect(await db.select().from(clientes)).toHaveLength(0);
    expect(await db.select().from(expedientes)).toHaveLength(0);
    expect(await db.select().from(adjuntos)).toHaveLength(0);
    expect(await db.select().from(biblioteca)).toHaveLength(0);
    expect(await db.select().from(papeleraElementos)).toHaveLength(0);
    expect(await db.select().from(auditoria)).toHaveLength(0);
    expect(await db.select().from(copiasSeguridad)).toHaveLength(0);
    expect(existsSync(path.join(process.env.BACKUP_DIR as string, "gv_20261022_120000_manual.dump"))).toBe(false);
    expect(existsSync(path.join(process.env.BACKUP_DIR as string, "papelera"))).toBe(false);
    // Solo queda el administrador
    expect((await db.select().from(usuarios)).map((u) => u.idUsuario)).toEqual([admin.idUsuario]);
    // Plantillas: solo las base
    expect((await db.select().from(plantillasPlan)).map((p) => p.nombre)).toEqual(["Plantilla base"]);
    expect((await db.select().from(plantillasTarifasVn)).every((p) => p.sistema)).toBe(true);
    expect((await db.select().from(plantillasTarifasVn)).length).toBeGreaterThan(0);
    // Grabado a fuego: marcas y modelos intactos
    expect(await db.select().from(marcas)).toHaveLength(nMarcas);
    expect(await db.select().from(modelos)).toHaveLength(nModelos);
    // Ajustes de fábrica salvo el interruptor del cifrado; catálogos de partida repuestos
    expect((await db.select().from(ajustes)).map((a) => a.clave).filter((c) => c === "ocr_motor")).toEqual([]);
    expect((await db.select().from(ajustes).where(eq(ajustes.clave, "cifrado_activo"))).length).toBe(1);
    expect((await db.select().from(tipoDeVenta)).length).toBeGreaterThan(0);
    // Los números vuelven a empezar
    const [nuevo] = await db.insert(clientes).values({ clienteId: "c1", nombre: "Nuevo" }).returning();
    expect(nuevo.id).toBe(1);
  });

  it("exige la frase de confirmación y no toca nada si no llega", async () => {
    const admin = await crearUsuarioPrueba("administrador", "Admin");
    await db.insert(clientes).values({ clienteId: "c1", nombre: "Ana" });
    await expect(borrarAbsolutamenteTodo(db, admin.idUsuario, { confirmacion: "no", hacerCopia: false } as never)).rejects.toThrow();
    expect(await db.select().from(clientes)).toHaveLength(1);
  });

  it("si la copia previa se pide y falla, no se borra nada", async () => {
    const admin = await crearUsuarioPrueba("administrador", "Admin");
    await db.insert(clientes).values({ clienteId: "c1", nombre: "Ana" });
    const anterior = process.env.BACKUP_DIR;
    // Una «carpeta de copias» que es un fichero: crear la copia falla
    const fichero = path.join(carpeta, "no-es-carpeta");
    writeFileSync(fichero, "x");
    process.env.BACKUP_DIR = fichero;
    try {
      await expect(borrarAbsolutamenteTodo(db, admin.idUsuario, { confirmacion: "BORRAR ABSOLUTAMENTE TODO", hacerCopia: true })).rejects.toMatchObject({ status: 500 });
    } finally {
      process.env.BACKUP_DIR = anterior;
    }
    expect(await db.select().from(clientes)).toHaveLength(1);
    expect((await db.execute(sql`select 1 as x`)).rows).toHaveLength(1);
  });
});
