import { asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { marcas, modelos, plantillasTarifasVn } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import type { DatosPlantillaTarifas } from "@/lib/plantillas-tarifas/generica";
import { archivarElementos } from "./papelera-elementos";

/**
 * Plantillas de «Tarifas de modelos VN por tramo». Guardan marcas y modelos por NOMBRE (no por número), así sirven para cualquier
 * plan y cualquier instalación. Los importes van en céntimos (50,00 € = 5000) y admiten decimales.
 */

const norm = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const tramo = z.string().regex(/^-?\d{1,2}$/, "tramo no válido");

export const esquemaDatosPlantilla = z.object({
  marcas: z.array(z.object({ nombre: z.string().trim().min(1).max(100), sistemaComisiones: z.boolean().default(true), accesoRapido: z.boolean().default(false) })).max(200).default([]),
  tarifas: z
    .array(
      z.object({
        marca: z.string().trim().min(1).max(100),
        modelo: z.string().trim().min(1).max(150),
        tasaCumplida: z.boolean(),
        importes: z.record(tramo, z.number().int().min(-100_000_000).max(100_000_000)),
        activo: z.boolean().default(true),
        orden: z.number().int().min(0).max(10_000).default(0),
      }),
    )
    .max(5000),
});

export const esquemaPlantilla = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre de la plantilla").max(120),
  descripcion: z.string().trim().max(500).nullish(),
  datos: esquemaDatosPlantilla,
});
export type EntradaPlantilla = z.infer<typeof esquemaPlantilla>;

export interface ResumenPlantilla {
  id: number;
  nombre: string;
  descripcion: string | null;
  sistema: boolean;
  marcas: string[];
  modelos: number;
  tarifas: number;
  actualizadaEn: string;
}

function resumir(f: typeof plantillasTarifasVn.$inferSelect): ResumenPlantilla {
  const d = esquemaDatosPlantilla.safeParse(f.datos);
  const datos = d.success ? d.data : { marcas: [], tarifas: [] };
  return {
    id: f.id,
    nombre: f.nombre,
    descripcion: f.descripcion,
    sistema: f.sistema,
    marcas: [...new Set(datos.tarifas.map((t) => t.marca))],
    modelos: new Set(datos.tarifas.map((t) => `${norm(t.marca)}|${norm(t.modelo)}`)).size,
    tarifas: datos.tarifas.length,
    actualizadaEn: f.actualizadaEn.toISOString(),
  };
}

export async function listarPlantillas(ej: Ejecutor): Promise<ResumenPlantilla[]> {
  const filas = await ej.select().from(plantillasTarifasVn).orderBy(asc(plantillasTarifasVn.sistema), asc(plantillasTarifasVn.nombre));
  // Las del sistema primero
  return filas.map(resumir).sort((a, b) => Number(b.sistema) - Number(a.sistema) || a.nombre.localeCompare(b.nombre, "es"));
}

export async function leerPlantilla(ej: Ejecutor, id: number): Promise<ResumenPlantilla & { datos: DatosPlantillaTarifas }> {
  const [f] = await ej.select().from(plantillasTarifasVn).where(eq(plantillasTarifasVn.id, id));
  if (!f) throw new HttpError(404, "La plantilla ya no existe.");
  const d = esquemaDatosPlantilla.safeParse(f.datos);
  if (!d.success) throw new HttpError(500, "La plantilla está dañada y no se puede leer.");
  return { ...resumir(f), datos: d.data };
}

async function comprobarNombreLibre(ej: Ejecutor, nombre: string, exceptoId?: number): Promise<void> {
  const filas = await ej.select({ id: plantillasTarifasVn.id, nombre: plantillasTarifasVn.nombre }).from(plantillasTarifasVn);
  if (filas.some((f) => f.id !== exceptoId && norm(f.nombre) === norm(nombre))) throw new HttpError(409, `Ya existe una plantilla llamada «${nombre}». Elige otro nombre.`);
}

export async function crearPlantilla(ej: Ejecutor, entrada: unknown): Promise<ResumenPlantilla> {
  const e = esquemaPlantilla.parse(entrada);
  if (e.datos.tarifas.length === 0) throw new HttpError(400, "La plantilla no tiene ninguna tarifa.");
  await comprobarNombreLibre(ej, e.nombre);
  const [f] = await ej.insert(plantillasTarifasVn).values({ nombre: e.nombre, descripcion: e.descripcion?.trim() || null, sistema: false, datos: e.datos }).returning();
  return resumir(f);
}

export async function actualizarPlantilla(ej: Ejecutor, id: number, entrada: unknown): Promise<ResumenPlantilla> {
  const e = esquemaPlantilla.parse(entrada);
  const [actual] = await ej.select().from(plantillasTarifasVn).where(eq(plantillasTarifasVn.id, id));
  if (!actual) throw new HttpError(404, "La plantilla ya no existe.");
  if (actual.sistema) throw new HttpError(403, "La plantilla incluida con la aplicación no se puede modificar: duplícala y cambia la copia.");
  await comprobarNombreLibre(ej, e.nombre, id);
  const [f] = await ej.update(plantillasTarifasVn).set({ nombre: e.nombre, descripcion: e.descripcion?.trim() || null, datos: e.datos, actualizadaEn: new Date() }).where(eq(plantillasTarifasVn.id, id)).returning();
  return resumir(f);
}

