import "dotenv/config";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sembrar } from "./semilla";

/** Aplica las migraciones pendientes y la semilla. Uso: `npm run db:migrate`. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const pool = new Pool({ connectionString: url, max: 2 });
  // Cerrojo de Postgres: si arrancan dos contenedores a la vez, solo uno migra y el otro espera.
  const cerrojo = await pool.connect();
  try {
    await cerrojo.query("select pg_advisory_lock(727274)");
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
    await sembrar(db);
    console.log("Migraciones y semilla aplicadas.");
  } finally {
    await cerrojo.query("select pg_advisory_unlock(727274)").catch(() => undefined);
    cerrojo.release();
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
