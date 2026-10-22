import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { adjuntos, adjuntosDatos, auditoria, biblioteca, clientes, expedientes, marcas, modelos, tiendas, tipoDeVenta, validacionesComision } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";
import { filasPapelera, purgar, purgarAFondo, restaurar, resumenPapelera } from "./papelera";

/** Igual que en las demás pruebas de copias: usa el cliente local de PostgreSQL o el del contenedor de desarrollo. */
function configurarPg(): boolean {
  try {
    execFileSync("pg_dump", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    /* sin cliente local */
  }
  try {
    const contenedor = process.env.PG_CONTENEDOR ?? "gestorventas-db";
    execFileSync("docker", ["exec", contenedor, "pg_dump", "--version"], { stdio: "ignore" });
    const clave = decodeURIComponent(new URL(process.env.DATABASE_URL as string).password);
    process.env.PG_DUMP_CMD = `docker exec -i -e PGPASSWORD=${clave} ${contenedor} pg_dump`;
    process.env.PG_RESTORE_CMD = `docker exec -i -e PGPASSWORD=${clave} ${contenedor} pg_restore`;
    return true;
  } catch {
    return false;
  }
}

const hayPg = configurarPg();
let dir = "";
beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "gv-papelera-"));
  process.env.BACKUP_DIR = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(reiniciarBd);

async function escenario() {
  const admin = await crearUsuarioPrueba("administrador", "Admin");
  const vigente = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ cliente: { nombre: "Vigente", dni: "11111111H" }, expediente: {} }));
  const borrado = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ cliente: { nombre: "Borrada", dni: "22222222J" }, expediente: {} }));
  const ahora = new Date();
  await db.update(expedientes).set({ eliminadoEn: ahora }).where(eq(expedientes.idExpediente, borrado.id_expediente));
  await db.update(clientes).set({ eliminadoEn: ahora }).where(eq(clientes.id, borrado.id_cliente as number));
  const doc = async (idExpediente: number, nombre: string) => {
    const [a] = await db.insert(adjuntos).values({ ambito: "expediente", idExpediente, tipo: "pedido", nombre, mime: "application/pdf", tamano: 5 }).returning();
    await db.insert(adjuntosDatos).values({ idAdjunto: a.id, datos: Buffer.from("hola") });
    return a;
  };
  const docVigente = await doc(vigente.id_expediente, "vigente.pdf");
  const docBorrado = await doc(borrado.id_expediente, "borrado.pdf");
  await db.insert(validacionesComision).values({ idUsuario: admin.idUsuario, mes: "2026-09", idExpediente: borrado.id_expediente, estado: "pagado" });
  return { admin, vigente, borrado, docVigente, docBorrado };
}

