import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { adjuntos, adjuntosDatos, clientes, expedientes, marcas, tiendas, validacionesComision } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";
import { filasPapelera, purgar, purgarAFondo, resumenPapelera } from "./papelera";

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

  it.skipIf(!hayPg)("purgar a fondo borra lo eliminado con todo lo suyo y respeta lo vigente", async () => {
    const { admin, vigente, borrado, docVigente } = await escenario();
    // Sin la palabra de confirmación no se hace nada
    await expect(purgar(db, admin.idUsuario, { categoria: "expedientes", todo: true, confirmacion: "sí" })).rejects.toThrow(/PURGAR/);
    const r = await purgarAFondo(db, admin.idUsuario, { accion: "a_fondo", confirmacion: "purgar a fondo", incluirSinVincular: false, conservarHistorial: true });
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

  it.skipIf(!hayPg)("un elemento de catálogo que aún usa un expediente no se purga; el que nadie usa, sí", async () => {
    const admin = await crearUsuarioPrueba("administrador", "Admin");
    const [libre] = await db.insert(marcas).values({ nombre: "Libre", eliminadoEn: new Date() }).returning();
    const [usada] = await db.insert(tiendas).values({ nombre: "Usada", eliminadoEn: new Date() }).returning();
    await db.insert(expedientes).values({ idTienda: usada.idTienda });
    const filas = (await filasPapelera(db, "catalogo")).filas;
    expect(filas.find((f) => f.id === `tiendas:${usada.idTienda}`)?.bloqueo).toMatch(/usan/);
    expect(filas.find((f) => f.id === `marcas:${libre.idMarca}`)?.bloqueo).toBeNull();
    const r = await purgar(db, admin.idUsuario, { categoria: "catalogo", todo: true, confirmacion: "PURGAR" });
    expect(r).toMatchObject({ purgados: 1, bloqueados: 1 });
    expect(await db.select().from(marcas).where(eq(marcas.idMarca, libre.idMarca))).toHaveLength(0);
    expect(await db.select().from(tiendas).where(eq(tiendas.idTienda, usada.idTienda))).toHaveLength(1);
  });
});
