import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { apuntesExpediente, apuntesPredefinidos, expedientes } from "@/db/schema";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import { archivarElementos } from "./papelera-elementos";

/**
 * Apuntes de un expediente (SEGURO, VO de retoma…): líneas con título, descripción y, si se quiere, una etiqueta que sale junto al icono del cliente en la lista
 * de Expedientes. Los predefinidos (Configuración › Expedientes › Apuntes) tienen botón rápido: añaden la línea con un clic y solo puede haber una por
 * expediente (lo garantiza un índice único de la base de datos). Al eliminar un apunte se guarda en la Papelera.
 */

export const CLAVE_VO_RETOMA = "vo-retoma";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "El color debe ser tipo #3b82f6");

export const esquemaPredefinido = z.object({
  titulo: z.string().trim().min(1, "Falta el título").max(80),
  descripcion: z.string().max(2000).default(""),
  etiqueta: z.string().trim().max(24).default(""),
  color: color.default("#3b82f6"),
  mostrar_etiqueta: z.boolean().default(false),
  rapido: z.boolean().default(true),
});
export type EntradaPredefinido = z.infer<typeof esquemaPredefinido>;

export const esquemaApunte = z.object({
  titulo: z.string().trim().min(1, "Falta el título").max(80),
  descripcion: z.string().max(2000).default(""),
  etiqueta: z.string().trim().max(24).default(""),
  color: color.default("#3b82f6"),
  mostrar_etiqueta: z.boolean().default(false),
});
export type EntradaApunte = z.infer<typeof esquemaApunte>;

export interface PredefinidoDto {
  id: number;
  clave: string | null;
  titulo: string;
  descripcion: string;
  etiqueta: string;
  color: string;
  mostrar_etiqueta: boolean;
  rapido: boolean;
}

export interface ApunteDto {
  id: number;
  id_expediente: number;
  id_predefinido: number | null;
  titulo: string;
  descripcion: string;
  etiqueta: string;
  color: string;
  mostrar_etiqueta: boolean;
  creado_en: string;
}

/** Lo que lleva cada expediente en la lista (sin la descripción, para no cargar de más). */
export interface ApunteListaDto {
  id: number;
  titulo: string;
  etiqueta: string;
  color: string;
  mostrar_etiqueta: boolean;
}

const aPredefinido = (f: typeof apuntesPredefinidos.$inferSelect): PredefinidoDto => ({ id: f.id, clave: f.clave, titulo: f.titulo, descripcion: f.descripcion, etiqueta: f.etiqueta, color: f.color, mostrar_etiqueta: f.mostrarEtiqueta, rapido: f.rapido });
const aApunte = (f: typeof apuntesExpediente.$inferSelect): ApunteDto => ({ id: f.id, id_expediente: f.idExpediente, id_predefinido: f.idPredefinido, titulo: f.titulo, descripcion: f.descripcion, etiqueta: f.etiqueta, color: f.color, mostrar_etiqueta: f.mostrarEtiqueta, creado_en: f.creadoEn.toISOString() });

/* ------------------------------ Predefinidos ------------------------------ */

export async function listarPredefinidos(ej: Ejecutor): Promise<PredefinidoDto[]> {
  return (await ej.select().from(apuntesPredefinidos).orderBy(asc(apuntesPredefinidos.orden), asc(apuntesPredefinidos.id))).map(aPredefinido);
}

function soloAdministrador(u: UsuarioActual): void {
  if (!esAdministrador(u.rol)) throw new HttpError(403, "Solo el administrador puede cambiar los apuntes predefinidos");
}

export async function crearPredefinido(ej: Ejecutor, u: UsuarioActual, e: EntradaPredefinido): Promise<PredefinidoDto> {
  soloAdministrador(u);
  const [{ max }] = await ej.select({ max: sql<number>`coalesce(max(${apuntesPredefinidos.orden}), 0)::int` }).from(apuntesPredefinidos);
  const [f] = await ej.insert(apuntesPredefinidos).values({ titulo: e.titulo, descripcion: e.descripcion, etiqueta: e.etiqueta, color: e.color, mostrarEtiqueta: e.mostrar_etiqueta, rapido: e.rapido, orden: max + 1 }).returning();
  return aPredefinido(f);
}

