import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalConPool = globalThis as unknown as { __pgPool?: Pool };

function crearPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta la variable de entorno DATABASE_URL");
  return new Pool({ connectionString: url, max: 10 });
}

export const pool: Pool = globalConPool.__pgPool ?? crearPool();
if (process.env.NODE_ENV !== "production") globalConPool.__pgPool = pool;

export const db = drizzle(pool);
