import type { CSSProperties } from "react";

/**
 * Colores y efectos según el nivel de tramo (X−4 … X+3) y según los puntos frente al objetivo.
 * Cuanto mejor es el tramo, más llamativo: rojo → naranja → ámbar → azul (X) → verde → dorado → dorado con brillo.
 * Las clases `.tramo-oro` y `.tramo-oro-brillo` están en globals.css.
 */

interface Nivel {
  color: string;
  clase?: string;
  texto: string;
}

const NIVELES: Record<number, Nivel> = {
  [-4]: { color: "#ef4444", texto: "Muy por debajo del objetivo" },
  [-3]: { color: "#f05a3a", texto: "Por debajo del objetivo" },
  [-2]: { color: "#f97316", texto: "Por debajo del objetivo" },
  [-1]: { color: "#f59e0b", texto: "Casi en el objetivo" },
  0: { color: "#38bdf8", texto: "En el objetivo" },
  1: { color: "#22c55e", texto: "Por encima del objetivo" },
  2: { color: "#facc15", clase: "tramo-oro", texto: "Muy por encima del objetivo" },
  3: { color: "#fde047", clase: "tramo-oro-brillo", texto: "Tramo máximo" },
};

function nivel(tramo: number): Nivel {
  return NIVELES[Math.max(-4, Math.min(3, tramo))];
}

/** Estilo y clase para el texto del tramo (el dorado y el dorado con brillo usan clases de globals.css). */
export function efectoTramo(tramo: number | null | undefined): { style: CSSProperties; className?: string; titulo: string } {
  if (tramo === null || tramo === undefined) return { style: {}, titulo: "" };
  const n = nivel(tramo);
  return { style: { color: n.color }, className: n.clase, titulo: n.texto };
}

/** Color de los puntos según el porcentaje del objetivo X alcanzado (objetivo en centésimas, igual que los puntos). */
export function efectoPuntos(puntosMes: number | null | undefined, objetivo: number | null | undefined): { style: CSSProperties; className?: string; titulo: string } {
  if (puntosMes === null || puntosMes === undefined || !objetivo || objetivo <= 0) return { style: {}, titulo: "" };
  const ratio = puntosMes / objetivo;
  const pct = `${Math.round(ratio * 100)} % del objetivo`;
  if (ratio >= 1.3) return { style: { color: "#fde047" }, className: "tramo-oro-brillo", titulo: pct };
  if (ratio >= 1.15) return { style: { color: "#facc15" }, className: "tramo-oro", titulo: pct };
  if (ratio >= 1) return { style: { color: "#22c55e" }, titulo: pct };
  if (ratio >= 0.85) return { style: { color: "#38bdf8" }, titulo: pct };
  if (ratio >= 0.6) return { style: { color: "#f59e0b" }, titulo: pct };
  if (ratio >= 0.35) return { style: { color: "#f97316" }, titulo: pct };
  return { style: { color: "#ef4444" }, titulo: pct };
}
