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

/** El estado de un semáforo que afecta a cómo se pinta la etiqueta: si va con icono en vez de color, y si va tenue. */
export interface AspectoEstado {
  modo?: "color" | "icono";
  icono?: string;
  apagado?: boolean;
}

const usaIcono = (e?: AspectoEstado): boolean => e?.modo === "icono" && (e.icono ?? "").trim() !== "";

/**
 * Cómo se pinta la etiqueta en un estado: con el color del estado (relleno o texto en color) o, si el estado va con **icono**, con una cápsula neutra que lleva
 * el icono delante del texto. `apagado` la deja tenue.
 */
export function aspectoEtiqueta(etiqueta: string, color: string, estilo: EstiloEtiqueta, colorearEmoticonos: boolean, estado?: AspectoEstado): { estilo: CSSProperties; contenido: ReactNode } {
  const tenue: CSSProperties = estado?.apagado ? { opacity: 0.45, ...(estilo === "texto" || usaIcono(estado) ? {} : { textShadow: "none" }) } : {};
  if (usaIcono(estado)) {
    return {
      estilo: { background: "var(--bg-surface-tint)", color: "var(--text-primary)", fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.03em", padding: "1px 7px", borderRadius: "999px", lineHeight: 1.5, whiteSpace: "nowrap", border: "1px solid var(--border-light)", ...tenue },
      contenido: `${estado?.icono?.trim()} ${etiqueta}`.trim(),
    };
  }
  return { estilo: { ...estiloEtiqueta(color, estilo), ...tenue }, contenido: rotuloEtiqueta(etiqueta, color, estilo, colorearEmoticonos) };
}

/** La etiqueta tal y como saldrá en la lista de Expedientes (vista previa). */
export function EtiquetaApunte({ etiqueta, color, estilo, colorearEmoticonos, estado }: { etiqueta: string; color: string; estilo: EstiloEtiqueta; colorearEmoticonos: boolean; estado?: AspectoEstado }) {
  const a = aspectoEtiqueta(etiqueta.trim() === "" ? "(sin texto)" : etiqueta, color, estilo, colorearEmoticonos, estado);
  return <span style={{ ...a.estilo, display: "inline-block" }}>{a.contenido}</span>;
}

/** El distintivo de un estado en un botón o una lista: un círculo de su color o su icono. */
export function MarcaEstado({ estado, tam = 16 }: { estado: { color: string; modo?: "color" | "icono"; icono?: string; apagado?: boolean }; tam?: number }) {
  return usaIcono(estado) ? (
    <span style={{ fontSize: `${tam}px`, lineHeight: 1, flex: "0 0 auto", opacity: estado.apagado ? 0.45 : 1 }}>{estado.icono}</span>
  ) : (
    <span style={{ width: `${tam}px`, height: `${tam}px`, borderRadius: "50%", background: estado.color, flex: "0 0 auto", opacity: estado.apagado ? 0.45 : 1 }} />
  );
}
