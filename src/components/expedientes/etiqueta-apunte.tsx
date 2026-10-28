import type { CSSProperties, ReactNode } from "react";

/** Un emoticono (con sus variantes y uniones). */
const EMOTICONOS = /((?:\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*))/u;
const EMOTICONOS_PRUEBA = /^\p{Extended_Pictographic}/u;

export type EstiloEtiqueta = "relleno" | "texto";

/** Aspecto de la cápsula de la etiqueta de un apunte: con relleno del color del estado, o con el texto y el borde en ese color. */
export function estiloEtiqueta(color: string, tipo: EstiloEtiqueta): CSSProperties {
  return tipo === "texto"
    ? { background: `${color}1f`, color, fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.03em", padding: "1px 7px", borderRadius: "999px", lineHeight: 1.5, whiteSpace: "nowrap", border: `1px solid ${color}` }
    : { background: color, color: "#fff", fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.03em", padding: "1px 7px", borderRadius: "999px", lineHeight: 1.5, whiteSpace: "nowrap", textShadow: "0 0 2px rgba(0,0,0,0.35)", border: "none" };
}

/**
 * El texto de la etiqueta. Con el estilo «texto» las letras llevan el color del estado; los emoticonos, que son imágenes a todo color, o se «pintan» (se ocultan y se
 * deja su silueta como sombra del color del estado) o conservan sus colores, según el ajuste del apunte.
 */
export function rotuloEtiqueta(etiqueta: string, color: string, estilo: EstiloEtiqueta, colorearEmoticonos: boolean): ReactNode {
  if (estilo !== "texto" || !colorearEmoticonos) return etiqueta;
  return etiqueta.split(EMOTICONOS).map((t, i) => (EMOTICONOS_PRUEBA.test(t) ? <span key={i} style={{ color: "transparent", textShadow: `0 0 0 ${color}` }}>{t}</span> : t));
}

/** La etiqueta tal y como saldrá en la lista de Expedientes (vista previa). `apagado` la deja tenue. */
export function EtiquetaApunte({ etiqueta, color, estilo, colorearEmoticonos, apagado }: { etiqueta: string; color: string; estilo: EstiloEtiqueta; colorearEmoticonos: boolean; apagado?: boolean }) {
  return (
    <span style={{ ...estiloEtiqueta(color, estilo), display: "inline-block", ...(apagado ? { opacity: 0.45, ...(estilo === "texto" ? {} : { textShadow: "none" }) } : {}) }}>
      {rotuloEtiqueta(etiqueta.trim() === "" ? "(sin texto)" : etiqueta, color, estilo, colorearEmoticonos)}
    </span>
  );
}
