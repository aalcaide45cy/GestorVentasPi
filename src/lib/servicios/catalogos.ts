import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { ajustes, estadoVehiculo, expedientes, marcas, modelos, tiendas, tipoDeVenta } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { categoriaTipoVenta, claseEstado, idOpcional, textoOpcional } from "./comun";
import { estadoDto, marcaDto, modeloDto, tiendaDto, tipoVentaDto } from "./mapeos";

const nombre = z.string().trim().min(1, "El nombre es requerido").max(255);
const idPositivo = z.coerce.number().int().positive("Falta el identificador");
const CATEGORIAS = ["CONTADO", "CREDITO", "PREFERENCE", "RENTING"] as const;
const CLASES = ["VN", "VO"] as const;
const color = z.string().trim().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, "Color no válido (usa #RRGGBB o #RRGGBBAA)");

export const esquemaCrearCatalogo = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("marca"),
    nombre,
    acceso_rapido: z.boolean().optional(),
    sistema_comisiones: z.boolean().optional(),
    color: color.nullish(),
    punto: z.string().trim().max(8).nullish(),
    punto_color: color.nullish(),
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
    requiere_rci_al_matricular: z.boolean().optional(),
    cuenta_para_tasa: z.boolean().optional(),
  }),
  z.object({
    tipo: z.literal("estado_vehiculo"),
    nombre_estado_vehiculo: nombre,
    predeterminado: z.boolean().optional(),
    clase: z.enum(CLASES).optional(),
    subtipo_vo: textoOpcional(30).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color no válido").nullish(),
    capsula_color: color.nullish(),
    punto: z.string().trim().max(8).nullish(),
    punto_color: color.nullish(),
    prevalece: z.enum(["marca", "estado"]).optional(),
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
    color: color.nullish(),
    punto: z.string().trim().max(8).nullish(),
    punto_color: color.nullish(),
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
    requiere_rci_al_matricular: z.boolean().optional(),
    cuenta_para_tasa: z.boolean().optional(),
  }),
  z.object({
    tipo: z.literal("estado_vehiculo"),
    id: idPositivo,
    nombre_estado_vehiculo: nombre,
    predeterminado: z.boolean().optional(),
    clase: z.enum(CLASES).optional(),
    subtipo_vo: textoOpcional(30).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color no válido").nullish(),
    capsula_color: color.nullish(),
    punto: z.string().trim().max(8).nullish(),
    punto_color: color.nullish(),
    prevalece: z.enum(["marca", "estado"]).optional(),
  }),
]);
export type EntradaActualizarCatalogo = z.infer<typeof esquemaActualizarCatalogo>;

export const esquemaEliminarCatalogo = z.object({
  tipo: z.enum(["marca", "modelo", "tipo_venta", "estado_vehiculo"]),
  id: idPositivo,
  toggleActivo: z.boolean().optional(),
  activo: z.boolean().optional(),
  /** Solo modelos con expedientes: a qué modelo existente pasan. */
  reasignar_a: idPositivo.optional(),
  /** Solo modelos con expedientes: crear un modelo nuevo (en esta marca) y pasarlos a él. */
  crear_modelo: z.object({ marca_id: idPositivo, nombre: z.string().trim().min(1, "Escribe el nombre del modelo nuevo").max(255) }).optional(),
  /** Solo modelos con expedientes: dejarlos sin modelo. */
  sin_modelo: z.boolean().optional(),
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

/**
 * Con `enTransaccion` las consultas van una detrás de otra: una transacción usa una sola conexión y lanzarle varias a la vez hace que `pg` avise
 * («Calling client.query() when the client is already executing a query») y, en versiones futuras, falle.
 */
export async function leerCatalogos(ej: Ejecutor, enTransaccion = false) {
  const consultas = [
    () => ej.select().from(marcas).where(isNull(marcas.eliminadoEn)).orderBy(asc(marcas.nombre)),
    () => ej.select().from(modelos).where(isNull(modelos.eliminadoEn)).orderBy(asc(modelos.nombreModelo)),
    () => ej.select().from(tipoDeVenta).where(isNull(tipoDeVenta.eliminadoEn)).orderBy(asc(tipoDeVenta.orden), asc(tipoDeVenta.nombreTipoVenta)),
    () => ej.select().from(estadoVehiculo).where(isNull(estadoVehiculo.eliminadoEn)).orderBy(asc(estadoVehiculo.nombreEstadoVehiculo)),
    () => ej.select().from(tiendas).where(isNull(tiendas.eliminadoEn)).orderBy(asc(tiendas.nombre)),
  ] as const;
  const [ms, mos, tvs, evs, ts] = enTransaccion ? [await consultas[0](), await consultas[1](), await consultas[2](), await consultas[3](), await consultas[4]()] as const : await Promise.all([consultas[0](), consultas[1](), consultas[2](), consultas[3](), consultas[4]()]);
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
        .values({ nombre: e.nombre, activo: true, accesoRapido: !!e.acceso_rapido, sistemaComisiones: !!e.sistema_comisiones, color: e.color ?? null, punto: e.punto || null, puntoColor: e.punto_color ?? null })
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
          categoria: e.categoria ?? categoriaTipoVenta(e.nombre_tipo_venta),
          requiereRciAlMatricular: e.requiere_rci_al_matricular ?? ["CREDITO", "PREFERENCE", "RENTING"].includes(e.categoria ?? categoriaTipoVenta(e.nombre_tipo_venta)),
          cuentaParaTasa: e.cuenta_para_tasa ?? ["CREDITO", "PREFERENCE", "RENTING"].includes(e.categoria ?? categoriaTipoVenta(e.nombre_tipo_venta)),
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
            clase: e.clase ?? claseEstado(e.nombre_estado_vehiculo).clase,
            subtipoVo: e.clase === "VN" ? null : (e.subtipo_vo ?? (e.clase ? "USADO" : claseEstado(e.nombre_estado_vehiculo).subtipo)),
            color: e.color ?? null,
            capsulaColor: e.capsula_color ?? null,
            punto: e.punto || null,
            puntoColor: e.punto_color ?? null,
            prevalece: e.prevalece ?? "marca",
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
          color: e.color,
          punto: e.punto === undefined ? undefined : e.punto || null,
          puntoColor: e.punto_color,
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
        .set({ nombreTipoVenta: e.nombre_tipo_venta, color: e.color, orden: e.orden, categoria: e.categoria ?? categoriaTipoVenta(e.nombre_tipo_venta), requiereRciAlMatricular: e.requiere_rci_al_matricular, cuentaParaTasa: e.cuenta_para_tasa })
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
            clase: e.clase ?? claseEstado(e.nombre_estado_vehiculo).clase,
            subtipoVo: e.clase === "VN" ? null : (e.subtipo_vo ?? (e.clase ? "USADO" : claseEstado(e.nombre_estado_vehiculo).subtipo)),
            color: e.color,
            capsulaColor: e.capsula_color,
            punto: e.punto === undefined ? undefined : e.punto || null,
            puntoColor: e.punto_color,
            prevalece: e.prevalece,
          })
          .where(eq(estadoVehiculo.idEstadoVehiculo, e.id))
          .returning();
        if (!n) throw new HttpError(404, "Estado no encontrado");
        return estadoDto(n);
      });
  }
}

