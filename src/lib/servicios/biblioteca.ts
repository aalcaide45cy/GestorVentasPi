import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { biblioteca, bibliotecaDatos, clientes, expedientes } from "@/db/schema";
import { cifrarBuffer, descifrarBuffer } from "@/lib/auth/cifrado";
import { bytesCifrados, compartirSiRepetido } from "./contenidos";
import { HttpError } from "@/lib/auth/sesion";
import { adivinarCategoria, CATEGORIAS, ETIQUETA_CATEGORIA, nombreAutomatico, type CategoriaBiblioteca } from "@/lib/biblioteca-categorias";

/**
 * Biblioteca de archivos de trabajo: pedidos, pagos de RCI, rejillas, listados Excel… Se guardan una vez (cifrados, en la base de datos, así
 * que las copias de seguridad los incluyen) y desde las zonas de subida se pueden elegir sin volver a buscarlos en el equipo.
 */

export const MAX_BYTES_BIBLIOTECA = 200 * 1024 * 1024;
export { adivinarCategoria, CATEGORIAS, ETIQUETA_CATEGORIA, type CategoriaBiblioteca };

export interface ArchivoBibliotecaDto {
  id: number;
  categoria: CategoriaBiblioteca;
  nombre: string;
  /** El nombre con el que se subió (el de escáner o móvil), si se conserva. */
  nombreOriginal: string | null;
  mime: string;
  tamano: number;
  creadoEn: string;
  idCliente: number | null;
  idExpediente: number | null;
  /** A quién está asignado, para enseñarlo («Ana Pérez» o «#EXP-0012 · Ana Pérez»); null si no está asignado. */
  asignadoA: string | null;
}

