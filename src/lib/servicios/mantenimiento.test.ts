import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { count } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { clientes, marcas, modelos, tiendas, usuarios } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { vaciarBaseDeDatos } from "./mantenimiento";

/** La copia previa usa pg_dump: local o, si no hay, el del contenedor de desarrollo (como en copias.test.ts). */
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
    return true;
  } catch {
    return false;
  }
}

const hayPg = configurarPg();
let dir = "";

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "gv-vaciar-"));
  process.env.BACKUP_DIR = dir;
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(reiniciarBd);

const total = async (tabla: typeof marcas | typeof modelos | typeof clientes | typeof tiendas | typeof usuarios) => (await db.select({ n: count() }).from(tabla))[0].n;

describe("vaciar la base de datos", () => {
  it("exige escribir BORRAR TODO y no toca nada si no coincide", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await db.insert(marcas).values({ nombre: "Renault" });
    await expect(vaciarBaseDeDatos(db, admin.idUsuario, { confirmacion: "borrar", eliminarOtrosUsuarios: false })).rejects.toMatchObject({ status: 400 });
    expect(await total(marcas)).toBe(1);
  });

  it.skipIf(!hayPg)("borra datos y catálogos, conserva las cuentas y reinicia los números", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await crearUsuarioPrueba("vendedor");
    const [t] = await db.insert(tiendas).values({ nombre: "Centro", ciudad: "Madrid" }).returning();
    await db.insert(marcas).values({ nombre: "Renault" });
    await db.insert(clientes).values({ clienteId: "c-1", nombre: "Ana", tiendaId: t.idTienda });
    const r = await vaciarBaseDeDatos(db, admin.idUsuario, { confirmacion: "BORRAR TODO", eliminarOtrosUsuarios: false, catalogosPorDefecto: false });
    expect(r.copiaPrevia).toMatch(/_previa\.dump$/);
    expect(await total(marcas)).toBe(0);
    expect(await total(clientes)).toBe(0);
    expect(await total(tiendas)).toBe(0);
    expect(await total(usuarios)).toBe(2);
    const [nueva] = await db.insert(marcas).values({ nombre: "Dacia" }).returning();
    expect(nueva.idMarca).toBe(1);
  });

  it.skipIf(!hayPg)("por defecto vuelve a dejar los catálogos de partida (marcas, modelos, estados y pagos)", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await db.insert(marcas).values({ nombre: "Otra" });
    await vaciarBaseDeDatos(db, admin.idUsuario, { confirmacion: "BORRAR TODO" });
    const nombres = (await db.select().from(marcas)).map((m) => m.nombre).sort();
    expect(nombres).toEqual(["Dacia", "Hyundai", "Peugeot", "Renault", "Toyota"]);
    const dacia = (await db.select().from(marcas)).find((m) => m.nombre === "Dacia");
    expect(dacia).toMatchObject({ sistemaComisiones: true, accesoRapido: true });
    expect(await total(modelos)).toBe(29);
  });

  it.skipIf(!hayPg)("con eliminarOtrosUsuarios solo queda la cuenta del administrador", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await crearUsuarioPrueba("vendedor");
    await vaciarBaseDeDatos(db, admin.idUsuario, { confirmacion: "BORRAR TODO", eliminarOtrosUsuarios: true, catalogosPorDefecto: false });
    expect(await total(usuarios)).toBe(1);
  });
});
