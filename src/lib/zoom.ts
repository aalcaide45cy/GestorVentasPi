/** Nombre de la cookie con el tamaño de la página elegido en este navegador (por pantalla): así el servidor pinta ya la primera vista a ese tamaño. */
export const COOKIE_ZOOM = "gv_zoom";

/** Tamaño mínimo y máximo que se pueden elegir (porcentaje); se avanza de 1 en 1 %. */
export const ZOOM_MIN = 60;
export const ZOOM_MAX = 200;
/** Extremos de la escala, por si algo necesita recorrerla. */
export const NIVELES_ZOOM = [ZOOM_MIN, ZOOM_MAX] as const;

export const ZOOM_NORMAL = 100;

/** Un tamaño válido (entero entre el mínimo y el máximo) o 100 si no lo es. */
export function zoomValido(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n >= ZOOM_MIN && n <= ZOOM_MAX ? n : ZOOM_NORMAL;
}

/** Valor de la propiedad CSS `zoom` (1 = normal). */
export const factorZoom = (porcentaje: number): number => porcentaje / 100;

/** El tamaño un 1 % mayor (+1) o menor (-1) que el actual, sin salirse de los límites. */
export function moverZoom(actual: number, paso: 1 | -1): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomValido(actual) + paso));
}