const aDto = (f: typeof biblioteca.$inferSelect, cliente: string | null = null): ArchivoBibliotecaDto => ({
  id: f.id,
  categoria: f.categoria as CategoriaBiblioteca,
  nombre: f.nombre,
  nombreOriginal: f.nombreOriginal,
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
  e: { datos: Buffer; nombre: string; nombreOriginal?: string; mime?: string; categoria?: CategoriaBiblioteca; creadoPor: number | null },
): Promise<{ archivo: ArchivoBibliotecaDto; repetido: boolean }> {
  if (e.datos.length === 0) throw new HttpError(400, "El archivo está vacío.");
  if (e.datos.length > MAX_BYTES_BIBLIOTECA) throw new HttpError(413, "El archivo es demasiado grande (máximo 200 MB).");
  const nombre = e.nombre.trim().slice(0, 200) || "archivo";
  const huella = createHash("sha256").update(e.datos).digest("hex");
  return ej.transaction(async (tx) => {
    const [ya] = await tx.select().from(biblioteca).where(eq(biblioteca.huella, huella));
    if (ya) {
      // Si estaba en la Papelera, volver a subirlo lo saca de ella
      if (ya.eliminadoEn) await tx.update(biblioteca).set({ eliminadoEn: null }).where(eq(biblioteca.id, ya.id));
      return { archivo: aDto({ ...ya, eliminadoEn: null }), repetido: true };
    }
    const mime = mimeDe(nombre, e.mime ?? "");
    const [fila] = await tx
      .insert(biblioteca)
      .values({ categoria: e.categoria ?? adivinarCategoria(nombre, mime), nombre, nombreOriginal: (e.nombreOriginal ?? nombre).trim().slice(0, 200), mime: mime.slice(0, 120), tamano: e.datos.length, huella, creadoPor: e.creadoPor })
      .returning();
    // Las rejillas nunca se comparten: se dejan como siempre
    const compartible = fila.categoria !== "rejilla";
    await tx.insert(bibliotecaDatos).values({ idArchivo: fila.id, datos: cifrarBuffer(e.datos), contenidoHash: compartible ? huella : null });
    // Si ya había exactamente el mismo archivo (el pedido del expediente, por ejemplo), se guarda una sola vez
    if (compartible) await compartirSiRepetido(tx, huella);
    return { archivo: aDto(fila), repetido: false };
  });
}

/** Un nombre que no use otro archivo de la biblioteca (distinto de `huella`): si ya existe, «Nombre (2).pdf», «Nombre (3).pdf»… */
async function nombreLibre(ej: Ejecutor, nombre: string, huella: string): Promise<string> {
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const extension = punto > 0 ? nombre.slice(punto) : "";
  for (let n = 1; n < 500; n++) {
    const candidato = n === 1 ? nombre : `${base} (${n})${extension}`;
    const [otro] = await ej.select({ id: biblioteca.id }).from(biblioteca).where(and(eq(biblioteca.nombre, candidato), ne(biblioteca.huella, huella), isNull(biblioteca.eliminadoEn)));
    if (!otro) return candidato;
  }
  return nombre;
}

/** Hoy como AAAA-MM-DD en la hora de este equipo. */
const fechaDeHoy = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export interface EntradaCopiaAutomatica {
  datos: Buffer;
  nombreOriginal: string;
  mime?: string;
  categoria: CategoriaBiblioteca;
  /** Lo leído del documento, para ponerle nombre: cliente y fecha (AAAA-MM-DD) en pedidos y pagos; mes (AAAA-MM) en rejillas. */
  cliente?: string | null;
  fecha?: string | null;
  mes?: string | null;
  creadoPor: number | null;
}

/**
 * Guarda en la biblioteca un documento que se acaba de leer (pedido, pago de RCI, rejilla), con el nombre «Tipo - Cliente - Fecha». Si ya estaba
 * (mismo contenido) no lo duplica: lo renombra. Nunca falla hacia fuera: leer el documento es lo importante y esto es un extra.
 */
export async function guardarCopiaAutomatica(ej: Ejecutor, e: EntradaCopiaAutomatica): Promise<void> {
  try {
    // Un documento recién leído siempre queda con nombre ordenado y con fecha: si no se leyó el cliente o la fecha, la de hoy (la de subida)
    const automatico = nombreAutomatico({ categoria: e.categoria, cliente: e.cliente, fecha: e.fecha, mes: e.mes, nombreOriginal: e.nombreOriginal, fechaSubida: fechaDeHoy(), conRespaldo: true });
    const huella = createHash("sha256").update(e.datos).digest("hex");
    const [ya] = await ej.select().from(biblioteca).where(eq(biblioteca.huella, huella));
    if (ya) {
      if (ya.eliminadoEn) await ej.update(biblioteca).set({ eliminadoEn: null }).where(eq(biblioteca.id, ya.id));
      if (automatico && ya.nombre !== automatico) {
        await ej.update(biblioteca).set({ nombre: await nombreLibre(ej, automatico, huella), categoria: e.categoria }).where(eq(biblioteca.id, ya.id));
      }
      return;
    }
    const nombre = await nombreLibre(ej, automatico ?? e.nombreOriginal.trim().slice(0, 200), huella);
    await guardarArchivo(ej, { datos: e.datos, nombre, nombreOriginal: e.nombreOriginal, mime: e.mime, categoria: e.categoria, creadoPor: e.creadoPor });
  } catch (err) {
    console.warn("No se ha podido guardar el documento en la biblioteca:", err instanceof Error ? err.message : err);
  }
}

/** Pone a un archivo ya guardado el nombre «Tipo - Cliente - Fecha» con lo que se ha leído de él. Devuelve el nombre nuevo o null si no hay datos para ponerlo. */
export async function renombrarSegunLectura(ej: Ejecutor, id: number, leido: { cliente?: string | null; fecha?: string | null; mes?: string | null }, categoria?: CategoriaBiblioteca, conRespaldo = false): Promise<string | null> {
  const [f] = await ej.select().from(biblioteca).where(eq(biblioteca.id, id));
  if (!f) return null;
  const cat = categoria ?? (f.categoria as CategoriaBiblioteca);
  const fechaSubida = `${f.creadoEn.getFullYear()}-${String(f.creadoEn.getMonth() + 1).padStart(2, "0")}-${String(f.creadoEn.getDate()).padStart(2, "0")}`;
  const automatico = nombreAutomatico({ categoria: cat, ...leido, nombreOriginal: f.nombre, fechaSubida, conRespaldo });
  if (!automatico) return null;
  // Si al leerlo resulta ser de otro tipo que el que tenía (un PDF se toma por pedido por defecto), también se corrige el tipo
  if (automatico === f.nombre && cat === f.categoria) return f.nombre;
  const nombre = automatico === f.nombre ? f.nombre : await nombreLibre(ej, automatico, f.huella);
  // Se conserva siempre el nombre con el que se subió
  await ej.update(biblioteca).set({ nombre, categoria: cat, nombreOriginal: f.nombreOriginal ?? f.nombre }).where(eq(biblioteca.id, id));
  return nombre;
}

export async function listarArchivos(ej: Ejecutor, categorias?: CategoriaBiblioteca[]): Promise<ArchivoBibliotecaDto[]> {
  const q = ej.select({ f: biblioteca, cliente: clientes.nombre }).from(biblioteca).leftJoin(clientes, eq(clientes.id, biblioteca.idCliente));
  const filas = await q.where(categorias && categorias.length > 0 ? and(isNull(biblioteca.eliminadoEn), inArray(biblioteca.categoria, categorias)) : isNull(biblioteca.eliminadoEn)).orderBy(desc(biblioteca.creadoEn), desc(biblioteca.id));
  return filas.map((r) => aDto(r.f, r.cliente));
}

export async function leerArchivo(ej: Ejecutor, id: number): Promise<{ meta: ArchivoBibliotecaDto; datos: Buffer } | null> {
  const [f] = await ej.select().from(biblioteca).where(and(eq(biblioteca.id, id), isNull(biblioteca.eliminadoEn)));
  if (!f) return null;
  const [d] = await ej.select().from(bibliotecaDatos).where(eq(bibliotecaDatos.idArchivo, id));
  if (!d) return null;
  try {
    return { meta: aDto(f), datos: descifrarBuffer(await bytesCifrados(ej, d)) };
  } catch (e) {
    // Solo es «otra instalación» si el cifrado no cuadra; si falta la clave de esta (APP_SECRET), se dice tal cual para no confundir
    if (e instanceof Error && e.message.includes("APP_SECRET")) throw new HttpError(500, `No se puede abrir «${f.nombre}»: ${e.message}`);
    throw new HttpError(
      409,
      `El archivo «${f.nombre}» está cifrado con la clave de otra instalación (la copia de seguridad se restauró sin volver a cifrar la biblioteca). Un administrador puede recuperarlo con «npm run recifrar-biblioteca -- <clave de recuperación o APP_SECRET de origen>», o puedes volver a subirlo.`,
    );
  }
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
  // No se borra de verdad: pasa a la Papelera (Herramientas › Papelera), de donde se restaura o se purga
  const filas = await ej.update(biblioteca).set({ eliminadoEn: new Date() }).where(and(inArray(biblioteca.id, ids), isNull(biblioteca.eliminadoEn))).returning({ id: biblioteca.id });
  return filas.length;
}

export async function resumenBiblioteca(ej: Ejecutor): Promise<{ archivos: number; bytes: number }> {
  const [r] = await ej.select({ n: sql<number>`count(*)::int`, b: sql<number>`coalesce(sum(${biblioteca.tamano}), 0)::bigint::float8` }).from(biblioteca).where(isNull(biblioteca.eliminadoEn));
  return { archivos: r.n, bytes: r.b };
}
