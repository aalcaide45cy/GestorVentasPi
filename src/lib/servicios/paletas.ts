import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { estadoVehiculo, marcas, plantillasColores, tipoDeVenta } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { clavePaleta, normalizarPaleta, PALETA_POR_DEFECTO, totalPaleta, type DatosPaleta } from "@/lib/paletas-colores";
import { archivarElementos } from "./papelera-elementos";

/** Paletas de colores guardadas y su aplicación a los tipos de venta, marcas y estados (se buscan por nombre, sin acentos ni mayúsculas). */

export interface PaletaDto {
  id: number;
  nombre: string;
  descripcion: string | null;
  elementos: number;
  actualizadaEn: string;
}

/** Los colores que hay ahora mismo en la aplicación, como paleta. */
export async function coloresActuales(ej: Ejecutor): Promise<DatosPaleta> {
  const [tipos, ms, es] = await Promise.all([
    ej.select().from(tipoDeVenta).where(isNull(tipoDeVenta.eliminadoEn)).orderBy(asc(tipoDeVenta.orden)),
    ej.select().from(marcas).where(isNull(marcas.eliminadoEn)).orderBy(asc(marcas.nombre)),
    ej.select().from(estadoVehiculo).where(isNull(estadoVehiculo.eliminadoEn)).orderBy(asc(estadoVehiculo.idEstadoVehiculo)),
  ]);
  return {
    tiposVenta: tipos.map((t) => ({ nombre: t.nombreTipoVenta, color: t.color })),
    marcas: ms.filter((m) => m.color || m.punto || m.puntoColor).map((m) => ({ nombre: m.nombre, color: m.color, punto: m.punto, puntoColor: m.puntoColor })),
    estados: es
      .filter((e) => e.color || e.capsulaColor || e.punto || e.puntoColor || e.prevalece !== "marca")
      .map((e) => ({ nombre: e.nombreEstadoVehiculo, color: e.color, capsulaColor: e.capsulaColor, punto: e.punto, puntoColor: e.puntoColor, prevalece: e.prevalece === "estado" ? ("estado" as const) : ("marca" as const) })),
  };
}

export interface ResultadoAplicar {
  tiposVenta: number;
  marcas: number;
  estados: number;
  /** Nombres de la paleta que no existen en esta instalación (se ignoran). */
  sinCoincidencia: string[];
}

/**
 * Pone los colores de una paleta. Solo se tocan los elementos que tienen el mismo nombre; con `limpiarResto` (la paleta por defecto) las marcas y
 * estados que la paleta no nombra se quedan sin color.
 */
export async function aplicarPaleta(ej: Ejecutor, datos: DatosPaleta, opciones: { limpiarResto?: boolean } = {}): Promise<ResultadoAplicar> {
  return ej.transaction(async (tx) => {
    const r: ResultadoAplicar = { tiposVenta: 0, marcas: 0, estados: 0, sinCoincidencia: [] };
    const tipos = await tx.select().from(tipoDeVenta).where(isNull(tipoDeVenta.eliminadoEn));
    for (const t of datos.tiposVenta) {
      const fila = tipos.find((x) => clavePaleta(x.nombreTipoVenta) === clavePaleta(t.nombre));
      if (!fila) {
        r.sinCoincidencia.push(`Pago «${t.nombre}»`);
        continue;
      }
      if (t.color) {
        await tx.update(tipoDeVenta).set({ color: t.color }).where(eq(tipoDeVenta.idTipoDeVenta, fila.idTipoDeVenta));
        r.tiposVenta++;
      }
    }
    const ms = await tx.select().from(marcas).where(isNull(marcas.eliminadoEn));
    const nombradasM = new Set<number>();
    for (const m of datos.marcas) {
      const fila = ms.find((x) => clavePaleta(x.nombre) === clavePaleta(m.nombre));
      if (!fila) {
        r.sinCoincidencia.push(`Marca «${m.nombre}»`);
        continue;
      }
      nombradasM.add(fila.idMarca);
      await tx.update(marcas).set({ color: m.color, punto: m.punto, puntoColor: m.puntoColor }).where(eq(marcas.idMarca, fila.idMarca));
      r.marcas++;
    }
    if (opciones.limpiarResto) {
      for (const fila of ms.filter((x) => !nombradasM.has(x.idMarca) && (x.color || x.punto || x.puntoColor))) {
        await tx.update(marcas).set({ color: null, punto: null, puntoColor: null }).where(eq(marcas.idMarca, fila.idMarca));
        r.marcas++;
      }
    }
    const es = await tx.select().from(estadoVehiculo).where(isNull(estadoVehiculo.eliminadoEn));
    const nombradosE = new Set<number>();
    for (const e of datos.estados) {
      const fila = es.find((x) => clavePaleta(x.nombreEstadoVehiculo) === clavePaleta(e.nombre));
      if (!fila) {
        r.sinCoincidencia.push(`Estado «${e.nombre}»`);
        continue;
      }
      nombradosE.add(fila.idEstadoVehiculo);
      // El color de la etiqueta del estado solo admite #RRGGBB (7 caracteres)
      await tx
        .update(estadoVehiculo)
        .set({ color: e.color && e.color.length === 7 ? e.color : null, capsulaColor: e.capsulaColor, punto: e.punto, puntoColor: e.puntoColor, prevalece: e.prevalece ?? "marca" })
        .where(eq(estadoVehiculo.idEstadoVehiculo, fila.idEstadoVehiculo));
      r.estados++;
    }
    if (opciones.limpiarResto) {
      for (const fila of es.filter((x) => !nombradosE.has(x.idEstadoVehiculo) && (x.color || x.capsulaColor || x.punto || x.puntoColor || x.prevalece !== "marca"))) {
        await tx.update(estadoVehiculo).set({ color: null, capsulaColor: null, punto: null, puntoColor: null, prevalece: "marca" }).where(eq(estadoVehiculo.idEstadoVehiculo, fila.idEstadoVehiculo));
        r.estados++;
      }
    }
    return r;
  });
}

