import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { urlDesarrollo as urlAdmin, urlPruebas } from "./urls";

/** Crea (si hace falta) la base de datos de pruebas y aplica las migraciones. */
export default async function setup(): Promise<void> {
  const nombre = new URL(urlPruebas).pathname.slice(1);
  if (!nombre.endsWith("_test")) throw new Error(`Por seguridad la BD de pruebas debe acabar en _test (${nombre})`);

  const admin = new Client({ connectionString: urlAdmin });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [nombre]);
    if (!rowCount) await admin.query(`create database "${nombre}"`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: urlPruebas, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
  } finally {
    await pool.end();
  }
}
