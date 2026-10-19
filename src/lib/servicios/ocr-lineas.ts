/**
 * Une los textos sueltos que devuelve un motor de OCR (cada uno con su caja en la imagen) en líneas de texto, de arriba abajo y de
 * izquierda a derecha. Lo comparten RapidOCR y Apple Vision.
 */

export interface CajaLeida {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  texto: string;
  /** De 0 a 100. */
  confianza: number;
}

export interface LineaLeida {
  texto: string;
  confianza: number;
}

/** Textos con el mismo centro vertical (dentro de media altura) van en la misma línea; un hueco grande entre dos marca otra columna. */
export function agruparCajas(cajas: CajaLeida[], columnas = false): LineaLeida[] {
  const leidas = [...cajas].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const filas: CajaLeida[][] = [];
  for (const l of leidas) {
    const cy = (l.y0 + l.y1) / 2;
    const fila = filas.find((f) => {
      const ref = f[0];
      const alto = Math.min(ref.y1 - ref.y0, l.y1 - l.y0);
      return Math.abs((ref.y0 + ref.y1) / 2 - cy) <= alto * 0.5;
    });
    if (fila) fila.push(l);
    else filas.push([l]);
  }
  filas.sort((a, b) => a[0].y0 - b[0].y0);
  return filas.map((f) => {
    f.sort((a, b) => a.x0 - b.x0);
    const alto = Math.max(...f.map((x) => x.y1 - x.y0));
    const texto = f.map((x, i) => (i === 0 ? x.texto : `${columnas && x.x0 - f[i - 1].x1 > alto * 1.2 ? "  " : " "}${x.texto}`)).join("");
    const confianza = Math.round(f.reduce((a, x) => a + x.confianza, 0) / f.length);
    return { texto: texto.replace(/ {3,}/g, "  ").trim(), confianza };
  });
}
