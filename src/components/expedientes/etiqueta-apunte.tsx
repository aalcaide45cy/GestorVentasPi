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

/** El estado de un semáforo que afecta a cómo se pinta la etiqueta: solo fondo de color, solo icono, o icono con fondo; y si va tenue. */
export interface AspectoEstado {
  modo?: "color" | "icono" | "icono_fondo";
  icono?: string;
  apagado?: boolean;
  efecto?: "ninguno" | "parpadeo" | "pulso" | "destello" | "latido" | "brillo";
}

/** La clase de CSS del efecto animado del estado (vacía si no tiene). */
export const claseEfecto = (e?: AspectoEstado): string => (e?.efecto && e.efecto !== "ninguno" ? `gv-ef-${e.efecto}` : "");

/** El modo con el que se pinta de verdad: sin icono escrito, un estado «con icono» se queda en el fondo de color. */
const modoReal = (e?: AspectoEstado): "color" | "icono" | "icono_fondo" => ((e?.modo === "icono" || e?.modo === "icono_fondo") && (e.icono ?? "").trim() !== "" ? e.modo : "color");

/**
 * Cómo se pinta la etiqueta en un estado:
 * - **fondo de color** (por defecto): cápsula con el texto, con relleno o con el texto en color (según el estilo del apunte);
 * - **icono con fondo**: la misma cápsula con el icono delante del texto;
 * - **solo icono**: únicamente el icono, sin cápsula ni texto (el significado sale al pasar el ratón).
 * `apagado` la deja tenue.
 */
export function aspectoEtiqueta(etiqueta: string, color: string, estilo: EstiloEtiqueta, colorearEmoticonos: boolean, estado?: AspectoEstado): { estilo: CSSProperties; contenido: ReactNode; clase: string } {
  const clase = claseEfecto(estado);
  const tenue: CSSProperties = estado?.apagado ? { opacity: 0.45, ...(estilo === "texto" || modoReal(estado) === "icono" ? {} : { textShadow: "none" }) } : {};
  const modo = modoReal(estado);
  const icono = (estado?.icono ?? "").trim();
  if (modo === "icono") return { estilo: { background: "transparent", border: "none", padding: "0 2px", fontSize: "0.95rem", lineHeight: 1.2, whiteSpace: "nowrap", ["--gv-color" as string]: color, ...tenue }, contenido: icono, clase };
  const base = { ...estiloEtiqueta(color, estilo), ["--gv-color" as string]: color, ...tenue } as CSSProperties;
  if (modo === "icono_fondo") return { estilo: base, contenido: <>{icono} {rotuloEtiqueta(etiqueta, color, estilo, colorearEmoticonos)}</>, clase };
  return { estilo: base, contenido: rotuloEtiqueta(etiqueta, color, estilo, colorearEmoticonos), clase };
}

/** La etiqueta tal y como saldrá en la lista de Expedientes (vista previa). */
export function EtiquetaApunte({ etiqueta, color, estilo, colorearEmoticonos, estado }: { etiqueta: string; color: string; estilo: EstiloEtiqueta; colorearEmoticonos: boolean; estado?: AspectoEstado }) {
  const a = aspectoEtiqueta(etiqueta.trim() === "" ? "(sin texto)" : etiqueta, color, estilo, colorearEmoticonos, estado);
  return <span className={a.clase} style={{ ...a.estilo, display: "inline-block" }}>{a.contenido}</span>;
}

/** El distintivo de un estado en un botón o una lista: un círculo de su color, su icono, o el icono sobre su color. */
export function MarcaEstado({ estado, tam = 16 }: { estado: { color: string; modo?: "color" | "icono" | "icono_fondo"; icono?: string; apagado?: boolean }; tam?: number }) {
  const modo = modoReal(estado);
  const opacidad = estado.apagado ? 0.45 : 1;
  if (modo === "icono") return <span style={{ fontSize: `${tam}px`, lineHeight: 1, flex: "0 0 auto", opacity: opacidad }}>{estado.icono}</span>;
  return (
    <span style={{ width: `${tam + (modo === "icono_fondo" ? 6 : 0)}px`, height: `${tam + (modo === "icono_fondo" ? 6 : 0)}px`, borderRadius: "50%", background: estado.color, flex: "0 0 auto", opacity: opacidad, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: `${Math.round(tam * 0.7)}px`, lineHeight: 1 }}>
      {modo === "icono_fondo" ? estado.icono : null}
    </span>
  );
}
