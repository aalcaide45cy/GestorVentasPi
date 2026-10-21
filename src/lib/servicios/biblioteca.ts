import { createHash } from "node:crypto";
import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { biblioteca, bibliotecaDatos, clientes, expedientes } from "@/db/schema";
import { cifrarBuffer, descifrarBuffer } from "@/lib/auth/cifrado";
import { HttpError } from "@/lib/auth/sesion";
import { CATEGORIAS, ETIQUETA_CATEGORIA, type CategoriaBiblioteca } from "@/lib/biblioteca-categorias";

/**
 * Biblioteca de archivos de trabajo: pedidos, pagos de RCI, rejillas, listados Excel… Se guardan una vez (cifrados, en la base de datos, así
 * que las copias de seguridad los incluyen) y desde las zonas de subida se pueden elegir sin volver a buscarlos en el equipo.
 */

export const MAX_BYTES_BIBLIOTECA = 200 * 1024 * 1024;
export { CATEGORIAS, ETIQUETA_CATEGORIA, type CategoriaBiblioteca };

export interface ArchivoBibliotecaDto {
  id: number;
  categoria: CategoriaBiblioteca;
  nombre: string;
  mime: string;
  tamano: number;
  creadoEn: string;
  idCliente: number | null;
  idExpediente: number | null;
  /** A quién está asignado, para enseñarlo («Ana Pérez» o «#EXP-0012 · Ana Pérez»); null si no está asignado. */
  asignadoA: string | null;
}

/** Categoría que se propone por el nombre y el tipo del archivo (se puede cambiar a mano). */
export function adivinarCategoria(nombre: string, mime = ""): CategoriaBiblioteca {
  const n = nombre.toLowerCase();
  if (/\.(xlsx|xls|csv)$/.test(n) || /spreadsheet|excel|csv/.test(mime)) return "listado";
  if (/rci|pago/.test(n)) return "pago_rci";
  if (/rejilla|comision|nomina|ren-91/.test(n)) return "rejilla";
  if (/\.(pdf|png|jpe?g|webp|bmp|tiff?)$/.test(n) || /^image\/|pdf/.test(mime)) return "pedido";
  return "otro";
}

const aDto = (f: typeof biblioteca.$inferSelect, cliente: string | null = null): ArchivoBibliotecaDto => ({
  id: f.id,
  categoria: f.categoria as CategoriaBiblioteca,
  nombre: f.nombre,
  mime: f.mime,
  tamano: f.tamano,
  creadoEn: f.creadoEn.toISOString(),
  idCliente: f.idCliente,
  idExpediente: f.idExpediente,
  asignadoA: f.idExpediente ? `#EXP-${String(f.idExpediente).padStart(4, "0")}${cliente ? ` · ${cliente}` : ""}` : f.idCliente ? (cliente ?? `Cliente ${f.idCliente}`) : null,
});

