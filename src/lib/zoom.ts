/** Nombre de la cookie con el tamaño de la página elegido en este navegador (por pantalla): así el servidor pinta ya la primera vista a ese tamaño. */
export const COOKIE_ZOOM = "gv_zoom";

/** Tamaños que se pueden elegir (porcentaje); 100 es el normal. */
export const NIVELES_ZOOM = [60, 70, 80, 90, 100, 110, 125, 150, 175, 200] as const;

export const ZOOM_NORMAL = 100;

/** Un tamaño válido (de los de la lista) o 100 si no es uno de ellos. */
export function zoomValido(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return (NIVELES_ZOOM as readonly number[]).includes(n) ? n : ZOOM_NORMAL;
}

/** Valor de la propiedad CSS `zoom` (1 = normal). */
export const factorZoom = (porcentaje: number): number => porcentaje / 100;

/** El nivel siguiente (+1) o anterior (-1) al actual, sin salirse de la lista. */
export function moverZoom(actual: number, paso: 1 | -1): number {
  const i = (NIVELES_ZOOM as readonly number[]).indexOf(zoomValido(actual));
  return NIVELES_ZOOM[Math.min(NIVELES_ZOOM.length - 1, Math.max(0, i + paso))];
}
