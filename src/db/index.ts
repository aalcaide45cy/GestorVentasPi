import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { contextoHistorial } from "@/lib/historial/contexto";
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

/*
 * Historial de deshacer y rehacer: unos disparadores de la base de datos anotan cada fila cambiada, pero solo si la conexión lleva
 * fijados el grupo y el usuario de la petición (variables de sesión `app.hist_*`). Aquí se fijan: al abrir cada transacción y al
 * lanzar una escritura suelta (que se ejecuta dentro de una transacción mínima para poder llevarlas). Sin contexto, no se anota nada.
 */
const SQL_CONTEXTO = "select set_config('app.hist_grupo', $1, true), set_config('app.hist_usuario', $2, true), set_config('app.hist_accion', $3, true)";

const transaccionOriginal = db.transaction.bind(db);
db.transaction = (async (fn: Parameters<Db["transaction"]>[0], config?: Parameters<Db["transaction"]>[1]) =>
  transaccionOriginal(async (tx) => {
    const ctx = contextoHistorial();
    if (ctx && ctx.usuario !== null) await tx.execute(sql`select set_config('app.hist_grupo', ${ctx.grupo}, true), set_config('app.hist_usuario', ${String(ctx.usuario)}, true), set_config('app.hist_accion', ${ctx.accion}, true)`);
    return fn(tx);
  }, config)) as Db["transaction"];

type ConsultaPool = (...args: unknown[]) => unknown;
const consultaOriginal = (pool as unknown as { query: ConsultaPool }).query.bind(pool);
const esEscritura = (consulta: unknown): boolean => {
  const texto = typeof consulta === "string" ? consulta : (consulta as { text?: unknown } | null)?.text;
  return typeof texto === "string" && /^\s*(insert|update|delete)\b/i.test(texto);
};
(pool as unknown as { query: ConsultaPool }).query = (...args: unknown[]) => {
  const ctx = contextoHistorial();
  if (!ctx || ctx.usuario === null || !esEscritura(args[0]) || typeof args[args.length - 1] === "function") return consultaOriginal(...args);
  return (async () => {
    const cliente = await pool.connect();
    try {
      await cliente.query("begin");
      await cliente.query(SQL_CONTEXTO, [ctx.grupo, String(ctx.usuario), ctx.accion]);
      const resultado = await (cliente.query as ConsultaPool).call(cliente, ...args);
      await cliente.query("commit");
      return resultado;
    } catch (e) {
      await cliente.query("rollback").catch(() => undefined);
      throw e;
    } finally {
      cliente.release();
    }
  })();
};

/** Cliente de transacción o la propia conexión: las funciones de servicio aceptan ambos. */
export type Ejecutor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
