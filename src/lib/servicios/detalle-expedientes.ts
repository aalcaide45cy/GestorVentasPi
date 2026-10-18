import { inArray, eq } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { clientes, estadoVehiculo, expedientes, marcas, modelos } from "@/db/schema";

export interface DetalleExpediente {
  cliente: string;
  marca: string;
  modelo: string;
  estado: string;
  /** VN o VO. */
  clase: "VN" | "VO";
  matricula: string | null;
}

/** Datos para reconocer cada expediente en una tabla (cliente, marca, modelo, estado, VN/VO y matrícula). */
export async function detalleDeExpedientes(ej: Ejecutor, ids: number[]): Promise<Record<string, DetalleExpediente>> {
  const unicos = [...new Set(ids)].slice(0, 2000);
  if (unicos.length === 0) return {};
  const filas = await ej
    .select({ id: expedientes.idExpediente, cliente: clientes.nombre, marca: marcas.nombre, modelo: modelos.nombreModelo, estado: estadoVehiculo.nombreEstadoVehiculo, clase: estadoVehiculo.clase, matricula: expedientes.matricula })
    .from(expedientes)
    .leftJoin(clientes, eq(clientes.id, expedientes.idCliente))
    .leftJoin(modelos, eq(modelos.idModelo, expedientes.idModelo))
    .leftJoin(marcas, eq(marcas.idMarca, modelos.marcaId))
    .leftJoin(estadoVehiculo, eq(estadoVehiculo.idEstadoVehiculo, expedientes.idEstadoVehiculo))
    .where(inArray(expedientes.idExpediente, unicos));
  return Object.fromEntries(filas.map((f) => [String(f.id), { cliente: f.cliente?.trim() || "Sin cliente", marca: f.marca ?? "", modelo: f.modelo ?? "", estado: f.estado ?? "", clase: (f.clase === "VO" ? "VO" : "VN") as "VN" | "VO", matricula: f.matricula ?? null }]));
}