export async function actualizarPredefinido(ej: Ejecutor, u: UsuarioActual, id: number, e: EntradaPredefinido): Promise<PredefinidoDto> {
  soloAdministrador(u);
  const [f] = await ej.update(apuntesPredefinidos).set({ titulo: e.titulo, descripcion: e.descripcion, etiqueta: e.etiqueta, color: e.color, mostrarEtiqueta: e.mostrar_etiqueta, rapido: e.rapido }).where(eq(apuntesPredefinidos.id, id)).returning();
  if (!f) throw new HttpError(404, "Apunte predefinido no encontrado");
  return aPredefinido(f);
}

export async function eliminarPredefinido(ej: Ejecutor, u: UsuarioActual, id: number): Promise<void> {
  soloAdministrador(u);
  const [f] = await ej.select().from(apuntesPredefinidos).where(eq(apuntesPredefinidos.id, id));
  if (!f) throw new HttpError(404, "Apunte predefinido no encontrado");
  if (f.clave) throw new HttpError(409, `«${f.titulo}» lo usa la propia aplicación y no se puede borrar; puedes cambiarle el texto, el color o quitarle el botón rápido`);
  // Los apuntes que ya se crearon con él se quedan (solo pierden el vínculo)
  await ej.delete(apuntesPredefinidos).where(eq(apuntesPredefinidos.id, id));
}

/* ------------------------------ Apuntes de un expediente ------------------------------ */

/** Quién puede tocar los apuntes: el administrador o el vendedor del expediente. */
async function comprobarAcceso(ej: Ejecutor, u: UsuarioActual, idExpediente: number): Promise<void> {
  const [e] = await ej.select({ idUsuario: expedientes.idUsuario }).from(expedientes).where(and(eq(expedientes.idExpediente, idExpediente), isNull(expedientes.eliminadoEn)));
  if (!e) throw new HttpError(404, "Expediente no encontrado");
  if (!esAdministrador(u.rol) && e.idUsuario !== u.idUsuario) throw new HttpError(403, "Solo el administrador o el vendedor del expediente pueden cambiar sus apuntes");
}

export async function listarApuntes(ej: Ejecutor, idExpediente: number): Promise<ApunteDto[]> {
  return (await ej.select().from(apuntesExpediente).where(eq(apuntesExpediente.idExpediente, idExpediente)).orderBy(asc(apuntesExpediente.creadoEn), asc(apuntesExpediente.id))).map(aApunte);
}

export async function crearApunte(ej: Ejecutor, u: UsuarioActual, idExpediente: number, e: EntradaApunte): Promise<ApunteDto> {
  await comprobarAcceso(ej, u, idExpediente);
  const [f] = await ej.insert(apuntesExpediente).values({ idExpediente, titulo: e.titulo, descripcion: e.descripcion, etiqueta: e.etiqueta, color: e.color, mostrarEtiqueta: e.mostrar_etiqueta }).returning();
  return aApunte(f);
}

/**
 * Añade el apunte de un predefinido con un clic. Si el expediente ya lo tiene no hace nada (`creado: false`): el índice único de la base de datos
 * lo impide aunque se pulse a la vez desde dos sitios. `descripcion` permite completar el texto del predefinido (por ejemplo, con la matrícula de la retoma).
 */
export async function anadirRapido(ej: Ejecutor, u: UsuarioActual | null, idExpediente: number, idPredefinido: number, descripcion?: string | null): Promise<{ creado: boolean; apunte: ApunteDto }> {
  if (u) await comprobarAcceso(ej, u, idExpediente);
  const [p] = await ej.select().from(apuntesPredefinidos).where(eq(apuntesPredefinidos.id, idPredefinido));
  if (!p) throw new HttpError(404, "Apunte predefinido no encontrado");
  const texto = descripcion && descripcion.trim() !== "" ? `${p.descripcion}${p.descripcion ? " " : ""}${descripcion.trim()}`.slice(0, 2000) : p.descripcion;
  const r = await ej.execute(sql`
    insert into apuntes_expediente (id_expediente, id_predefinido, titulo, descripcion, etiqueta, color, mostrar_etiqueta)
    values (${idExpediente}, ${p.id}, ${p.titulo}, ${texto}, ${p.etiqueta}, ${p.color}, ${p.mostrarEtiqueta})
    on conflict (id_expediente, id_predefinido) where id_predefinido is not null do nothing
    returning id`);
  const creado = ((r as unknown as { rows: unknown[] }).rows?.length ?? 0) > 0;
  const [f] = await ej.select().from(apuntesExpediente).where(and(eq(apuntesExpediente.idExpediente, idExpediente), eq(apuntesExpediente.idPredefinido, p.id)));
  return { creado, apunte: aApunte(f) };
}

