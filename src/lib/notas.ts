import { z } from "zod";

/** Notas y flujos de trabajo (diagramas y tableros): tipos, validación y utilidades que comparten el servidor y la pantalla. */

export const TIPOS_NOTA = ["nota", "diagrama", "tablero"] as const;
export type TipoNota = (typeof TIPOS_NOTA)[number];
export const AMBITOS_GRUPO = ["notas", "flujos"] as const;
export type AmbitoGrupo = (typeof AMBITOS_GRUPO)[number];
export const ambitoDe = (tipo: TipoNota): AmbitoGrupo => (tipo === "nota" ? "notas" : "flujos");

/** Límite de un fichero adjunto (el mismo que el de los documentos de los expedientes). */
export const MAX_BYTES_FICHERO_NOTA = 500 * 1024 * 1024;
/** Límite del contenido (el JSON del editor, del lienzo o del tablero) de una nota. */
export const MAX_BYTES_CONTENIDO = 30 * 1024 * 1024;

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const etiqueta = z.string().trim().min(1).max(30);
const contenidoJson = z.record(z.string(), z.unknown());

export const esquemaCrearNota = z.object({
  tipo: z.enum(TIPOS_NOTA),
  titulo: z.string().max(200).default(""),
  contenido: contenidoJson.optional(),
  id_grupo: z.number().int().positive().nullish(),
  color: color.nullish(),
  etiquetas: z.array(etiqueta).max(30).default([]),
  id_expediente: z.number().int().positive().nullish(),
  id_cliente: z.number().int().positive().nullish(),
});
export type EntradaCrearNota = z.infer<typeof esquemaCrearNota>;

/** Cambios de una nota: solo lo que se envía. `base` es la fecha de la última versión que se vio: si otra persona la cambió después, no se pisa. */
export const esquemaCambiarNota = z.object({
  titulo: z.string().max(200).optional(),
  contenido: contenidoJson.optional(),
  id_grupo: z.number().int().positive().nullish().optional(),
  color: color.nullish().optional(),
  fijada: z.boolean().optional(),
  etiquetas: z.array(etiqueta).max(30).optional(),
  id_expediente: z.number().int().positive().nullish().optional(),
  id_cliente: z.number().int().positive().nullish().optional(),
  base: z.string().datetime().nullish(),
});
export type EntradaCambiarNota = z.infer<typeof esquemaCambiarNota>;

export const esquemaGrupo = z.object({
  ambito: z.enum(AMBITOS_GRUPO),
  nombre: z.string().trim().min(1, "Falta el nombre del grupo").max(80),
  color: color.default("#3b82f6"),
});
export type EntradaGrupo = z.infer<typeof esquemaGrupo>;

export const esquemaComparticion = z.object({
  /** Cada entrada es una persona (`id_usuario`) o, sin él, todo el equipo. */
  con: z.array(z.object({ id_usuario: z.number().int().positive().nullable(), permiso: z.enum(["lectura", "edicion"]) })).max(200),
});
export type EntradaComparticion = z.infer<typeof esquemaComparticion>;

export type PermisoNota = "propietario" | "edicion" | "lectura";

export interface GrupoDto {
  id: number;
  ambito: AmbitoGrupo;
  nombre: string;
  color: string;
  orden: number;
}

export interface NotaResumenDto {
  id: number;
  tipo: TipoNota;
  titulo: string;
  /** Las primeras líneas del texto, para la lista. */
  extracto: string;
  color: string | null;
  fijada: boolean;
  etiquetas: string[];
  id_grupo: number | null;
  id_expediente: number | null;
  id_cliente: number | null;
  creado_en: string;
  actualizado_en: string;
  eliminado_en: string | null;
  permiso: PermisoNota;
  autor: string | null;
  /** Se comparte con alguien (solo lo sabe el propietario). */
  compartida: boolean;
  n_ficheros: number;
}

export interface FicheroNotaDto {
  id: number;
  nombre: string;
  mime: string;
  tamano: number;
  tiene_miniatura: boolean;
  creado_en: string;
}

export interface NotaDto extends NotaResumenDto {
  contenido: unknown;
  ficheros: FicheroNotaDto[];
}

export const esquemaEtiqueta = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre de la etiqueta").max(30),
  color: color.nullish(),
  /** Un emoticono (o un par de letras) que sale delante del nombre. */
  emoji: z.string().trim().max(8).nullish(),
  /** Para cambiarle el nombre: el nombre nuevo (se cambia en todas las notas). */
  nuevo_nombre: z.string().trim().min(1).max(30).nullish(),
});
export type EntradaEtiqueta = z.infer<typeof esquemaEtiqueta>;

export interface EtiquetaDto {
  nombre: string;
  color: string | null;
  emoji: string | null;
}

export interface VersionNotaDto {
  id: number;
  titulo: string;
  extracto: string;
  creado_en: string;
  /** Quién estaba editando cuando se guardó este punto. */
  autor: string | null;
}

