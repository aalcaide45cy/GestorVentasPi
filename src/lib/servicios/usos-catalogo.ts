import { asc, desc, eq, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { clientes, estadoVehiculo, expedientes, marcas, modelos, tipoDeVenta, usuarios } from "@/db/schema";

/** Cuántos expedientes usan cada marca y cada modelo: los vigentes y los que están en la Papelera (que siguen apuntando a ellos). */
export interface UsosCatalogo {
  marcas: Record<number, { activos: number; papelera: number }>;
  modelos: Record<number, { activos: number; papelera: number }>;
}

export async function contarUsosCatalogo(ej: Ejecutor): Promise<UsosCatalogo> {
  const filas = await ej
    .select({
      idModelo: modelos.idModelo,
      idMarca: modelos.marcaId,
      activos: sql<number>`count(*) filter (where ${expedientes.eliminadoEn} is null)::int`,
      papelera: sql<number>`count(*) filter (where ${expedientes.eliminadoEn} is not null)::int`,
    })
    .from(expedientes)
    .innerJoin(modelos, eq(modelos.idModelo, expedientes.idModelo))
    .groupBy(modelos.idModelo, modelos.marcaId);
  const r: UsosCatalogo = { marcas: {}, modelos: {} };
  for (const f of filas) {
    r.modelos[f.idModelo] = { activos: f.activos, papelera: f.papelera };
    if (f.idMarca !== null) {
      const m = (r.marcas[f.idMarca] ??= { activos: 0, papelera: 0 });
      m.activos += f.activos;
      m.papelera += f.papelera;
    }
  }
  return r;
}

export interface ExpedienteDeCatalogo {
  id: number;
  cliente: string | null;
  matricula: string | null;
  marca: string | null;
  modelo: string | null;
  tipoVenta: string | null;
  estado: string | null;
  vendedor: string | null;
  fechaPedido: string | null;
  /** Está en la Papelera. */
  eliminado: boolean;
}

/** Los expedientes (también los de la Papelera) que usan una marca o un modelo, los más recientes primero. Con un tope, para no cargar miles de filas. */
export async function expedientesDeCatalogo(ej: Ejecutor, filtro: { idMarca?: number; idModelo?: number }, limite = 500): Promise<{ total: number; filas: ExpedienteDeCatalogo[] }> {
  const donde = filtro.idModelo !== undefined ? eq(expedientes.idModelo, filtro.idModelo) : filtro.idMarca !== undefined ? eq(modelos.marcaId, filtro.idMarca) : sql`false`;
  const [{ total }] = await ej
    .select({ total: sql<number>`count(*)::int` })
    .from(expedientes)
    .innerJoin(modelos, eq(modelos.idModelo, expedientes.idModelo))
    .where(donde);
  const filas = await ej
    .select({
      id: expedientes.idExpediente,
      cliente: clientes.nombre,
      matricula: expedientes.matricula,
      marca: marcas.nombre,
      modelo: modelos.nombreModelo,
      tipoVenta: tipoDeVenta.nombreTipoVenta,
      estado: estadoVehiculo.nombreEstadoVehiculo,
      vendedor: usuarios.nombre,
      fechaPedido: expedientes.fechaExpediente,
      eliminadoEn: expedientes.eliminadoEn,
    })
    .from(expedientes)
    .innerJoin(modelos, eq(modelos.idModelo, expedientes.idModelo))
    .leftJoin(marcas, eq(marcas.idMarca, modelos.marcaId))
    .leftJoin(clientes, eq(clientes.id, expedientes.idCliente))
    .leftJoin(tipoDeVenta, eq(tipoDeVenta.idTipoDeVenta, expedientes.idTipoDeVenta))
    .leftJoin(estadoVehiculo, eq(estadoVehiculo.idEstadoVehiculo, expedientes.idEstadoVehiculo))
    .leftJoin(usuarios, eq(usuarios.idUsuario, expedientes.idUsuario))
    .where(donde)
    .orderBy(asc(sql`${expedientes.eliminadoEn} is not null`), desc(expedientes.fechaExpediente), desc(expedientes.idExpediente))
    .limit(limite);
  return { total, filas: filas.map(({ eliminadoEn, ...f }) => ({ ...f, eliminado: eliminadoEn !== null })) };
}

