import { desc } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { clientes, expedientes } from "@/db/schema";
import type { ExpedienteDto } from "@/lib/dto";
import { aDto, leerFila, relacionesExpediente } from "./expedientes";

export async function obtenerExpediente(ej: Ejecutor, id: number): Promise<ExpedienteDto | null> {
  const e = await leerFila(ej, id);
  return e ? aDto(e) : null;
}

export async function listarExpedientes(ej: Ejecutor, opciones: { limite?: number } = {}): Promise<ExpedienteDto[]> {
  const filas = await ej.query.expedientes.findMany({
    orderBy: [desc(expedientes.idExpediente)],
    with: relacionesExpediente,
    limit: opciones.limite,
  });
  return filas.map(aDto);
}

/** Expedientes de un cliente (para el modal «Expedientes de …»). */
export async function expedientesDeCliente(ej: Ejecutor, idCliente: number): Promise<ExpedienteDto[]> {
  const filas = await ej.query.expedientes.findMany({
    where: eq(expedientes.idCliente, idCliente),
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
  const [{ total }] = await ej.select({ total: sql<number>`count(*)::int` }).from(expedientes);
  const [{ mes }] = await ej
    .select({ mes: sql<number>`count(*)::int` })
    .from(expedientes)
    .where(
      sql`date_trunc('month', ${expedientes.fechaExpediente}) = date_trunc('month', (now() at time zone 'Europe/Madrid')::date)`,
    );
  const [{ nClientes }] = await ej.select({ nClientes: sql<number>`count(*)::int` }).from(clientes);
  const tipos = await ej.query.tipoDeVenta.findMany({
    orderBy: (t, { asc }) => [asc(t.orden), asc(t.nombreTipoVenta)],
  });
  const cuentas = await ej
    .select({ id: expedientes.idTipoDeVenta, n: sql<number>`count(*)::int` })
    .from(expedientes)
    .where(sql`${expedientes.idTipoDeVenta} is not null`)
    .groupBy(expedientes.idTipoDeVenta);
  const mapa = new Map(cuentas.map((c) => [c.id, c.n]));
  return {
    mesActual: mes,
    total,
    clientes: nClientes,
    porTipoVenta: tipos.map((t) => ({ nombre: t.nombreTipoVenta, cantidad: mapa.get(t.idTipoDeVenta) ?? 0 })),
  };
}
