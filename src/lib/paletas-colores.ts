/**
 * Paletas de colores: los colores de los tipos de venta (los botones Contado, Crédito y Preference de la creación rápida), de las marcas
 * (cápsula y punto) y de los estados del vehículo, guardados por nombre. Módulo sin dependencias, para usarlo en servidor y navegador.
 *
 * El archivo exportado lleva `formato` y `version`. Al leer se acepta lo que se entienda y se ignora el resto (campos nuevos de versiones
 * futuras, colores mal escritos…), así un archivo de otra versión no da error: como mucho avisa de lo que no ha podido usar.
 */

export const FORMATO_PALETA = "gv-paleta";
export const VERSION_PALETA = 1;

export interface ColorTipoVenta {
  nombre: string;
  color: string | null;
}
export interface ColorMarca {
  nombre: string;
  color: string | null;
  punto: string | null;
  puntoColor: string | null;
}
export interface ColorEstado {
  nombre: string;
  color: string | null;
  capsulaColor: string | null;
  punto: string | null;
  puntoColor: string | null;
  prevalece: "marca" | "estado" | null;
}
export interface DatosPaleta {
  tiposVenta: ColorTipoVenta[];
  marcas: ColorMarca[];
  estados: ColorEstado[];
}

/** La paleta de siempre: la de los botones de creación rápida (rojo, ámbar y azul) y sin color en marcas ni estados. */
export const PALETA_POR_DEFECTO: DatosPaleta = {
  tiposVenta: [
    { nombre: "Contado", color: "#ff0000" },
    { nombre: "Crédito", color: "#e69d00" },
    { nombre: "Preference", color: "#3b82f6" },
  ],
  marcas: [],
  estados: [],
};

export const clavePaleta = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

const RE_COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const color = (v: unknown): string | null => (typeof v === "string" && RE_COLOR.test(v.trim()) ? v.trim().toLowerCase() : null);
const texto = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null);
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x)) : []);

/** Entiende los datos de una paleta venga de donde venga (base de datos, archivo, otra versión). Lo que no se entiende se descarta y se cuenta. */
export function normalizarPaleta(crudo: unknown): { datos: DatosPaleta; descartados: number } {
  const o = typeof crudo === "object" && crudo !== null ? (crudo as Record<string, unknown>) : {};
  let descartados = 0;
  const conNombre = <T extends { nombre: string }>(fila: Record<string, unknown>, f: (nombre: string) => T): T | null => {
    const nombre = texto(fila.nombre, 200);
    if (!nombre) {
      descartados++;
      return null;
    }
    return f(nombre);
  };
  const tiposVenta = lista(o.tiposVenta).flatMap((f) => conNombre(f, (nombre) => ({ nombre, color: color(f.color) })) ?? []);
  const marcas = lista(o.marcas).flatMap((f) => conNombre(f, (nombre) => ({ nombre, color: color(f.color), punto: texto(f.punto, 8), puntoColor: color(f.puntoColor) })) ?? []);
  const estados = lista(o.estados).flatMap((f) =>
    conNombre(f, (nombre) => ({ nombre, color: color(f.color), capsulaColor: color(f.capsulaColor), punto: texto(f.punto, 8), puntoColor: color(f.puntoColor), prevalece: f.prevalece === "estado" ? ("estado" as const) : f.prevalece === "marca" ? ("marca" as const) : null })) ?? [],
  );
  return { datos: { tiposVenta, marcas, estados }, descartados };
}

export const totalPaleta = (d: DatosPaleta): number => d.tiposVenta.length + d.marcas.length + d.estados.length;

export interface ArchivoPaleta {
  app: string;
  formato: string;
  version: number;
  exportadoEn: string;
  nombre: string;
  descripcion: string | null;
  datos: DatosPaleta;
}

export function paraExportar(nombre: string, descripcion: string | null, datos: DatosPaleta, ahora = new Date()): ArchivoPaleta {
  return { app: "GestorVentasPi", formato: FORMATO_PALETA, version: VERSION_PALETA, exportadoEn: ahora.toISOString(), nombre, descripcion, datos };
}

/** Lee el texto de un archivo de paleta (con o sin envoltorio). Lanza `Error` con un texto claro si no es una paleta. */
export function leerArchivoPaleta(contenido: string): { nombre: string | null; descripcion: string | null; datos: DatosPaleta; avisos: string[] } {
  let crudo: unknown;
  try {
    crudo = JSON.parse(contenido);
  } catch {
    throw new Error("El archivo no es un JSON válido.");
  }
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) throw new Error("El archivo no parece una paleta de colores.");
  const o = crudo as Record<string, unknown>;
  if (typeof o.formato === "string" && !o.formato.startsWith(FORMATO_PALETA)) throw new Error("Este archivo no es una paleta de colores (es de otra sección de la aplicación).");
  const base = typeof o.datos === "object" && o.datos !== null ? o.datos : o;
  const { datos, descartados } = normalizarPaleta(base);
  if (totalPaleta(datos) === 0) throw new Error("La paleta no trae ningún color que se pueda usar.");
  const avisos: string[] = [];
  if (typeof o.version === "number" && o.version > VERSION_PALETA) avisos.push(`El archivo es de una versión más nueva (${o.version}): se han usado los colores que esta versión entiende.`);
  if (descartados > 0) avisos.push(`${descartados} elemento(s) sin nombre se han ignorado.`);
  return { nombre: texto(o.nombre, 120), descripcion: texto(o.descripcion, 500), datos, avisos };
}
