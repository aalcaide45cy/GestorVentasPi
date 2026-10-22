import { and, eq, isNull, notIlike, or } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { clientes, estadoVehiculo, expedientes, marcas, modelos, tipoDeVenta, usuarios } from "@/db/schema";

/**
 * Detector de expedientes duplicados: mira todos los expedientes (sin los eliminados) y agrupa los que comparten algo que no debería repetirse.
 * Una ficha puede salir en varios grupos (por ejemplo, mismo bastidor y misma matrícula).
 */
export type MotivoDuplicado = "bastidor" | "matricula" | "pedido" | "cliente_modelo";

export const TEXTO_MOTIVO: Record<MotivoDuplicado, string> = {
  bastidor: "Mismo bastidor",
  matricula: "Misma matrícula",
  pedido: "Mismo cliente, modelo y fecha de pedido",
  cliente_modelo: "Mismo cliente y modelo (distinta fecha)",
};

export interface FilaDuplicado {
  id: number;
  cliente: string | null;
  dni: string | null;
  marca: string | null;
  modelo: string | null;
  matricula: string | null;
  vin: string | null;
  fechaPedido: string | null;
  pago: string | null;
  estado: string | null;
  vendedor: string | null;
  /** Si es una copia hecha a propósito con «Duplicar» (y de cuál). */
  copiaDe: number | null;
  deshabilitado: boolean;
}

export interface GrupoDuplicado {
  /** Número del grupo (1, 2, 3…) para verlos juntos en la tabla. */
  grupo: number;
  motivo: MotivoDuplicado;
  /** Lo que comparten (el bastidor, la matrícula…). */
  clave: string;
  filas: FilaDuplicado[];
}

export interface ResultadoDuplicados {
  grupos: GrupoDuplicado[];
  /** Cuántos expedientes distintos están en algún grupo. */
  expedientes: number;
  /** Cuántos expedientes se han mirado en total. */
  revisados: number;
}

const normalizar = (t: string | null) => (t ?? "").replace(/[\s-]/g, "").toUpperCase();
const SIN_DATO = new Set(["", "ND", "N/D", "NA", "N/A", "XXXX", "0"]);

/**
 * Con `incluirAnulados` también se miran los anulados en el listado de la intranet. Por defecto no: un pedido anulado y el mismo pedido hecho de nuevo
 * es lo normal, no un descuido.
 */
export async function detectarDuplicados(ej: Ejecutor, opciones: { incluirAnulados?: boolean } = {}): Promise<ResultadoDuplicados> {
  const filas = await ej
    .select({
      id: expedientes.idExpediente,
      idCliente: expedientes.idCliente,
      cliente: clientes.nombre,
      dni: clientes.dni,
      idModelo: expedientes.idModelo,
      modelo: modelos.nombreModelo,
      marca: marcas.nombre,
      matricula: expedientes.matricula,
      vin: expedientes.vin,
      fechaPedido: expedientes.fechaExpediente,
      pago: tipoDeVenta.nombreTipoVenta,
      estado: estadoVehiculo.nombreEstadoVehiculo,
      vendedor: usuarios.nombre,
      copiaDe: expedientes.copiaDe,
      deshabilitado: expedientes.deshabilitado,
    })
    .from(expedientes)
    .leftJoin(clientes, eq(clientes.id, expedientes.idCliente))
    .leftJoin(modelos, eq(modelos.idModelo, expedientes.idModelo))
    .leftJoin(marcas, eq(marcas.idMarca, modelos.marcaId))
    .leftJoin(tipoDeVenta, eq(tipoDeVenta.idTipoDeVenta, expedientes.idTipoDeVenta))
    .leftJoin(estadoVehiculo, eq(estadoVehiculo.idEstadoVehiculo, expedientes.idEstadoVehiculo))
    .leftJoin(usuarios, eq(usuarios.idUsuario, expedientes.idUsuario))
    .where(and(isNull(expedientes.eliminadoEn), opciones.incluirAnulados ? undefined : or(isNull(expedientes.estadoIntranet), notIlike(expedientes.estadoIntranet, "%anulad%"))));

  const agrupar = (clave: (f: (typeof filas)[number]) => string | null) => {
    const m = new Map<string, typeof filas>();
    for (const f of filas) {
      const k = clave(f);
      if (k === null) continue;
      (m.get(k) ?? m.set(k, []).get(k)!).push(f);
    }
    return [...m.entries()].filter(([, v]) => v.length > 1);
  };
  const definiciones: { motivo: MotivoDuplicado; claves: [string, typeof filas][] }[] = [
    { motivo: "bastidor", claves: agrupar((f) => (SIN_DATO.has(normalizar(f.vin)) ? null : normalizar(f.vin))) },
    { motivo: "matricula", claves: agrupar((f) => (SIN_DATO.has(normalizar(f.matricula)) ? null : normalizar(f.matricula))) },
    { motivo: "pedido", claves: agrupar((f) => (f.idCliente && f.idModelo && f.fechaPedido ? `${f.idCliente}|${f.idModelo}|${f.fechaPedido}` : null)) },
  ];
  // «Mismo cliente y modelo» en fechas distintas: solo los que no están ya en un grupo «pedido» entero (si no, saldría repetido)
  const mismoPedido = new Set(definiciones[2].claves.flatMap(([, v]) => v.map((f) => f.id)));
  definiciones.push({
    motivo: "cliente_modelo",
    claves: agrupar((f) => (f.idCliente && f.idModelo ? `${f.idCliente}|${f.idModelo}` : null))
      .map(([k, v]): [string, typeof filas] => [k, v])
      .filter(([, v]) => new Set(v.map((f) => f.fechaPedido ?? "")).size > 1 && !v.every((f) => mismoPedido.has(f.id))),
  });

  const grupos: GrupoDuplicado[] = [];
  const vistos = new Set<number>();
  for (const d of definiciones) {
    for (const [clave, v] of d.claves) {
      // Copias hechas a propósito con «Duplicar» entre sí (o con su original): no son un descuido
      const intencionadas = v.every((f) => f.copiaDe !== null || v.some((o) => o.copiaDe === f.id));
      if (intencionadas) continue;
      grupos.push({
        grupo: grupos.length + 1,
        motivo: d.motivo,
        clave: d.motivo === "bastidor" || d.motivo === "matricula" ? clave : `${v[0].cliente ?? "—"} · ${[v[0].marca, v[0].modelo].filter(Boolean).join(" ")}${d.motivo === "pedido" ? ` · ${v[0].fechaPedido}` : ""}`,
        filas: v
          .map((f) => ({ id: f.id, cliente: f.cliente, dni: f.dni, marca: f.marca, modelo: f.modelo, matricula: f.matricula, vin: f.vin, fechaPedido: f.fechaPedido, pago: f.pago, estado: f.estado, vendedor: f.vendedor, copiaDe: f.copiaDe, deshabilitado: f.deshabilitado }))
          .sort((a, b) => a.id - b.id),
      });
      for (const f of v) vistos.add(f.id);
    }
  }
  return { grupos, expedientes: vistos.size, revisados: filas.length };
}
