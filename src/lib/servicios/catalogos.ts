import { asc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { ajustes, estadoVehiculo, expedientes, marcas, modelos, tiendas, tipoDeVenta } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { idOpcional, textoOpcional } from "./comun";
import { estadoDto, marcaDto, modeloDto, tiendaDto, tipoVentaDto } from "./mapeos";

const nombre = z.string().trim().min(1, "El nombre es requerido").max(255);
const idPositivo = z.coerce.number().int().positive("Falta el identificador");
const CATEGORIAS = ["CONTADO", "CREDITO", "PREFERENCE", "RENTING"] as const;
const CLASES = ["VN", "VO"] as const;
const color = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Color no válido (usa #RRGGBB)");

export const esquemaCrearCatalogo = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("marca"),
    nombre,
    acceso_rapido: z.boolean().optional(),
    sistema_comisiones: z.boolean().optional(),
  }),
  z.object({
    tipo: z.literal("modelo"),
    marca_id: idPositivo,
    nombre_modelo: nombre,
    acceso_rapido: z.boolean().optional(),
    orden_acceso_rapido: z.coerce.number().int().optional(),
  }),
  z.object({
    tipo: z.literal("tipo_venta"),
    nombre_tipo_venta: nombre,
    color: color.optional(),
    orden: z.coerce.number().int().optional(),
    categoria: z.enum(CATEGORIAS).optional(),
  }),
  z.object({
    tipo: z.literal("estado_vehiculo"),
    nombre_estado_vehiculo: nombre,
    predeterminado: z.boolean().optional(),
    clase: z.enum(CLASES).optional(),
    subtipo_vo: textoOpcional(30).optional(),
  }),
]);
export type EntradaCrearCatalogo = z.infer<typeof esquemaCrearCatalogo>;

export const esquemaActualizarCatalogo = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("marca"),
    id: idPositivo,
    nombre,
    acceso_rapido: z.boolean().optional(),
    sistema_comisiones: z.boolean().optional(),
  }),
  z.object({
    tipo: z.literal("modelo"),
    id: idPositivo,
    nombre_modelo: nombre,
    acceso_rapido: z.boolean().optional(),
    orden_acceso_rapido: z.coerce.number().int().optional(),
  }),
  z.object({
    tipo: z.literal("tipo_venta"),
    id: idPositivo,
    nombre_tipo_venta: nombre,
    color: color.optional(),
    orden: z.coerce.number().int().optional(),
    categoria: z.enum(CATEGORIAS).optional(),
  }),
  z.object({
    tipo: z.literal("estado_vehiculo"),
    id: idPositivo,
    nombre_estado_vehiculo: nombre,
    predeterminado: z.boolean().optional(),
    clase: z.enum(CLASES).optional(),
    subtipo_vo: textoOpcional(30).optional(),
  }),
]);
export type EntradaActualizarCatalogo = z.infer<typeof esquemaActualizarCatalogo>;

export const esquemaEliminarCatalogo = z.object({
  tipo: z.enum(["marca", "modelo", "tipo_venta", "estado_vehiculo"]),
  id: idPositivo,
  toggleActivo: z.boolean().optional(),
  activo: z.boolean().optional(),
});
export type EntradaEliminarCatalogo = z.infer<typeof esquemaEliminarCatalogo>;

export const esquemaTienda = z.object({
  id_tienda: idOpcional.optional(),
  nombre: z.string().trim().min(1, "El nombre de la tienda es obligatorio").max(255),
  ciudad: textoOpcional(255).optional(),
});

export const esquemaAjuste = z.object({
  clave: z.string().trim().min(1, "Falta la clave del ajuste").max(255),
  valor: z.union([z.string(), z.number(), z.boolean()]),
});

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

export async function leerCatalogos(ej: Ejecutor) {
  const [ms, mos, tvs, evs, ts] = await Promise.all([
    ej.select().from(marcas).orderBy(asc(marcas.nombre)),
    ej.select().from(modelos).orderBy(asc(modelos.nombreModelo)),
    ej.select().from(tipoDeVenta).orderBy(asc(tipoDeVenta.orden), asc(tipoDeVenta.nombreTipoVenta)),
    ej.select().from(estadoVehiculo).orderBy(asc(estadoVehiculo.nombreEstadoVehiculo)),
    ej.select().from(tiendas).orderBy(asc(tiendas.nombre)),
  ]);
  return {
    marcas: ms.map(marcaDto),
    modelos: mos.map((m) => modeloDto(m)),
    tiposVenta: tvs.map(tipoVentaDto),
    estados: evs.map(estadoDto),
    tiendas: ts.map(tiendaDto),
  };
}