describe("papelera: lo que sigue guardado tras eliminar", () => {
  it("lista lo eliminado con lo que arrastra y lo que impide purgarlo", async () => {
    const { borrado } = await escenario();
    const r = await resumenPapelera(db);
    expect(r.find((c) => c.categoria === "expedientes")?.cantidad).toBe(1);
    expect(r.find((c) => c.categoria === "clientes")?.cantidad).toBe(1);
    const exps = await filasPapelera(db, "expedientes");
    expect(exps.filas[0]).toMatchObject({ id: String(borrado.id_expediente), bloqueo: null });
    expect(exps.filas[0].detalle).toMatch(/1 documento/);
    // El cliente eliminado no se puede purgar mientras conserve su expediente eliminado
    expect((await filasPapelera(db, "clientes")).filas[0].bloqueo).toMatch(/expediente/);
  });

  it.skipIf(!hayPg)("purgar documentos va por lotes, cuenta su avance y se puede cancelar entre lotes", { timeout: 120_000 }, async () => {
    const { admin, borrado, docBorrado } = await escenario();
    const avances: string[] = [];
    const r = await purgar(db, admin.idUsuario, { categoria: "documentos", todo: true, confirmacion: "PURGAR" }, { avance: (_h, _t, texto) => void (texto && avances.push(texto)), cancelada: () => false });
    expect(r.purgados).toBe(1);
    expect(avances.some((t) => t.includes("copia de seguridad"))).toBe(true);
    expect(avances.some((t) => /Documentos: 1 de 1/.test(t))).toBe(true);
    expect(await db.select().from(adjuntos).where(eq(adjuntos.id, docBorrado.id))).toHaveLength(0);
    // Cancelada antes del primer lote: no borra nada
    const { docBorrado: otro } = await escenario();
    await expect(purgar(db, admin.idUsuario, { categoria: "documentos", todo: true, confirmacion: "PURGAR" }, { avance: () => undefined, cancelada: () => true })).rejects.toThrow(/Se ha parado a mitad/);
    expect(await db.select().from(adjuntos).where(eq(adjuntos.id, otro.id))).toHaveLength(1);
    expect(borrado.id_expediente).toBeGreaterThan(0);
  });

  it.skipIf(!hayPg)("purgar a fondo borra lo eliminado con todo lo suyo y respeta lo vigente", { timeout: 120_000 }, async () => {
    const { admin, vigente, borrado, docVigente } = await escenario();
    // Sin la palabra de confirmación no se hace nada
    await expect(purgar(db, admin.idUsuario, { categoria: "expedientes", todo: true, confirmacion: "sí" })).rejects.toThrow(/PURGAR/);
    const r = await purgarAFondo(db, admin.idUsuario, { accion: "a_fondo", confirmacion: "purgar a fondo", incluirSinVincular: false, conservarHistorial: true, vaciarAuditoria: false });
    expect(r.copiaPrevia).toMatch(/previa/);
    expect(r.purgados).toBe(2); // el expediente y el cliente; el documento y la marca de pagado se van con el expediente
    // Lo eliminado ya no está: ni el expediente, ni su cliente, ni su documento, ni su marca de pagado
    expect(await db.select().from(expedientes).where(eq(expedientes.idExpediente, borrado.id_expediente))).toHaveLength(0);
    expect(await db.select().from(clientes).where(eq(clientes.id, borrado.id_cliente as number))).toHaveLength(0);
    expect((await db.select().from(adjuntos)).map((a) => a.nombre)).toEqual(["vigente.pdf"]);
    expect(await db.select().from(adjuntosDatos)).toHaveLength(1);
    expect(await db.select().from(validacionesComision)).toHaveLength(0);
    // Lo vigente sigue entero
    expect(await db.select().from(expedientes).where(eq(expedientes.idExpediente, vigente.id_expediente))).toHaveLength(1);
    expect((await db.select().from(adjuntos).where(eq(adjuntos.id, docVigente.id))).length).toBe(1);
  });

  it.skipIf(!hayPg)("un elemento de catálogo que aún usa un expediente no se purga; el que nadie usa, sí", { timeout: 120_000 }, async () => {
    const admin = await crearUsuarioPrueba("administrador", "Admin");
    const [libre] = await db.insert(tipoDeVenta).values({ nombreTipoVenta: "Libre", eliminadoEn: new Date() }).returning();
    const [usada] = await db.insert(tiendas).values({ nombre: "Usada", eliminadoEn: new Date() }).returning();
    await db.insert(expedientes).values({ idTienda: usada.idTienda });
    const filas = (await filasPapelera(db, "catalogo")).filas;
    expect(filas.find((f) => f.id === `tiendas:${usada.idTienda}`)?.bloqueo).toMatch(/usan/);
    expect(filas.find((f) => f.id === `tipo_de_venta:${libre.idTipoDeVenta}`)?.bloqueo).toBeNull();
    const r = await purgar(db, admin.idUsuario, { categoria: "catalogo", todo: true, confirmacion: "PURGAR" });
    expect(r).toMatchObject({ purgados: 1, bloqueados: 1 });
    expect(await db.select().from(tipoDeVenta).where(eq(tipoDeVenta.idTipoDeVenta, libre.idTipoDeVenta))).toHaveLength(0);
    expect(await db.select().from(tiendas).where(eq(tiendas.idTienda, usada.idTienda))).toHaveLength(1);
  });

  it.skipIf(!hayPg)("en auditoría, historial y lecturas se puede purgar lo elegido fila a fila (antes pedía los días)", { timeout: 120_000 }, async () => {
    const admin = await crearUsuarioPrueba("administrador", "Admin");
    const filas = await db.insert(auditoria).values([{ accion: "a" }, { accion: "b" }, { accion: "c" }]).returning();
    const r = await purgar(db, admin.idUsuario, { categoria: "auditoria", ids: [String(filas[0].id), String(filas[1].id)], confirmacion: "PURGAR" });
    expect(r.purgados).toBe(2);
    expect((await db.select().from(auditoria)).map((x) => x.accion)).toEqual(["c"]);
    // Sin elegir nada, ni todo, ni días, no se hace nada
    await expect(purgar(db, admin.idUsuario, { categoria: "auditoria", confirmacion: "PURGAR" })).rejects.toThrow(/nada elegido/);
  });
});

