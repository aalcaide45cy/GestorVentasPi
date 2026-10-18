import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { adjuntos, adjuntosDatos } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { crearCopia } from "./copias";
import { detalleCopia, leerIndiceDump } from "./copias-detalle";

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
  dir = mkdtempSync(path.join(os.tmpdir(), "gv-copias-detalle-"));
  process.env.BACKUP_DIR = dir;
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(reiniciarBd);

describe("detalle de una copia de seguridad", () => {
  it("un fichero que no es un .dump no se puede leer", async () => {
    const falso = path.join(dir, "falso.dump");
    writeFileSync(falso, "esto no es una copia de PostgreSQL");
    await expect(leerIndiceDump(falso)).rejects.toThrow();
  });

  it.skipIf(!hayPg)("dice qué ocupa cada tabla dentro del archivo, con cifras que cuadran con el tamaño del .dump", async () => {
    const u = await crearUsuarioPrueba("administrador", "Admin");
    // Un documento grande y poco comprimible: tiene que salir como lo que más pesa
    const [a] = await db.insert(adjuntos).values({ ambito: "pendiente", tipo: "pedido", nombre: "pedido.pdf", mime: "application/pdf", tamano: 400_000, creadoPor: u.idUsuario }).returning();
    const aleatorio = randomBytes(400_000);
    await db.insert(adjuntosDatos).values({ idAdjunto: a.id, datos: aleatorio });
    const copia = await crearCopia(db, "manual", u.idUsuario);
    const d = await detalleCopia(db, copia.id);
    expect(d.tamano).toBe(copia.tamano);
    expect(d.baseDeDatos).toBeTruthy();
    expect(d.tablasConDatos).toBeGreaterThan(5);
    // La tabla de los documentos es la que más pesa y las tablas no suman más que el archivo
    expect(d.tablas[0].tabla).toBe("adjuntos_datos");
    expect(d.tablas.reduce((s, t) => s + t.bytes, 0)).toBeLessThanOrEqual(d.tamano);
    expect(d.tablas[0].bytes).toBeGreaterThan(100_000);
    expect(d.grupos[0].grupo).toBe("Documentos");
    // Y avisa de los documentos sin vincular
    expect(d.documentosAhora).toEqual([{ tipo: "Pedidos", situacion: "Sin vincular a ningún expediente ni cliente", cantidad: 1, bytes: 400_000, mayor: 400_000 }]);
  });
});