export async function leerAjustes(ej: Ejecutor): Promise<Record<string, string>> {
  const filas = await ej.select().from(ajustes);
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
}

export async function guardarAjuste(ej: Ejecutor, clave: string, valor: string | number | boolean): Promise<void> {
  const v = String(valor);
  await ej.insert(ajustes).values({ clave, valor: v }).onConflictDoUpdate({ target: ajustes.clave, set: { valor: v } });
}

/* ------------------------------------------------------------------ */
/* Escritura (solo administrador)                                      */
/* ------------------------------------------------------------------ */

export async function crearCatalogo(ej: Ejecutor, e: EntradaCrearCatalogo): Promise<unknown> {
  switch (e.tipo) {
    case "marca": {
      const [n] = await ej
        .insert(marcas)
        .values({ nombre: e.nombre, activo: true, accesoRapido: !!e.acceso_rapido, sistemaComisiones: !!e.sistema_comisiones })
        .returning();
      return marcaDto(n);
    }
    case "modelo": {
      const [n] = await ej
        .insert(modelos)
        .values({
          marcaId: e.marca_id,
          nombreModelo: e.nombre_modelo,
          accesoRapido: !!e.acceso_rapido,
          ordenAccesoRapido: e.orden_acceso_rapido ?? 0,
        })
        .returning();
      return modeloDto(n);
    }
    case "tipo_venta": {
      const [n] = await ej
        .insert(tipoDeVenta)
        .values({
          nombreTipoVenta: e.nombre_tipo_venta,
          color: e.color ?? "#3b82f6",
          orden: e.orden ?? 0,
          categoria: e.categoria ?? "CONTADO",
        })
        .returning();
      return tipoVentaDto(n);
    }
    case "estado_vehiculo":
      return ej.transaction(async (tx) => {
        if (e.predeterminado) await tx.update(estadoVehiculo).set({ predeterminado: false });
        const [n] = await tx
          .insert(estadoVehiculo)
          .values({
            nombreEstadoVehiculo: e.nombre_estado_vehiculo,
            predeterminado: !!e.predeterminado,
            clase: e.clase ?? "VN",
            subtipoVo: e.subtipo_vo ?? null,
          })
          .returning();
        return estadoDto(n);
      });
  }
}

export async function actualizarCatalogo(ej: Ejecutor, e: EntradaActualizarCatalogo): Promise<unknown> {
  switch (e.tipo) {
    case "marca": {
      const [n] = await ej
        .update(marcas)
        .set({
          nombre: e.nombre,
          accesoRapido: e.acceso_rapido,
          sistemaComisiones: e.sistema_comisiones,
        })
        .where(eq(marcas.idMarca, e.id))
        .returning();
      if (!n) throw new HttpError(404, "Marca no encontrada");
      return marcaDto(n);
    }
    case "modelo": {
      const [n] = await ej
        .update(modelos)
        .set({ nombreModelo: e.nombre_modelo, accesoRapido: e.acceso_rapido, ordenAccesoRapido: e.orden_acceso_rapido })
        .where(eq(modelos.idModelo, e.id))
        .returning();
      if (!n) throw new HttpError(404, "Modelo no encontrado");
      return modeloDto(n);
    }
    case "tipo_venta": {
      const [n] = await ej
        .update(tipoDeVenta)
        .set({ nombreTipoVenta: e.nombre_tipo_venta, color: e.color, orden: e.orden, categoria: e.categoria })
        .where(eq(tipoDeVenta.idTipoDeVenta, e.id))
        .returning();
      if (!n) throw new HttpError(404, "Tipo de venta no encontrado");
      return tipoVentaDto(n);
    }
    case "estado_vehiculo":
      return ej.transaction(async (tx) => {
        // Solo puede haber un estado predeterminado a la vez.
        if (e.predeterminado) {
          await tx.update(estadoVehiculo).set({ predeterminado: false }).where(ne(estadoVehiculo.idEstadoVehiculo, e.id));
        }
        const [n] = await tx
          .update(estadoVehiculo)
          .set({
            nombreEstadoVehiculo: e.nombre_estado_vehiculo,
            predeterminado: e.predeterminado,
            clase: e.clase,
            subtipoVo: e.subtipo_vo,
          })
          .where(eq(estadoVehiculo.idEstadoVehiculo, e.id))
          .returning();
        if (!n) throw new HttpError(404, "Estado no encontrado");
        return estadoDto(n);
      });
  }
}

