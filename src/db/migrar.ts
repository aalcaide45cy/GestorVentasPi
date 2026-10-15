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
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "src", "db", "migrations") });
    await sembrar(db);
    console.log("Migraciones y semilla aplicadas.");
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