describe("papelera: restaurar", () => {
  it("un expediente vuelve a verse con su cliente y sus documentos", async () => {
    const { borrado, docBorrado } = await escenario();
    const r = await restaurar(db, { accion: "restaurar", categoria: "expedientes", ids: [String(borrado.id_expediente)] });
    expect(r).toMatchObject({ restaurados: 1, bloqueados: 0 });
    const [e] = await db.select().from(expedientes).where(eq(expedientes.idExpediente, borrado.id_expediente));
    expect(e.eliminadoEn).toBeNull();
    const [c] = await db.select().from(clientes).where(eq(clientes.id, borrado.id_cliente as number));
    expect(c.eliminadoEn).toBeNull();
    expect((await resumenPapelera(db)).find((x) => x.categoria === "expedientes")?.cantidad).toBe(0);
    expect(docBorrado.id).toBeGreaterThan(0);
  });

  it("restaurar dos veces lo mismo no rompe nada y avisa de lo que ya no estaba", async () => {
    const { borrado } = await escenario();
    const entrada = { accion: "restaurar" as const, categoria: "expedientes" as const, ids: [String(borrado.id_expediente)] };
    await restaurar(db, entrada);
    const otra = await restaurar(db, entrada);
    expect(otra).toMatchObject({ restaurados: 0, bloqueados: 1 });
  });

  it("un cliente no vuelve si hay otro vigente con su mismo DNI", async () => {
    const { borrado } = await escenario();
    await db.insert(clientes).values({ clienteId: "OTRO-1", nombre: "Otro", dni: "22222222J" });
    const r = await restaurar(db, { accion: "restaurar", categoria: "clientes", ids: [String(borrado.id_cliente)] });
    expect(r).toMatchObject({ restaurados: 0, bloqueados: 1 });
  });

  it("un modelo no vuelve mientras su marca siga eliminada; con la marca restaurada, sí", async () => {
    // Las marcas y los modelos están grabados a fuego (no se pueden eliminar): se crean ya «eliminados», como los que vinieran de antes
    const ahora = new Date();
    const [m] = await db.insert(marcas).values({ nombre: "MarcaX", eliminadoEn: ahora }).returning();
    const [mo] = await db.insert(modelos).values({ marcaId: m.idMarca, nombreModelo: "ModeloX", eliminadoEn: ahora }).returning();
    const sola = await restaurar(db, { accion: "restaurar", categoria: "catalogo", ids: [`modelos:${mo.idModelo}`] });
    expect(sola).toMatchObject({ restaurados: 0, bloqueados: 1 });
    const juntos = await restaurar(db, { accion: "restaurar", categoria: "catalogo", ids: [`modelos:${mo.idModelo}`, `marcas:${m.idMarca}`] });
    expect(juntos).toMatchObject({ restaurados: 2, bloqueados: 0 });
  });

  it("un archivo de la Biblioteca eliminado aparece en la Papelera y se restaura", async () => {
    const { eliminarArchivos, guardarArchivo, listarArchivos } = await import("./biblioteca");
    const { archivo } = await guardarArchivo(db, { datos: Buffer.from("hola biblioteca"), nombre: "Pedido - Ana - 07 Julio 2026.pdf", creadoPor: null });
    await eliminarArchivos(db, [archivo.id]);
    expect((await resumenPapelera(db)).find((c) => c.categoria === "biblioteca")).toMatchObject({ cantidad: 1, restaurable: true });
    expect((await filasPapelera(db, "biblioteca")).filas[0]).toMatchObject({ id: String(archivo.id), subtipo: "pedido" });
    const r = await restaurar(db, { accion: "restaurar", categoria: "biblioteca", ids: [String(archivo.id)] });
    expect(r).toMatchObject({ restaurados: 1, bloqueados: 0 });
    expect((await listarArchivos(db)).map((f) => f.id)).toEqual([archivo.id]);
  });

  it.skipIf(!hayPg)("purgar un archivo de la Biblioteca lo borra de verdad", { timeout: 120_000 }, async () => {
    const { eliminarArchivos, guardarArchivo } = await import("./biblioteca");
    const { admin } = await escenario();
    const { archivo } = await guardarArchivo(db, { datos: Buffer.from("adios"), nombre: "x.pdf", creadoPor: null });
    await eliminarArchivos(db, [archivo.id]);
    const r = await purgar(db, admin.idUsuario, { categoria: "biblioteca", ids: [String(archivo.id)], confirmacion: "PURGAR" });
    expect(r.purgados).toBe(1);
    expect(await db.select().from(biblioteca).where(eq(biblioteca.id, archivo.id))).toHaveLength(0);
  });

  it("un documento de un expediente eliminado no se restaura solo; uno eliminado a mano, sí", async () => {
    const { vigente, docBorrado } = await escenario();
    const [suelto] = await db.insert(adjuntos).values({ ambito: "expediente", idExpediente: vigente.id_expediente, tipo: "pedido", nombre: "x.pdf", mime: "application/pdf", tamano: 1, eliminadoEn: new Date() }).returning();
    await db.update(adjuntos).set({ eliminadoEn: new Date() }).where(eq(adjuntos.id, docBorrado.id));
    const r = await restaurar(db, { accion: "restaurar", categoria: "documentos", ids: [String(suelto.id), String(docBorrado.id)] });
    expect(r).toMatchObject({ restaurados: 1, bloqueados: 1 });
  });
});
