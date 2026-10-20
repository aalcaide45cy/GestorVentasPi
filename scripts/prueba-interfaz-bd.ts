import { writeFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

/**
 * Base de datos de la copia de prueba de la interfaz. `crear <carpeta>` la crea (vacía) si no existe y escribe el .env de la copia;
 * `borrar` la elimina. Solo toca la base `gestorventas_ui_prueba`, nunca la real.
 */
const NOMBRE = "gestorventas_ui_prueba";
const SECRETO = "secreto-prueba-interfaz-0123456789abcdef0123456789abcdef";

async function main() {
  const [accion, carpeta] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const pool = new Pool({ connectionString: admin.toString(), max: 1 });
  try {
    if (accion === "borrar") {
      await pool.query(`drop database if exists ${NOMBRE} with (force)`);
      console.log("Base de prueba borrada:", NOMBRE);
      return;
    }
    if (accion !== "crear" || !carpeta) throw new Error("Uso: prueba-interfaz-bd.ts crear <carpeta> | borrar");
    const ya = await pool.query("select 1 from pg_database where datname = $1", [NOMBRE]);
    if (ya.rowCount === 0) await pool.query(`create database ${NOMBRE}`);
    const propia = new URL(url);
    propia.pathname = `/${NOMBRE}`;
    writeFileSync(path.join(carpeta, ".env"), `DATABASE_URL=${propia.toString()}\nAPP_SECRET=${SECRETO}\nTZ=Europe/Madrid\n`);
    console.log("Base de prueba lista:", NOMBRE);
  } finally {
    await pool.end();
  }
}

void main().catch((e: unknown) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exit(1);
});