export async function borrarPlantilla(ej: Ejecutor, id: number): Promise<void> {
  const [actual] = await ej.select().from(plantillasTarifasVn).where(eq(plantillasTarifasVn.id, id));
  if (!actual) throw new HttpError(404, "La plantilla ya no existe.");
  if (actual.sistema) throw new HttpError(403, "La plantilla incluida con la aplicación no se puede borrar.");
  await ej.transaction(async (tx) => {
    await archivarElementos(tx, "plantilla_tarifas", sql`t.id = ${id}`, { etiqueta: `Plantilla de tarifas «${actual.nombre}»`, detalle: "Eliminada" });
    await tx.delete(plantillasTarifasVn).where(eq(plantillasTarifasVn.id, id));
  });
}

export async function duplicarPlantilla(ej: Ejecutor, id: number): Promise<ResumenPlantilla> {
  const origen = await leerPlantilla(ej, id);
  const existentes = (await ej.select({ nombre: plantillasTarifasVn.nombre }).from(plantillasTarifasVn)).map((f) => norm(f.nombre));
  let nombre = `Copia de ${origen.nombre}`;
  for (let i = 2; existentes.includes(norm(nombre)); i++) nombre = `Copia ${i} de ${origen.nombre}`;
  const [f] = await ej.insert(plantillasTarifasVn).values({ nombre, descripcion: origen.descripcion, sistema: false, datos: origen.datos }).returning();
  return resumir(f);
}

/* ------------------------------------------------------------------ */
/* Marcas y modelos que faltan                                          */
/* ------------------------------------------------------------------ */

export const esquemaCatalogoFaltante = z.object({
  marcas: z
    .array(z.object({ nombre: z.string().trim().min(1).max(100), sistemaComisiones: z.boolean().default(true), accesoRapido: z.boolean().default(false), modelos: z.array(z.string().trim().min(1).max(150)).max(500).default([]) }))
    .min(1, "No hay nada que crear")
    .max(200),
});

/** Crea las marcas y modelos indicados que todavía no existen (por nombre, sin distinguir mayúsculas ni acentos) y activa «Sist. Comisiones» en las marcas que ya existían sin él. Todo o nada. */
export async function crearCatalogoFaltante(ej: Ejecutor, entrada: unknown): Promise<{ marcasCreadas: number; marcasActivadas: number; modelosCreados: number; marcas: { id: number; nombre: string }[]; modelos: { id: number; nombre: string; marcaId: number | null }[] }> {
  const e = esquemaCatalogoFaltante.parse(entrada);
  return ej.transaction(async (tx) => {
    const ms = await tx.select().from(marcas).where(isNull(marcas.eliminadoEn));
    const mos = await tx.select().from(modelos).where(isNull(modelos.eliminadoEn));
    let marcasCreadas = 0;
    let marcasActivadas = 0;
    let modelosCreados = 0;
    for (const m of e.marcas) {
      let marca = ms.find((x) => norm(x.nombre) === norm(m.nombre));
      if (!marca) {
        // Una marca que viene de una plantilla de tarifas siempre participa en el sistema de comisiones
        const [n] = await tx.insert(marcas).values({ nombre: m.nombre, activo: true, accesoRapido: true, sistemaComisiones: true }).returning();
        marca = n;
        ms.push(n);
        marcasCreadas++;
      } else if (!marca.sistemaComisiones) {
        const [n] = await tx.update(marcas).set({ sistemaComisiones: true }).where(eq(marcas.idMarca, marca.idMarca)).returning();
        ms.splice(ms.indexOf(marca), 1, n);
        marca = n;
        marcasActivadas++;
      }
      const existentes = new Set(mos.filter((x) => x.marcaId === marca.idMarca).map((x) => norm(x.nombreModelo)));
      let siguiente = Math.max(0, ...mos.filter((x) => x.marcaId === marca.idMarca).map((x) => x.ordenAccesoRapido ?? 0)) + 1;
      for (const nombre of m.modelos) {
        if (existentes.has(norm(nombre))) continue;
        existentes.add(norm(nombre));
        const [n] = await tx.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: nombre, accesoRapido: true, ordenAccesoRapido: siguiente++ }).returning();
        mos.push(n);
        modelosCreados++;
      }
    }
    return {
      marcasCreadas,
      marcasActivadas,
      modelosCreados,
      marcas: ms.map((x) => ({ id: x.idMarca, nombre: x.nombre })),
      modelos: mos.map((x) => ({ id: x.idModelo, nombre: x.nombreModelo, marcaId: x.marcaId })),
    };
  });
}

