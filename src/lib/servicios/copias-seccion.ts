import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { copiasSeccion } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { INFO_SECCIONES, SECCIONES, exportarSeccion, importarSeccion, type Informe, type Modo, type Seccion } from "./intercambio";
import { archivarElementos } from "./papelera-elementos";

/**
 * Copias «internas» de cada sección de datos: se guardan dentro de la propia aplicación (en la base de datos, así también
 * entran en las copias completas) y permiten restaurar esa sección sola, sin tocar el resto.
 */

/** Cuántas copias automáticas se conservan por sección (las manuales no se borran solas). */
export const MAX_COPIAS_AUTOMATICAS = 20;

export interface CopiaInternaDto {
  id: number;
  seccion: Seccion;
  nombre: string;
  nota: string | null;
  origen: "manual" | "automatica";
  creadaEn: string;
  registros: number;
  tamano: number;
}

const fechaLegible = (d: Date) => d.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });

function aDto(f: Omit<typeof copiasSeccion.$inferSelect, "datos">): CopiaInternaDto {
  return { id: f.id, seccion: f.seccion as Seccion, nombre: f.nombre, nota: f.nota, origen: f.origen === "automatica" ? "automatica" : "manual", creadaEn: f.creadaEn.toISOString(), registros: f.registros, tamano: f.tamano };
}

const columnas = {
  id: copiasSeccion.id,
  seccion: copiasSeccion.seccion,
  nombre: copiasSeccion.nombre,
  nota: copiasSeccion.nota,
  origen: copiasSeccion.origen,
  creadaEn: copiasSeccion.creadaEn,
  creadaPor: copiasSeccion.creadaPor,
  registros: copiasSeccion.registros,
  tamano: copiasSeccion.tamano,
};

/** Guarda una copia interna del estado actual de una sección (o solo de los planes elegidos). */
export async function crearCopiaInterna(
  ej: Ejecutor,
  seccion: Seccion,
  creadaPor: number | null,
  nota: string | null = null,
  origen: "manual" | "automatica" = "manual",
  opciones: { ids?: number[] } = {},
): Promise<CopiaInternaDto> {
  if (!SECCIONES.includes(seccion)) throw new HttpError(400, "Sección no válida");
  const paquete = await exportarSeccion(ej, seccion, opciones);
  const tamano = Buffer.byteLength(JSON.stringify(paquete));
  const titulo = INFO_SECCIONES[seccion].titulo;
  const nombre = `${titulo} · ${fechaLegible(new Date())}${origen === "automatica" ? " (automática)" : ""}`;
  const [fila] = await ej
    .insert(copiasSeccion)
    .values({ seccion, nombre, nota: nota?.trim() || null, origen, creadaPor, registros: paquete.registros, tamano, datos: paquete })
    .returning(columnas);
  if (origen === "automatica") await limitarAutomaticas(ej, seccion);
  return aDto(fila);
}

async function limitarAutomaticas(ej: Ejecutor, seccion: Seccion): Promise<void> {
  const filas = await ej.select({ id: copiasSeccion.id }).from(copiasSeccion).where(and(eq(copiasSeccion.seccion, seccion), eq(copiasSeccion.origen, "automatica"))).orderBy(desc(copiasSeccion.creadaEn), desc(copiasSeccion.id));
  const sobran = filas.slice(MAX_COPIAS_AUTOMATICAS).map((f) => f.id);
  if (sobran.length > 0) await ej.delete(copiasSeccion).where(sql`${copiasSeccion.id} in (${sql.join(sobran.map((i) => sql`${i}`), sql`, `)})`);
}

export interface FiltroCopias {
  seccion?: Seccion | null;
  /** Texto a buscar en el nombre o la nota. */
  texto?: string | null;
  origen?: "manual" | "automatica" | null;
  /** AAAA-MM-DD */
  desde?: string | null;
  hasta?: string | null;
  limite?: number;
}

/** Lista de copias internas (sin el contenido), de la más reciente a la más antigua, con el total que cumple el filtro. */
export async function listarCopiasInternas(ej: Ejecutor, f: FiltroCopias = {}): Promise<{ copias: CopiaInternaDto[]; total: number }> {
  const condiciones = [];
  if (f.seccion) condiciones.push(eq(copiasSeccion.seccion, f.seccion));
  if (f.origen) condiciones.push(eq(copiasSeccion.origen, f.origen));
  const t = f.texto?.trim();
  if (t) condiciones.push(or(ilike(copiasSeccion.nombre, `%${t.replace(/[%_\\]/g, "\\$&")}%`), ilike(copiasSeccion.nota, `%${t.replace(/[%_\\]/g, "\\$&")}%`)));
  if (f.desde && /^\d{4}-\d{2}-\d{2}$/.test(f.desde)) condiciones.push(gte(copiasSeccion.creadaEn, new Date(`${f.desde}T00:00:00`)));
  if (f.hasta && /^\d{4}-\d{2}-\d{2}$/.test(f.hasta)) condiciones.push(lte(copiasSeccion.creadaEn, new Date(`${f.hasta}T23:59:59.999`)));
  const donde = condiciones.length > 0 ? and(...condiciones) : undefined;
  const filas = await ej.select(columnas).from(copiasSeccion).where(donde).orderBy(desc(copiasSeccion.creadaEn), desc(copiasSeccion.id)).limit(Math.min(f.limite ?? 200, 500));
  const [{ n }] = await ej.select({ n: sql<number>`count(*)::int` }).from(copiasSeccion).where(donde);
  return { copias: filas.map(aDto), total: n };
}

/** Cuántas copias internas hay de cada sección. */
export async function contarCopiasInternas(ej: Ejecutor): Promise<Record<string, number>> {
  const filas = await ej.select({ seccion: copiasSeccion.seccion, n: sql<number>`count(*)::int` }).from(copiasSeccion).groupBy(copiasSeccion.seccion);
  return Object.fromEntries(filas.map((f) => [f.seccion, f.n]));
}

export async function leerCopiaInterna(ej: Ejecutor, id: number) {
  const [f] = await ej.select().from(copiasSeccion).where(eq(copiasSeccion.id, id));
  if (!f) throw new HttpError(404, "La copia ya no existe.");
  return f;
}

export async function borrarCopiaInterna(ej: Ejecutor, id: number): Promise<void> {
  await ej.transaction(async (tx) => {
    const [c] = await tx.select().from(copiasSeccion).where(eq(copiasSeccion.id, id));
    if (!c) throw new HttpError(404, "La copia ya no existe.");
    // Se guarda en la Papelera antes de borrarla
    await archivarElementos(tx, "copia_seccion", sql`t.id = ${id}`, { etiqueta: `Copia interna «${c.nombre}» (${c.seccion})`, detalle: "Eliminada" });
    await tx.delete(copiasSeccion).where(eq(copiasSeccion.id, id));
  });
}

/**
 * Restaura una sección desde una copia interna con el mismo motor que las importaciones: `sustituir` deja la sección exactamente
 * como estaba; `actualizar` recupera y actualiza sin quitar lo nuevo; `anadir` solo repone lo que falta. Con `aplicar = false`
 * solo devuelve la vista previa.
 */
export async function restaurarCopiaInterna(ej: Ejecutor, idAdmin: number, id: number, modo: Modo, aplicar: boolean): Promise<{ informe: Informe; copia: CopiaInternaDto }> {
  const fila = await leerCopiaInterna(ej, id);
  const informe = await importarSeccion(ej, idAdmin, fila.datos, modo, aplicar, fila.seccion as Seccion);
  const { datos: _datos, ...resto } = fila;
  void _datos;
  return { informe, copia: aDto(resto) };
}
