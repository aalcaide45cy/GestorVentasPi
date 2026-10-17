import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { plantillasPlan } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { esquemaFragmento } from "@/lib/plantillas-plan/esquema-fragmento";
import { AMBITOS, COMPONENTES, COMPONENTES_AMBITO, contarComponente, type Ambito, type Componente, type Fragmento } from "@/lib/plantillas-plan/fragmentos";

/** Plantillas de partes de un plan de comisionamiento (por pestaña y del plan entero). Ver `lib/plantillas-plan/fragmentos.ts`. */

const norm = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export const esquemaPlantillaPlan = z.object({
  ambito: z.enum(AMBITOS),
  nombre: z.string().trim().min(1, "Falta el nombre de la plantilla").max(120),
  descripcion: z.string().trim().max(500).nullish(),
  datos: esquemaFragmento,
});
export type EntradaPlantillaPlan = z.infer<typeof esquemaPlantillaPlan>;

export interface PlantillaPlanDto {
  id: number;
  ambito: Ambito;
  nombre: string;
  descripcion: string | null;
  actualizadaEn: string;
  /** Elementos de cada parte que contiene. */
  contenido: { componente: Componente; elementos: number }[];
  datos: Fragmento;
}

function aDto(f: typeof plantillasPlan.$inferSelect): PlantillaPlanDto {
  const d = esquemaFragmento.safeParse(f.datos);
  const datos: Fragmento = d.success ? d.data : {};
  return {
    id: f.id,
    ambito: AMBITOS.includes(f.ambito as Ambito) ? (f.ambito as Ambito) : "global",
    nombre: f.nombre,
    descripcion: f.descripcion,
    actualizadaEn: f.actualizadaEn.toISOString(),
    contenido: COMPONENTES.filter((c) => contarComponente(datos, c) > 0 || (c === "notas" && datos.notas !== undefined)).map((c) => ({ componente: c, elementos: contarComponente(datos, c) })),
    datos,
  };
}

/** Quita del fragmento lo que no corresponde al ámbito (una plantilla de «Bonus» solo guarda bonus). */
function limpiarPorAmbito(ambito: Ambito, datos: Fragmento): Fragmento {
  const permitidos = new Set<Componente>(COMPONENTES_AMBITO[ambito]);
  return Object.fromEntries(Object.entries(datos).filter(([k]) => permitidos.has(k as Componente))) as Fragmento;
}

function comprobarContenido(datos: Fragmento): void {
  if (!COMPONENTES.some((c) => contarComponente(datos, c) > 0 || (c === "notas" && datos.notas !== undefined))) throw new HttpError(400, "La plantilla no tiene nada que guardar.");
}

async function comprobarNombreLibre(ej: Ejecutor, ambito: Ambito, nombre: string, exceptoId?: number): Promise<void> {
  const filas = await ej.select({ id: plantillasPlan.id, nombre: plantillasPlan.nombre }).from(plantillasPlan).where(eq(plantillasPlan.ambito, ambito));
  if (filas.some((f) => f.id !== exceptoId && norm(f.nombre) === norm(nombre))) throw new HttpError(409, `Ya existe una plantilla llamada «${nombre}» en esta sección. Elige otro nombre.`);
}

export async function listarPlantillasPlan(ej: Ejecutor, ambito?: Ambito): Promise<PlantillaPlanDto[]> {
  const filas = await (ambito ? ej.select().from(plantillasPlan).where(eq(plantillasPlan.ambito, ambito)) : ej.select().from(plantillasPlan)).orderBy(asc(plantillasPlan.ambito), asc(plantillasPlan.nombre));
  return filas.map(aDto).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export async function crearPlantillaPlan(ej: Ejecutor, entrada: unknown): Promise<PlantillaPlanDto> {
  const e = esquemaPlantillaPlan.parse(entrada);
  const datos = limpiarPorAmbito(e.ambito, e.datos);
  comprobarContenido(datos);
  await comprobarNombreLibre(ej, e.ambito, e.nombre);
  const [f] = await ej.insert(plantillasPlan).values({ ambito: e.ambito, nombre: e.nombre, descripcion: e.descripcion?.trim() || null, datos }).returning();
  return aDto(f);
}

export async function actualizarPlantillaPlan(ej: Ejecutor, id: number, entrada: unknown): Promise<PlantillaPlanDto> {
  const e = esquemaPlantillaPlan.parse(entrada);
  const [actual] = await ej.select().from(plantillasPlan).where(eq(plantillasPlan.id, id));
  if (!actual) throw new HttpError(404, "La plantilla ya no existe.");
  if (actual.ambito !== e.ambito) throw new HttpError(400, "Una plantilla no puede cambiar de sección.");
  const datos = limpiarPorAmbito(e.ambito, e.datos);
  comprobarContenido(datos);
  await comprobarNombreLibre(ej, e.ambito, e.nombre, id);
  const [f] = await ej.update(plantillasPlan).set({ nombre: e.nombre, descripcion: e.descripcion?.trim() || null, datos, actualizadaEn: new Date() }).where(eq(plantillasPlan.id, id)).returning();
  return aDto(f);
}

export async function borrarPlantillaPlan(ej: Ejecutor, id: number): Promise<void> {
  const [actual] = await ej.select({ id: plantillasPlan.id }).from(plantillasPlan).where(eq(plantillasPlan.id, id));
  if (!actual) throw new HttpError(404, "La plantilla ya no existe.");
  await ej.delete(plantillasPlan).where(eq(plantillasPlan.id, id));
}

export async function duplicarPlantillaPlan(ej: Ejecutor, id: number): Promise<PlantillaPlanDto> {
  const [origen] = await ej.select().from(plantillasPlan).where(eq(plantillasPlan.id, id));
  if (!origen) throw new HttpError(404, "La plantilla ya no existe.");
  const existentes = (await ej.select({ nombre: plantillasPlan.nombre }).from(plantillasPlan).where(eq(plantillasPlan.ambito, origen.ambito))).map((f) => norm(f.nombre));
  let nombre = `Copia de ${origen.nombre}`;
  for (let i = 2; existentes.includes(norm(nombre)); i++) nombre = `Copia ${i} de ${origen.nombre}`;
  const [f] = await ej.insert(plantillasPlan).values({ ambito: origen.ambito, nombre, descripcion: origen.descripcion, datos: origen.datos }).returning();
  return aDto(f);
}