async function haySiExpedientes(ej: Ejecutor, columna: typeof expedientes.idModelo | typeof expedientes.idTipoDeVenta | typeof expedientes.idEstadoVehiculo | typeof expedientes.idTienda, ids: number[]): Promise<boolean> {
  if (ids.length === 0) return false;
  const [f] = await ej.select({ id: expedientes.idExpediente }).from(expedientes).where(inArray(columna, ids)).limit(1);
  return !!f;
}

export async function eliminarCatalogo(ej: Ejecutor, e: EntradaEliminarCatalogo): Promise<string> {
  switch (e.tipo) {
    case "marca": {
      if (e.toggleActivo) {
        await ej.update(marcas).set({ activo: !!e.activo }).where(eq(marcas.idMarca, e.id));
        return "Estado de la marca actualizado";
      }
      const ms = await ej.select({ id: modelos.idModelo }).from(modelos).where(eq(modelos.marcaId, e.id));
      if (await haySiExpedientes(ej, expedientes.idModelo, ms.map((m) => m.id))) {
        throw new HttpError(409, "No se puede eliminar la marca porque tiene expedientes asociados.");
      }
      await ej.delete(marcas).where(eq(marcas.idMarca, e.id));
      return "Marca eliminada";
    }
    case "modelo":
      if (await haySiExpedientes(ej, expedientes.idModelo, [e.id])) {
        throw new HttpError(409, "No se puede eliminar el modelo porque tiene expedientes asociados.");
      }
      await ej.delete(modelos).where(eq(modelos.idModelo, e.id));
      return "Modelo eliminado";
    case "tipo_venta":
      if (await haySiExpedientes(ej, expedientes.idTipoDeVenta, [e.id])) {
        throw new HttpError(409, "No se puede eliminar el tipo de venta porque tiene expedientes asociados.");
      }
      await ej.delete(tipoDeVenta).where(eq(tipoDeVenta.idTipoDeVenta, e.id));
      return "Tipo de venta eliminado";
    case "estado_vehiculo":
      if (await haySiExpedientes(ej, expedientes.idEstadoVehiculo, [e.id])) {
        throw new HttpError(409, "No se puede eliminar el estado porque tiene expedientes asociados.");
      }
      await ej.delete(estadoVehiculo).where(eq(estadoVehiculo.idEstadoVehiculo, e.id));
      return "Estado de vehículo eliminado";
  }
}

export async function crearTienda(ej: Ejecutor, e: z.infer<typeof esquemaTienda>) {
  const [n] = await ej.insert(tiendas).values({ nombre: e.nombre, ciudad: e.ciudad ?? null }).returning();
  return tiendaDto(n);
}

export async function actualizarTienda(ej: Ejecutor, e: z.infer<typeof esquemaTienda>) {
  if (!e.id_tienda) throw new HttpError(400, "Faltan datos requeridos (id_tienda, nombre)");
  const [n] = await ej
    .update(tiendas)
    .set({ nombre: e.nombre, ciudad: e.ciudad ?? null })
    .where(eq(tiendas.idTienda, e.id_tienda))
    .returning();
  if (!n) throw new HttpError(404, "Tienda no encontrada");
  return tiendaDto(n);
}

export async function eliminarTienda(ej: Ejecutor, idTienda: number): Promise<void> {
  if (await haySiExpedientes(ej, expedientes.idTienda, [idTienda])) {
    throw new HttpError(409, "No se puede eliminar la tienda porque tiene expedientes de venta registrados.");
  }
  await ej.delete(tiendas).where(eq(tiendas.idTienda, idTienda));
}