const MIME_POR_EXTENSION: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel", csv: "text/csv", txt: "text/plain" };
const mimeDe = (nombre: string, declarado: string): string => (declarado && declarado !== "application/octet-stream" ? declarado : (MIME_POR_EXTENSION[nombre.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream"));

/** Guarda un archivo. Si ya estaba (mismo contenido) no lo duplica y devuelve el que había (`repetido`). */
export async function guardarArchivo(
  ej: Ejecutor,
  e: { datos: Buffer; nombre: string; mime?: string; categoria?: CategoriaBiblioteca; creadoPor: number | null },
): Promise<{ archivo: ArchivoBibliotecaDto; repetido: boolean }> {
  if (e.datos.length === 0) throw new HttpError(400, "El archivo está vacío.");
  if (e.datos.length > MAX_BYTES_BIBLIOTECA) throw new HttpError(413, "El archivo es demasiado grande (máximo 200 MB).");
  const nombre = e.nombre.trim().slice(0, 200) || "archivo";
  const huella = createHash("sha256").update(e.datos).digest("hex");
  return ej.transaction(async (tx) => {
    const [ya] = await tx.select().from(biblioteca).where(eq(biblioteca.huella, huella));
    if (ya) return { archivo: aDto(ya), repetido: true };
    const mime = mimeDe(nombre, e.mime ?? "");
    const [fila] = await tx
      .insert(biblioteca)
      .values({ categoria: e.categoria ?? adivinarCategoria(nombre, mime), nombre, mime: mime.slice(0, 120), tamano: e.datos.length, huella, creadoPor: e.creadoPor })
      .returning();
    await tx.insert(bibliotecaDatos).values({ idArchivo: fila.id, datos: cifrarBuffer(e.datos) });
    return { archivo: aDto(fila), repetido: false };
  });
}

export async function listarArchivos(ej: Ejecutor, categorias?: CategoriaBiblioteca[]): Promise<ArchivoBibliotecaDto[]> {
  const q = ej.select({ f: biblioteca, cliente: clientes.nombre }).from(biblioteca).leftJoin(clientes, eq(clientes.id, biblioteca.idCliente));
  const filas = await (categorias && categorias.length > 0 ? q.where(inArray(biblioteca.categoria, categorias)) : q).orderBy(desc(biblioteca.creadoEn), desc(biblioteca.id));
  return filas.map((r) => aDto(r.f, r.cliente));
}

export async function leerArchivo(ej: Ejecutor, id: number): Promise<{ meta: ArchivoBibliotecaDto; datos: Buffer } | null> {
  const [f] = await ej.select().from(biblioteca).where(eq(biblioteca.id, id));
  if (!f) return null;
  const [d] = await ej.select().from(bibliotecaDatos).where(eq(bibliotecaDatos.idArchivo, id));
  if (!d) return null;
  return { meta: aDto(f), datos: descifrarBuffer(d.datos) };
}

/**
 * Cambia uno o varios archivos: nombre (solo con uno), tipo y asignación. `idCliente` / `idExpediente` a null los deja sin asignar; al asignar un
 * expediente se guarda también el cliente de ese expediente, y al asignar solo un cliente se quita el expediente.
 */
export async function cambiarArchivos(
  ej: Ejecutor,
  ids: number[],
  cambios: { nombre?: string; categoria?: CategoriaBiblioteca; idCliente?: number | null; idExpediente?: number | null },
): Promise<number> {
  const nombre = cambios.nombre?.trim().slice(0, 200);
  if (cambios.nombre !== undefined && !nombre) throw new HttpError(400, "El nombre no puede estar vacío.");
  if (nombre && ids.length !== 1) throw new HttpError(400, "El nombre solo se puede cambiar de uno en uno.");
  return ej.transaction(async (tx) => {
    const set: Partial<typeof biblioteca.$inferInsert> = { ...(nombre ? { nombre } : {}), ...(cambios.categoria ? { categoria: cambios.categoria } : {}) };
    if (cambios.idExpediente) {
      const [e] = await tx.select({ cliente: expedientes.idCliente }).from(expedientes).where(eq(expedientes.idExpediente, cambios.idExpediente));
      if (!e) throw new HttpError(404, "Expediente no encontrado");
      set.idExpediente = cambios.idExpediente;
      set.idCliente = e.cliente ?? null;
    } else if (cambios.idCliente) {
      const [c] = await tx.select({ id: clientes.id }).from(clientes).where(eq(clientes.id, cambios.idCliente));
      if (!c) throw new HttpError(404, "Cliente no encontrado");
      set.idCliente = cambios.idCliente;
      set.idExpediente = null;
    } else if (cambios.idCliente === null || cambios.idExpediente === null) {
      set.idCliente = null;
      set.idExpediente = null;
    }
    if (Object.keys(set).length === 0) throw new HttpError(400, "No hay nada que cambiar.");
    const filas = await tx.update(biblioteca).set(set).where(inArray(biblioteca.id, ids)).returning({ id: biblioteca.id });
    if (filas.length === 0) throw new HttpError(404, "Archivo no encontrado");
    return filas.length;
  });
}

export async function eliminarArchivos(ej: Ejecutor, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const filas = await ej.delete(biblioteca).where(inArray(biblioteca.id, ids)).returning({ id: biblioteca.id });
  return filas.length;
}

export async function resumenBiblioteca(ej: Ejecutor): Promise<{ archivos: number; bytes: number }> {
  const [r] = await ej.select({ n: sql<number>`count(*)::int`, b: sql<number>`coalesce(sum(${biblioteca.tamano}), 0)::bigint::float8` }).from(biblioteca);
  return { archivos: r.n, bytes: r.b };
}
