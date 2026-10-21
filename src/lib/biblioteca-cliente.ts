import { ETIQUETA_CATEGORIA, type CategoriaBiblioteca } from "@/lib/biblioteca-categorias";
import type { ArchivoBibliotecaDto } from "@/lib/servicios/biblioteca";

/** Piezas del navegador para la biblioteca de archivos (subir, bajar como `File` y listar). */

export const ETIQUETAS = ETIQUETA_CATEGORIA;

export interface RespuestaListado {
  archivos: ArchivoBibliotecaDto[];
  resumen: { archivos: number; bytes: number };
}

async function mensaje(r: Response, defecto: string): Promise<string> {
  try {
    const j = (await r.json()) as { message?: string };
    return j.message ?? defecto;
  } catch {
    return defecto;
  }
}

export async function listarBiblioteca(categorias?: CategoriaBiblioteca[]): Promise<RespuestaListado> {
  const q = categorias && categorias.length > 0 ? `?categorias=${categorias.join(",")}` : "";
  const r = await fetch(`/api/biblioteca${q}`, { credentials: "same-origin" });
  if (!r.ok) throw new Error(await mensaje(r, "No se ha podido leer la biblioteca."));
  return ((await r.json()) as { data: RespuestaListado }).data;
}

/** Guarda un archivo en la biblioteca; `repetido` es true si ya estaba (mismo contenido). */
export async function subirABiblioteca(archivo: File, categoria?: CategoriaBiblioteca): Promise<{ archivo: ArchivoBibliotecaDto; repetido: boolean }> {
  const q = new URLSearchParams({ nombre: archivo.name });
  if (categoria) q.set("categoria", categoria);
  const r = await fetch(`/api/biblioteca?${q}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": archivo.type || "application/octet-stream" }, body: archivo });
  if (!r.ok) throw new Error(await mensaje(r, `No se ha podido guardar «${archivo.name}».`));
  return ((await r.json()) as { data: { archivo: ArchivoBibliotecaDto; repetido: boolean } }).data;
}

/** Baja un archivo de la biblioteca y lo entrega como `File`, igual que si se hubiera elegido en el equipo. */
export async function archivoDeBiblioteca(meta: Pick<ArchivoBibliotecaDto, "id" | "nombre" | "mime">): Promise<File> {
  const r = await fetch(`/api/biblioteca?id=${meta.id}`, { credentials: "same-origin" });
  if (!r.ok) throw new Error(await mensaje(r, `No se ha podido abrir «${meta.nombre}».`));
  return new File([await r.blob()], meta.nombre, { type: meta.mime });
}

/**
 * Para las zonas de subida cuyo manejador espera el evento de un `<input type="file">`: un evento con lo mínimo
 * que usan (`target.files` y `target.value`) para pasarles archivos elegidos de la biblioteca.
 */
export function eventoDeArchivos<E>(archivos: File[]): E {
  return { target: { files: archivos, value: "" } } as unknown as E;
}

export const tamanoLegible = (bytes: number): string => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
