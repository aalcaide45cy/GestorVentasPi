import { count, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ajustes, estadoVehiculo, tipoDeVenta } from "./schema";

const ESTADOS_INICIALES = [
  { nombre: "Nuevo", clase: "VN", subtipo: null, predeterminado: true },
  { nombre: "Demo", clase: "VO", subtipo: "DEMO", predeterminado: false },
  { nombre: "KM0", clase: "VO", subtipo: "KM0", predeterminado: false },
  { nombre: "Buyback", clase: "VO", subtipo: "BUYBACK", predeterminado: false },
  { nombre: "Usado", clase: "VO", subtipo: "USADO", predeterminado: false },
] as const;

const TIPOS_VENTA_INICIALES = [
  { nombre: "Contado", categoria: "CONTADO", color: "#22c55e", orden: 1 },
  { nombre: "Crédito", categoria: "CREDITO", color: "#3b82f6", orden: 2 },
  { nombre: "Preference", categoria: "PREFERENCE", color: "#a855f7", orden: 3 },
  { nombre: "Renting", categoria: "RENTING", color: "#f59e0b", orden: 4 },
] as const;

/**
 * Semilla idempotente: solo inserta cuando la tabla está vacía, para no recrear
 * elementos que el administrador haya renombrado o borrado a propósito.
 * No crea usuarios (el primer administrador se crea con `npm run crear-admin`).
 */
export async function sembrar<S extends Record<string, unknown>>(db: NodePgDatabase<S>): Promise<void> {
  await db.transaction(async (tx) => {
    const [{ n: nEstados }] = await tx.select({ n: count() }).from(estadoVehiculo);
    if (nEstados === 0) {
      await tx.insert(estadoVehiculo).values(
        ESTADOS_INICIALES.map((e) => ({
          nombreEstadoVehiculo: e.nombre,
          clase: e.clase,
          subtipoVo: e.subtipo,
          predeterminado: e.predeterminado,
        })),
      );
    }

    const [{ n: nTipos }] = await tx.select({ n: count() }).from(tipoDeVenta);
    if (nTipos === 0) {
      await tx.insert(tipoDeVenta).values(
        TIPOS_VENTA_INICIALES.map((t) => ({
          nombreTipoVenta: t.nombre,
          categoria: t.categoria,
          color: t.color,
          orden: t.orden,
        })),
      );
    }

    const existente = await tx.select().from(ajustes).where(eq(ajustes.clave, "mostrar_botones_csv"));
    if (existente.length === 0) {
      await tx.insert(ajustes).values({ clave: "mostrar_botones_csv", valor: "true" });
    }
  });
}