export const aplicarPaletaPorDefecto = (ej: Ejecutor) => aplicarPaleta(ej, PALETA_POR_DEFECTO, { limpiarResto: true });

export async function listarPaletas(ej: Ejecutor): Promise<PaletaDto[]> {
  const filas = await ej.select().from(plantillasColores).orderBy(asc(plantillasColores.nombre));
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, descripcion: f.descripcion, elementos: totalPaleta(normalizarPaleta(f.datos).datos), actualizadaEn: f.actualizadaEn.toISOString() }));
}

export async function leerPaleta(ej: Ejecutor, id: number): Promise<{ meta: PaletaDto; datos: DatosPaleta } | null> {
  const [f] = await ej.select().from(plantillasColores).where(eq(plantillasColores.id, id));
  if (!f) return null;
  const datos = normalizarPaleta(f.datos).datos;
  return { meta: { id: f.id, nombre: f.nombre, descripcion: f.descripcion, elementos: totalPaleta(datos), actualizadaEn: f.actualizadaEn.toISOString() }, datos };
}

/** Guarda una paleta nueva; con el mismo nombre de otra, la sustituye si `sustituir` es true y, si no, da error 409. */
export async function guardarPaleta(ej: Ejecutor, e: { nombre: string; descripcion?: string | null; datos: DatosPaleta; sustituir?: boolean }): Promise<PaletaDto> {
  const nombre = e.nombre.trim().slice(0, 120);
  if (!nombre) throw new HttpError(400, "Pon un nombre a la paleta.");
  if (totalPaleta(e.datos) === 0) throw new HttpError(400, "No hay ningún color que guardar.");
  const [ya] = await ej.select().from(plantillasColores).where(eq(plantillasColores.nombre, nombre));
  if (ya && !e.sustituir) throw new HttpError(409, `Ya hay una paleta que se llama «${nombre}».`);
  const valores = { nombre, descripcion: e.descripcion?.trim().slice(0, 500) || null, datos: e.datos, actualizadaEn: new Date() };
  const [fila] = ya ? await ej.update(plantillasColores).set(valores).where(eq(plantillasColores.id, ya.id)).returning() : await ej.insert(plantillasColores).values(valores).returning();
  return { id: fila.id, nombre: fila.nombre, descripcion: fila.descripcion, elementos: totalPaleta(e.datos), actualizadaEn: fila.actualizadaEn.toISOString() };
}

export async function renombrarPaleta(ej: Ejecutor, id: number, nombre: string, descripcion?: string | null): Promise<void> {
  const n = nombre.trim().slice(0, 120);
  if (!n) throw new HttpError(400, "El nombre no puede estar vacío.");
  const [otra] = await ej.select({ id: plantillasColores.id }).from(plantillasColores).where(and(eq(plantillasColores.nombre, n)));
  if (otra && otra.id !== id) throw new HttpError(409, `Ya hay una paleta que se llama «${n}».`);
  const filas = await ej.update(plantillasColores).set({ nombre: n, ...(descripcion !== undefined ? { descripcion: descripcion?.trim().slice(0, 500) || null } : {}), actualizadaEn: new Date() }).where(eq(plantillasColores.id, id)).returning({ id: plantillasColores.id });
  if (filas.length === 0) throw new HttpError(404, "Paleta no encontrada");
}

export async function eliminarPaleta(ej: Ejecutor, id: number): Promise<void> {
  await ej.transaction(async (tx) => {
    const [p] = await tx.select({ nombre: plantillasColores.nombre }).from(plantillasColores).where(eq(plantillasColores.id, id));
    if (!p) throw new HttpError(404, "Paleta no encontrada");
    await archivarElementos(tx, "paleta", sql`t.id = ${id}`, { etiqueta: `Paleta «${p.nombre}»`, detalle: "Eliminada" });
    await tx.delete(plantillasColores).where(eq(plantillasColores.id, id));
  });
}