/** El apunte «VO de retoma» (si el predefinido sigue existiendo): lo usa la lectura de un pedido que lleva retoma. */
export async function anadirVoRetoma(ej: Ejecutor, u: UsuarioActual, idExpediente: number, detalle: string | null): Promise<{ creado: boolean } | null> {
  const [p] = await ej.select({ id: apuntesPredefinidos.id }).from(apuntesPredefinidos).where(eq(apuntesPredefinidos.clave, CLAVE_VO_RETOMA));
  if (!p) return null;
  const { creado } = await anadirRapido(ej, u, idExpediente, p.id, detalle);
  return { creado };
}

export async function actualizarApunte(ej: Ejecutor, u: UsuarioActual, id: number, e: EntradaApunte): Promise<ApunteDto> {
  const [a] = await ej.select().from(apuntesExpediente).where(eq(apuntesExpediente.id, id));
  if (!a) throw new HttpError(404, "Apunte no encontrado");
  await comprobarAcceso(ej, u, a.idExpediente);
  const [f] = await ej.update(apuntesExpediente).set({ titulo: e.titulo, descripcion: e.descripcion, etiqueta: e.etiqueta, color: e.color, mostrarEtiqueta: e.mostrar_etiqueta }).where(eq(apuntesExpediente.id, id)).returning();
  return aApunte(f);
}

/** Elimina un apunte: antes se guarda en la Papelera (se puede restaurar mientras exista el expediente). */
export async function eliminarApunte(ej: Ejecutor, u: UsuarioActual, id: number): Promise<void> {
  const [a] = await ej.select().from(apuntesExpediente).where(eq(apuntesExpediente.id, id));
  if (!a) throw new HttpError(404, "Apunte no encontrado");
  await comprobarAcceso(ej, u, a.idExpediente);
  await archivarElementos(ej, "apunte", sql`t.id = ${id}`, { etiqueta: `Apunte «${a.titulo}» del expediente #EXP-${String(a.idExpediente).padStart(4, "0")}`, detalle: a.descripcion || null }, u.idUsuario);
  await ej.delete(apuntesExpediente).where(eq(apuntesExpediente.id, id));
}

/* ------------------------------ Para la lista de Expedientes ------------------------------ */

/** Los apuntes de todos los expedientes (o de los dados), agrupados por expediente. */
export async function apuntesPorExpediente(ej: Ejecutor, ids?: number[]): Promise<Map<number, ApunteListaDto[]>> {
  const filas = await ej
    .select({ idExpediente: apuntesExpediente.idExpediente, id: apuntesExpediente.id, titulo: apuntesExpediente.titulo, etiqueta: apuntesExpediente.etiqueta, color: apuntesExpediente.color, mostrar: apuntesExpediente.mostrarEtiqueta })
    .from(apuntesExpediente)
    .where(ids && ids.length > 0 ? inArray(apuntesExpediente.idExpediente, ids) : undefined)
    .orderBy(asc(apuntesExpediente.creadoEn), asc(apuntesExpediente.id));
  const mapa = new Map<number, ApunteListaDto[]>();
  for (const f of filas) {
    const l = mapa.get(f.idExpediente) ?? [];
    l.push({ id: f.id, titulo: f.titulo, etiqueta: f.etiqueta, color: f.color, mostrar_etiqueta: f.mostrar });
    mapa.set(f.idExpediente, l);
  }
  return mapa;
}
