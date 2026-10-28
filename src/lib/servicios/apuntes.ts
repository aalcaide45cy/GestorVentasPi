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

export const ESTADOS_SEMAFORO_INICIALES = [
  { color: "#ef4444", texto: "Aún no solicitado" },
  { color: "#eab308", texto: "Solicitado, sin terminar" },
  { color: "#22c55e", texto: "Terminado" },
];

export const esquemaEstadosSemaforo = z.array(z.object({ color, texto: z.string().trim().min(1, "Cada color necesita su significado").max(80), apagado: z.boolean().optional(), icono: z.string().trim().max(8).optional() })).min(2, "Un semáforo necesita al menos 2 estados").max(5);

export const esquemaPredefinido = z.object({
  titulo: z.string().trim().min(1, "Falta el título").max(80),
  descripcion: z.string().max(2000).default(""),
  etiqueta: z.string().trim().max(24).default(""),
  color: color.default("#3b82f6"),
  mostrar_etiqueta: z.boolean().default(false),
  rapido: z.boolean().default(true),
  /** Se añade solo a todos los expedientes (los que ya hay y los nuevos). */
  por_defecto: z.boolean().default(false),
  /** Funciona como un semáforo: cada expediente tiene un estado con su color y su significado. */
  semaforo: z.boolean().default(false),
  semaforo_estados: esquemaEstadosSemaforo.default(ESTADOS_SEMAFORO_INICIALES),
  lado: z.enum(["izquierda", "derecha"]).default("derecha"),
  /** Cómo se pinta la etiqueta: con relleno de color o con el texto y el borde en color. */
  estilo_etiqueta: z.enum(["relleno", "texto"]).default("relleno"),
  /** Estado en el que empiezan los expedientes (posición en los estados del semáforo). */
  estado_inicial: z.number().int().min(0).max(4).default(0),
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

export interface EstadoSemaforo {
  color: string;
  texto: string;
  /** Estado «apagado»: la etiqueta se ve tenue y en gris (por ejemplo, «no lleva seguro»). */
  apagado?: boolean;
  /** Emoticono (o texto corto) que sale delante de la etiqueta cuando el apunte está en este estado (por ejemplo 🔴). */
  icono?: string;
}

export interface PredefinidoDto {
  id: number;
  clave: string | null;
  titulo: string;
  descripcion: string;
  etiqueta: string;
  color: string;
  mostrar_etiqueta: boolean;
  rapido: boolean;
  por_defecto: boolean;
  semaforo: boolean;
  semaforo_estados: EstadoSemaforo[];
  lado: "izquierda" | "derecha";
  estilo_etiqueta: "relleno" | "texto";
  estado_inicial: number;
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
  /** Estado del semáforo (posición en `estados`), o `null` si no es un semáforo. */
  estado_semaforo: number | null;
  /** Los estados del semáforo del predefinido (color y significado), o `null`. */
  estados: EstadoSemaforo[] | null;
  creado_en: string;
}

/** Lo que lleva cada expediente en la lista (sin la descripción, para no cargar de más). */
export interface ApunteListaDto {
  id: number;
  id_predefinido: number | null;
  titulo: string;
  etiqueta: string;
  /** El color con el que se pinta (en un semáforo, el de su estado actual). */
  color: string;
  mostrar_etiqueta: boolean;
  lado: "izquierda" | "derecha";
  estilo: "relleno" | "texto";
  estado_semaforo: number | null;
  estados: EstadoSemaforo[] | null;
}

const aPredefinido = (f: typeof apuntesPredefinidos.$inferSelect): PredefinidoDto => ({ id: f.id, clave: f.clave, titulo: f.titulo, descripcion: f.descripcion, etiqueta: f.etiqueta, color: f.color, mostrar_etiqueta: f.mostrarEtiqueta, rapido: f.rapido, por_defecto: f.porDefecto, semaforo: f.semaforo, semaforo_estados: f.semaforoEstados, lado: f.lado === "izquierda" ? "izquierda" : "derecha", estilo_etiqueta: f.estiloEtiqueta === "texto" ? "texto" : "relleno", estado_inicial: Math.min(f.estadoInicial, Math.max(f.semaforoEstados.length - 1, 0)) });

/** El color con el que se pinta un apunte: en un semáforo, el de su estado actual (los colores se pueden cambiar desde Configuración); si no, el suyo. */
const colorDe = (color: string, estado: number | null, estados: EstadoSemaforo[] | null): string => (estados && estado !== null ? (estados[estado]?.color ?? color) : color);

type FilaConPredefinido = { a: typeof apuntesExpediente.$inferSelect; p: typeof apuntesPredefinidos.$inferSelect | null };
const aApunte = ({ a, p }: FilaConPredefinido): ApunteDto => {
  const estados = p?.semaforo ? p.semaforoEstados : null;
  return { id: a.id, id_expediente: a.idExpediente, id_predefinido: a.idPredefinido, titulo: a.titulo, descripcion: a.descripcion, etiqueta: a.etiqueta, color: colorDe(a.color, a.estadoSemaforo, estados), mostrar_etiqueta: a.mostrarEtiqueta, estado_semaforo: estados ? (a.estadoSemaforo ?? 0) : null, estados, creado_en: a.creadoEn.toISOString() };
};
const unirPredefinido = { a: apuntesExpediente, p: apuntesPredefinidos };

/* ------------------------------ Predefinidos ------------------------------ */

export async function listarPredefinidos(ej: Ejecutor): Promise<PredefinidoDto[]> {
  return (await ej.select().from(apuntesPredefinidos).orderBy(asc(apuntesPredefinidos.orden), asc(apuntesPredefinidos.id))).map(aPredefinido);
}

function soloAdministrador(u: UsuarioActual): void {
  if (!esAdministrador(u.rol)) throw new HttpError(403, "Solo el administrador puede cambiar los apuntes predefinidos");
}

function camposPredefinido(e: EntradaPredefinido) {
  return { titulo: e.titulo, descripcion: e.descripcion, etiqueta: e.etiqueta, color: e.color, mostrarEtiqueta: e.mostrar_etiqueta, rapido: e.rapido, porDefecto: e.por_defecto, semaforo: e.semaforo, semaforoEstados: e.semaforo ? e.semaforo_estados : [], lado: e.lado, estiloEtiqueta: e.estilo_etiqueta, estadoInicial: e.semaforo ? Math.min(e.estado_inicial, e.semaforo_estados.length - 1) : 0 };
}

/** Añade el predefinido a todos los expedientes que aún no lo tienen (los nuevos lo reciben solos por un disparador de la base de datos). */
async function aplicarPorDefectoATodos(ej: Ejecutor, idPredefinido: number): Promise<void> {
  await ej.execute(sql`
    insert into apuntes_expediente (id_expediente, id_predefinido, titulo, descripcion, etiqueta, color, mostrar_etiqueta, estado_semaforo)
    select e.id_expediente, p.id, p.titulo, p.descripcion, p.etiqueta, case when p.semaforo then coalesce(p.semaforo_estados->p.estado_inicial->>'color', p.color) else p.color end, p.mostrar_etiqueta, case when p.semaforo then p.estado_inicial else null end
    from expedientes e cross join apuntes_predefinidos p
    where p.id = ${idPredefinido} and e.eliminado_en is null
    on conflict (id_expediente, id_predefinido) where id_predefinido is not null do nothing`);
}

export async function crearPredefinido(ej: Ejecutor, u: UsuarioActual, e: EntradaPredefinido): Promise<PredefinidoDto> {
  soloAdministrador(u);
  const [{ max }] = await ej.select({ max: sql<number>`coalesce(max(${apuntesPredefinidos.orden}), 0)::int` }).from(apuntesPredefinidos);
  const [f] = await ej.insert(apuntesPredefinidos).values({ ...camposPredefinido(e), orden: max + 1 }).returning();
  if (f.porDefecto) await aplicarPorDefectoATodos(ej, f.id);
  return aPredefinido(f);
}

export async function actualizarPredefinido(ej: Ejecutor, u: UsuarioActual, id: number, e: EntradaPredefinido): Promise<PredefinidoDto> {
  soloAdministrador(u);
  const [f] = await ej.update(apuntesPredefinidos).set(camposPredefinido(e)).where(eq(apuntesPredefinidos.id, id)).returning();
  if (!f) throw new HttpError(404, "Apunte predefinido no encontrado");
  // Los apuntes ya creados con este predefinido toman su título, etiqueta, color y si se muestra (la descripción de cada uno se respeta)
  await ej.update(apuntesExpediente).set({ titulo: f.titulo, etiqueta: f.etiqueta, color: f.color, mostrarEtiqueta: f.mostrarEtiqueta }).where(eq(apuntesExpediente.idPredefinido, f.id));
  if (f.semaforo) {
    // Un expediente que tenía un estado que ya no existe (o ninguno) pasa al primero; y se pone el color del estado en el que esté
    await ej.update(apuntesExpediente).set({ estadoSemaforo: 0 }).where(and(eq(apuntesExpediente.idPredefinido, f.id), sql`(${apuntesExpediente.estadoSemaforo} is null or ${apuntesExpediente.estadoSemaforo} >= ${f.semaforoEstados.length})`));
    for (let i = 0; i < f.semaforoEstados.length; i++) await ej.update(apuntesExpediente).set({ color: f.semaforoEstados[i].color }).where(and(eq(apuntesExpediente.idPredefinido, f.id), eq(apuntesExpediente.estadoSemaforo, i)));
  }
  // Si ahora es «por defecto», lo reciben también los expedientes que ya hay
  if (f.porDefecto) await aplicarPorDefectoATodos(ej, f.id);
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
  return (await ej.select(unirPredefinido).from(apuntesExpediente).leftJoin(apuntesPredefinidos, eq(apuntesExpediente.idPredefinido, apuntesPredefinidos.id)).where(eq(apuntesExpediente.idExpediente, idExpediente)).orderBy(asc(apuntesExpediente.creadoEn), asc(apuntesExpediente.id))).map(aApunte);
}

export async function crearApunte(ej: Ejecutor, u: UsuarioActual, idExpediente: number, e: EntradaApunte): Promise<ApunteDto> {
  await comprobarAcceso(ej, u, idExpediente);
  const [f] = await ej.insert(apuntesExpediente).values({ idExpediente, titulo: e.titulo, descripcion: e.descripcion, etiqueta: e.etiqueta, color: e.color, mostrarEtiqueta: e.mostrar_etiqueta }).returning();
  return aApunte({ a: f, p: null });
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
    insert into apuntes_expediente (id_expediente, id_predefinido, titulo, descripcion, etiqueta, color, mostrar_etiqueta, estado_semaforo)
    values (${idExpediente}, ${p.id}, ${p.titulo}, ${texto}, ${p.etiqueta}, ${p.semaforo ? (p.semaforoEstados[p.estadoInicial]?.color ?? p.color) : p.color}, ${p.mostrarEtiqueta}, ${p.semaforo ? Math.min(p.estadoInicial, Math.max(p.semaforoEstados.length - 1, 0)) : null})
    on conflict (id_expediente, id_predefinido) where id_predefinido is not null do nothing
    returning id`);
  const creado = ((r as unknown as { rows: unknown[] }).rows?.length ?? 0) > 0;
  const [f] = await ej.select().from(apuntesExpediente).where(and(eq(apuntesExpediente.idExpediente, idExpediente), eq(apuntesExpediente.idPredefinido, p.id)));
  return { creado, apunte: aApunte({ a: f, p }) };
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
  const [p] = f.idPredefinido ? await ej.select().from(apuntesPredefinidos).where(eq(apuntesPredefinidos.id, f.idPredefinido)) : [null];
  return aApunte({ a: f, p });
}

/**
 * Pone el mismo estado de un semáforo a varios expedientes de una vez (edición en masa). Al que aún no tenga ese apunte se lo añade. El administrador puede con
 * cualquiera; el vendedor, solo con los suyos. Devuelve cuántos expedientes se han cambiado.
 */
export async function fijarEstadoMasivo(ej: Ejecutor, u: UsuarioActual, ids: number[], idPredefinido: number, estado: number): Promise<number> {
  if (ids.length === 0) return 0;
  const [p] = await ej.select().from(apuntesPredefinidos).where(eq(apuntesPredefinidos.id, idPredefinido));
  if (!p?.semaforo) throw new HttpError(400, "Ese apunte no es un semáforo");
  if (!Number.isInteger(estado) || estado < 0 || estado >= p.semaforoEstados.length) throw new HttpError(400, "Estado no válido");
  const lista = sql.join(ids.map((i) => sql`${i}`), sql`, `);
  const r = await ej.execute(sql`
    insert into apuntes_expediente (id_expediente, id_predefinido, titulo, descripcion, etiqueta, color, mostrar_etiqueta, estado_semaforo)
    select e.id_expediente, ${p.id}, ${p.titulo}, ${p.descripcion}, ${p.etiqueta}, ${p.semaforoEstados[estado].color}, ${p.mostrarEtiqueta}, ${estado}
    from expedientes e
    where e.id_expediente in (${lista}) and e.eliminado_en is null ${esAdministrador(u.rol) ? sql`` : sql`and e.id_usuario = ${u.idUsuario}`}
    on conflict (id_expediente, id_predefinido) where id_predefinido is not null
    do update set estado_semaforo = excluded.estado_semaforo, color = excluded.color
    returning id`);
  return (r as unknown as { rows: unknown[] }).rows.length;
}

/**
 * Edición en masa de un apunte predefinido que no es un semáforo: lo añade a los expedientes que no lo tienen o lo quita de los que lo tienen (los quitados se guardan
 * en la Papelera). El administrador puede con cualquiera; el vendedor, solo con los suyos. Devuelve cuántos expedientes se han cambiado.
 */
export async function anadirOQuitarMasivo(ej: Ejecutor, u: UsuarioActual, ids: number[], idPredefinido: number, operacion: "anadir" | "quitar"): Promise<number> {
  if (ids.length === 0) return 0;
  const [p] = await ej.select().from(apuntesPredefinidos).where(eq(apuntesPredefinidos.id, idPredefinido));
  if (!p) throw new HttpError(404, "Apunte predefinido no encontrado");
  const lista = sql.join(ids.map((i) => sql`${i}`), sql`, `);
  const propios = esAdministrador(u.rol) ? sql`` : sql`and e.id_usuario = ${u.idUsuario}`;
  if (operacion === "anadir") {
    const estado = p.semaforo ? Math.min(p.estadoInicial, Math.max(p.semaforoEstados.length - 1, 0)) : null;
    const r = await ej.execute(sql`
      insert into apuntes_expediente (id_expediente, id_predefinido, titulo, descripcion, etiqueta, color, mostrar_etiqueta, estado_semaforo)
      select e.id_expediente, ${p.id}, ${p.titulo}, ${p.descripcion}, ${p.etiqueta}, ${p.semaforo ? (p.semaforoEstados[estado ?? 0]?.color ?? p.color) : p.color}, ${p.mostrarEtiqueta}, ${estado}
      from expedientes e where e.id_expediente in (${lista}) and e.eliminado_en is null ${propios}
      on conflict (id_expediente, id_predefinido) where id_predefinido is not null do nothing
      returning id`);
    return (r as unknown as { rows: unknown[] }).rows.length;
  }
  const donde = sql`t.id_predefinido = ${p.id} and t.id_expediente in (select e.id_expediente from expedientes e where e.id_expediente in (${lista}) ${propios})`;
  const n = await archivarElementos(ej, "apunte", donde, { etiqueta: `Apunte «${p.titulo}» quitado en masa`, detalle: p.descripcion || null }, u.idUsuario);
  await ej.execute(sql`delete from apuntes_expediente t where ${donde}`);
  return n;
}

/** Cambia el estado de un apunte que funciona como semáforo (0 = rojo… según los estados del predefinido). */
export async function fijarEstadoSemaforo(ej: Ejecutor, u: UsuarioActual, id: number, estado: number): Promise<ApunteDto> {
  const [a] = await ej.select().from(apuntesExpediente).where(eq(apuntesExpediente.id, id));
  if (!a) throw new HttpError(404, "Apunte no encontrado");
  await comprobarAcceso(ej, u, a.idExpediente);
  const [p] = a.idPredefinido ? await ej.select().from(apuntesPredefinidos).where(eq(apuntesPredefinidos.id, a.idPredefinido)) : [null];
  if (!p?.semaforo) throw new HttpError(400, "Este apunte no es un semáforo");
  if (!Number.isInteger(estado) || estado < 0 || estado >= p.semaforoEstados.length) throw new HttpError(400, "Estado no válido");
  const [f] = await ej.update(apuntesExpediente).set({ estadoSemaforo: estado, color: p.semaforoEstados[estado].color }).where(eq(apuntesExpediente.id, id)).returning();
  return aApunte({ a: f, p });
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
    .select(unirPredefinido)
    .from(apuntesExpediente)
    .leftJoin(apuntesPredefinidos, eq(apuntesExpediente.idPredefinido, apuntesPredefinidos.id))
    .where(ids && ids.length > 0 ? inArray(apuntesExpediente.idExpediente, ids) : undefined)
    .orderBy(asc(apuntesExpediente.creadoEn), asc(apuntesExpediente.id));
  const mapa = new Map<number, ApunteListaDto[]>();
  for (const { a, p } of filas) {
    const estados = p?.semaforo ? p.semaforoEstados : null;
    const l = mapa.get(a.idExpediente) ?? [];
    l.push({ id: a.id, id_predefinido: a.idPredefinido, titulo: a.titulo, etiqueta: a.etiqueta, color: colorDe(a.color, a.estadoSemaforo, estados), mostrar_etiqueta: a.mostrarEtiqueta, lado: p?.lado === "izquierda" ? "izquierda" : "derecha", estilo: p?.estiloEtiqueta === "texto" ? "texto" : "relleno", estado_semaforo: estados ? (a.estadoSemaforo ?? 0) : null, estados });
    mapa.set(a.idExpediente, l);
  }
  return mapa;
}
