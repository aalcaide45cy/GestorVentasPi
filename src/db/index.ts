import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as relations from "./relations";
import * as schema from "./schema";

export const esquemaCompleto = { ...schema, ...relations };

const globalConPool = globalThis as unknown as { __pgPool?: Pool };

function crearPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta la variable de entorno DATABASE_URL");
  return new Pool({ connectionString: url, max: 10 });
}

export const pool: Pool = globalConPool.__pgPool ?? crearPool();
if (process.env.NODE_ENV !== "production") globalConPool.__pgPool = pool;

export const db = drizzle(pool, { schema: esquemaCompleto });
export type Db = typeof db;
/** Cliente de transacción o la propia conexión: las funciones de servicio aceptan ambos. */
export type Ejecutor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
