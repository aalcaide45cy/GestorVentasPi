import { desc } from "drizzle-orm";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { clientes, expedientes, tipoDeVenta } from "@/db/schema";
import type { ExpedienteDto } from "@/lib/dto";
import { aDto, leerFila, relacionesExpediente } from "./expedientes";

export async function obtenerExpediente(ej: Ejecutor, id: number): Promise<ExpedienteDto | null> {
  const e = await leerFila(ej, id);
  return e ? aDto(e) : null;
}

/**
 * Máximo de expedientes que se envían al navegador al abrir la lista (los más recientes). La lista filtra y pagina en el
 * cliente: con 100.000 expedientes serían ~130 MB de JSON, así que se recorta y se avisa en pantalla.
 */
export const LIMITE_LISTA_EXPEDIENTES = 5000;

export async function contarExpedientes(ej: Ejecutor): Promise<number> {
  const [{ n }] = await ej.select({ n: sql<number>`count(*)::int` }).from(expedientes).where(isNull(expedientes.eliminadoEn));
  return n;
}

export async function listarExpedientes(ej: Ejecutor, opciones: { limite?: number } = {}): Promise<ExpedienteDto[]> {
  const filas = await ej.query.expedientes.findMany({
    where: isNull(expedientes.eliminadoEn),
    orderBy: [desc(expedientes.idExpediente)],
    with: relacionesExpediente,
    limit: opciones.limite,
  });
  return filas.map(aDto);
}

/** Expedientes de un cliente (para el modal «Expedientes de …»). */
export async function expedientesDeCliente(ej: Ejecutor, idCliente: number): Promise<ExpedienteDto[]> {
  const filas = await ej.query.expedientes.findMany({
    where: and(eq(expedientes.idCliente, idCliente), isNull(expedientes.eliminadoEn)),
    orderBy: [desc(expedientes.idExpediente)],
    with: relacionesExpediente,
  });
  return filas.map(aDto);
}

/** Conteos del panel principal sin cargar la tabla completa. */
export async function resumenPanel(ej: Ejecutor): Promise<{
  mesActual: number;
  total: number;
  clientes: number;
  porTipoVenta: { nombre: string; cantidad: number }[];
}> {
  // Un solo recorrido (solo de índice) da el total y el reparto por tipo de venta; el mes se acota por rango de fechas
  // para poder usar el índice de la fecha (con date_trunc sobre la columna recorría todos los expedientes).
  const cuentas = await ej
    .select({ id: expedientes.idTipoDeVenta, n: sql<number>`count(*)::int` })
    .from(expedientes)
    .where(isNull(expedientes.eliminadoEn))
    .groupBy(expedientes.idTipoDeVenta);
  const total = cuentas.reduce((suma, c) => suma + c.n, 0);
  const [{ mes }] = await ej
    .select({ mes: sql<number>`count(*)::int` })
    .from(expedientes)
    .where(
      and(
        isNull(expedientes.eliminadoEn),
        sql`${expedientes.fechaExpediente} >= date_trunc('month', now() at time zone 'Europe/Madrid')::date`,
        sql`${expedientes.fechaExpediente} < (date_trunc('month', now() at time zone 'Europe/Madrid') + interval '1 month')::date`,
      ),
    );
  const [{ nClientes }] = await ej.select({ nClientes: sql<number>`count(*)::int` }).from(clientes).where(isNull(clientes.eliminadoEn));
  const tipos = await ej.query.tipoDeVenta.findMany({
    where: isNull(tipoDeVenta.eliminadoEn),
    orderBy: (t, { asc }) => [asc(t.orden), asc(t.nombreTipoVenta)],
  });
  const mapa = new Map(cuentas.flatMap((c) => (c.id === null ? [] : [[c.id, c.n] as const])));
  return {
    mesActual: mes,
    total,
    clientes: nClientes,
    porTipoVenta: tipos.map((t) => ({ nombre: t.nombreTipoVenta, cantidad: mapa.get(t.idTipoDeVenta) ?? 0 })),
  };
}