export interface ComparticionDto {
  con: { id_usuario: number | null; permiso: "lectura" | "edicion" }[];
  usuarios: { id: number; nombre: string }[];
}

/** El texto plano de un documento del editor (para buscar y para el extracto): recorre los nodos y separa los bloques con saltos de línea. */
export function textoDeContenido(contenido: unknown): string {
  const trozos: string[] = [];
  const bloques = new Set(["paragraph", "heading", "listItem", "taskItem", "blockquote", "codeBlock", "tableRow", "tableCell", "tableHeader"]);
  const visitar = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const nodo = n as { type?: unknown; text?: unknown; content?: unknown; attrs?: { alt?: unknown } };
    if (typeof nodo.text === "string") trozos.push(nodo.text);
    if (nodo.type === "hardBreak") trozos.push("\n");
    if (Array.isArray(nodo.content)) nodo.content.forEach(visitar);
    if (typeof nodo.type === "string" && bloques.has(nodo.type)) trozos.push("\n");
  };
  visitar(contenido);
  return trozos.join("").replace(/\n{2,}/g, "\n").trim();
}

/** Texto plano de un flujo (diagrama o tablero): los textos de sus formas, columnas y tarjetas. */
export function textoDeFlujo(contenido: unknown): string {
  const trozos: string[] = [];
  const visitar = (n: unknown, profundidad = 0): void => {
    if (profundidad > 8 || n === null || n === undefined) return;
    if (typeof n === "string") return;
    if (Array.isArray(n)) {
      n.forEach((x) => visitar(x, profundidad + 1));
      return;
    }
    if (typeof n === "object") {
      for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
        if ((k === "texto" || k === "titulo" || k === "label" || k === "descripcion" || k === "nombre") && typeof v === "string" && v.trim()) trozos.push(v.trim());
        else visitar(v, profundidad + 1);
      }
    }
  };
  visitar(contenido);
  return trozos.join("\n");
}

export const normalizarEtiquetas = (l: string[]): string[] => [...new Set(l.map((e) => e.trim()).filter(Boolean))].slice(0, 30);

/** Una nota nueva vacía (el documento del editor sin texto). */
export const contenidoNotaVacio = (): Record<string, unknown> => ({ type: "doc", content: [{ type: "paragraph" }] });

/** El contenido inicial de cada tipo. */
export function contenidoInicial(tipo: TipoNota): Record<string, unknown> {
  if (tipo === "nota") return contenidoNotaVacio();
  if (tipo === "diagrama") return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
  return { columnas: [{ id: "c1", titulo: "Por hacer", tarjetas: [] }, { id: "c2", titulo: "En marcha", tarjetas: [] }, { id: "c3", titulo: "Hecho", tarjetas: [] }] };
}

/** Los paquetes de exportación e importación. */
export const FORMATO_EXPORTACION = "gestorventas-notas";
export interface PaqueteNotas {
  formato: typeof FORMATO_EXPORTACION;
  version: 1;
  exportado_en: string;
  grupos: { id: number; ambito: AmbitoGrupo; nombre: string; color: string }[];
  notas: {
    id: number;
    tipo: TipoNota;
    titulo: string;
    contenido: unknown;
    color: string | null;
    fijada: boolean;
    etiquetas: string[];
    id_grupo: number | null;
    creado_en: string;
  }[];
  /** El color y el emoticono de las etiquetas que usan las notas. */
  etiquetas?: { nombre: string; color: string | null; emoji: string | null }[];
  /** Los ficheros adjuntos (en base64), por la nota a la que pertenecen. */
  ficheros: { id: number; id_nota: number; nombre: string; mime: string; datos: string }[];
}

export const esquemaPaquete = z.object({
  formato: z.literal(FORMATO_EXPORTACION),
  version: z.literal(1),
  exportado_en: z.string().optional(),
  grupos: z.array(z.object({ id: z.number(), ambito: z.enum(AMBITOS_GRUPO), nombre: z.string().min(1).max(80), color: color.default("#3b82f6") })).max(500),
  notas: z.array(z.object({ id: z.number(), tipo: z.enum(TIPOS_NOTA), titulo: z.string().max(200).default(""), contenido: z.unknown(), color: color.nullable().default(null), fijada: z.boolean().default(false), etiquetas: z.array(etiqueta).max(30).default([]), id_grupo: z.number().nullable().default(null), creado_en: z.string().optional() })).max(20000),
  etiquetas: z.array(z.object({ nombre: z.string().min(1).max(30), color: color.nullable().default(null), emoji: z.string().max(8).nullable().default(null) })).max(500).default([]),
  ficheros: z.array(z.object({ id: z.number(), id_nota: z.number(), nombre: z.string().max(300), mime: z.string().max(120), datos: z.string() })).max(20000).default([]),
});
