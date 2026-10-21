import { ETIQUETA_CATEGORIA, type CategoriaBiblioteca } from "@/lib/biblioteca-categorias";
import { guardarEnBibliotecaAlLeerAhora } from "@/lib/preferencias";
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
export function subirABiblioteca(archivo: File, categoria?: CategoriaBiblioteca, alAvanzar?: (enviado: number, total: number) => void, senal?: AbortSignal): Promise<{ archivo: ArchivoBibliotecaDto; repetido: boolean }> {
  const q = new URLSearchParams({ nombre: archivo.name });
  if (categoria) q.set("categoria", categoria);
  const fallo = `No se ha podido guardar «${archivo.name}».`;
  // XMLHttpRequest y no fetch: es lo que da el avance real de la subida (para la barra de progreso)
  return new Promise((resolver, rechazar) => {
    const x = new XMLHttpRequest();
    x.open("POST", `/api/biblioteca?${q}`);
    x.withCredentials = true;
    x.setRequestHeader("Content-Type", archivo.type || "application/octet-stream");
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) alAvanzar?.(e.loaded, e.total);
    };
    x.onabort = () => rechazar(new DOMException("Subida cancelada", "AbortError"));
    senal?.addEventListener("abort", () => x.abort(), { once: true });
    x.onerror = () => rechazar(new Error(`${fallo} Se ha perdido la conexión con el servidor.`));
    x.onload = () => {
      let cuerpo: { data?: { archivo: ArchivoBibliotecaDto; repetido: boolean }; message?: string } = {};
      try {
        cuerpo = JSON.parse(x.responseText) as typeof cuerpo;
      } catch {
        /* sin cuerpo legible */
      }
      if (x.status >= 200 && x.status < 300 && cuerpo.data) {
        alAvanzar?.(archivo.size, archivo.size);
        resolver(cuerpo.data);
      } else rechazar(new Error(cuerpo.message ?? fallo));
    };
    if (senal?.aborted) return rechazar(new DOMException("Subida cancelada", "AbortError"));
    x.send(archivo);
  });
}

/** Borra archivos de la biblioteca por su id (se usa al cancelar una subida y querer quitar lo ya guardado). */
export async function borrarDeBiblioteca(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const r = await fetch("/api/biblioteca", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
  if (!r.ok) throw new Error(await mensaje(r, "No se han podido quitar los archivos guardados."));
}

let colaGuardado: Promise<void> = Promise.resolve();

/**
 * Guarda en la biblioteca, sin molestar, lo que se acaba de mandar a leer (pedidos o pagos de RCI), si la preferencia está activa. Va en segundo
 * plano y de uno en uno; no repite lo que ya está (mismo nombre y tamaño) ni avisa si algo falla: leer el documento es lo importante.
 */
export function guardarCopiaEnBiblioteca(archivos: File[], categoria: CategoriaBiblioteca): void {
  if (archivos.length === 0 || !guardarEnBibliotecaAlLeerAhora()) return;
  colaGuardado = colaGuardado.then(async () => {
    try {
      const ya = new Set((await listarBiblioteca()).archivos.map((a) => `${a.nombre}|${a.tamano}`));
      for (const f of archivos) {
        if (ya.has(`${f.name}|${f.size}`)) continue;
        await subirABiblioteca(f, categoria).catch((e: unknown) => console.warn("No se ha podido guardar en la biblioteca:", e instanceof Error ? e.message : e));
      }
    } catch (e) {
      console.warn("No se ha podido guardar en la biblioteca:", e instanceof Error ? e.message : e);
    }
  });
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