/** Expedientes (también los eliminados, que siguen apuntando al modelo) que usan un modelo. */
export async function usosDeModelo(ej: Ejecutor, idModelo: number): Promise<number> {
  const [{ n }] = await ej.select({ n: count() }).from(expedientes).where(eq(expedientes.idModelo, idModelo));
  return n;
}

/** Expedientes (también los eliminados) que usan algún modelo de una marca, con el desglose por modelo. */
export async function usosDeMarca(ej: Ejecutor, idMarca: number): Promise<{ expedientes: number; modelos: { id: number; nombre: string; usos: number }[] }> {
  const filas = await ej
    .select({ id: modelos.idModelo, nombre: modelos.nombreModelo, usos: count(expedientes.idExpediente) })
    .from(modelos)
    .leftJoin(expedientes, eq(expedientes.idModelo, modelos.idModelo))
    .where(and(eq(modelos.marcaId, idMarca), isNull(modelos.eliminadoEn)))
    .groupBy(modelos.idModelo, modelos.nombreModelo);
  const conUsos = filas.filter((f) => f.usos > 0).sort((a, b) => b.usos - a.usos);
  return { expedientes: conUsos.reduce((s, f) => s + f.usos, 0), modelos: conUsos };
}

/**
 * Borrado lógico: la fila se conserva (con `eliminado_en`) y desaparece de los selectores y listados de catálogo,
 * pero los expedientes que la usan siguen apuntando a ella (nombre, estadísticas e histórico intactos).
 */
export async function eliminarCatalogo(ej: Ejecutor, e: EntradaEliminarCatalogo): Promise<string> {
  const ahora = new Date();
  // Las marcas y los modelos (con sus colores) están grabados a fuego: no se pueden borrar nunca; una marca sí se puede desactivar
  if (e.tipo === "marca" && !e.toggleActivo) {
    throw new HttpError(403, "Las marcas y los modelos están grabados a fuego y no se pueden borrar. Si no quieres usar una marca, desactívala.");
  }
  switch (e.tipo) {
    case "marca": {
      if (e.toggleActivo) {
        await ej.update(marcas).set({ activo: !!e.activo }).where(eq(marcas.idMarca, e.id));
        return "Estado de la marca actualizado";
      }
      // Una marca con expedientes no se borra de golpe: primero hay que decidir a qué modelo pasa cada grupo (eliminando sus modelos uno a uno)
      const usosMarca = await usosDeMarca(ej, e.id);
      if (usosMarca.expedientes > 0) {
        throw new HttpError(409, `La marca tiene ${usosMarca.expedientes} expediente${usosMarca.expedientes === 1 ? "" : "s"} (${usosMarca.modelos.map((m) => `${m.nombre}: ${m.usos}`).join(", ")}). Elimina antes esos modelos y elige a cuál pasan sus expedientes.`);
      }
      await ej.transaction(async (tx) => {
        await tx.update(modelos).set({ eliminadoEn: ahora }).where(and(eq(modelos.marcaId, e.id), isNull(modelos.eliminadoEn)));
        await tx.update(marcas).set({ eliminadoEn: ahora }).where(eq(marcas.idMarca, e.id));
      });
      return "Marca eliminada";
    }
    case "tipo_venta":
      await ej.update(tipoDeVenta).set({ eliminadoEn: ahora }).where(eq(tipoDeVenta.idTipoDeVenta, e.id));
      return "Tipo de venta eliminado";
    case "estado_vehiculo":
      await ej.update(estadoVehiculo).set({ eliminadoEn: ahora }).where(eq(estadoVehiculo.idEstadoVehiculo, e.id));
      return "Estado de vehículo eliminado";
    default:
      // Los modelos (con sus colores) están grabados a fuego
      throw new HttpError(403, "Los modelos están grabados a fuego y no se pueden borrar.");
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
  await ej.update(tiendas).set({ eliminadoEn: new Date() }).where(eq(tiendas.idTienda, idTienda));
}
