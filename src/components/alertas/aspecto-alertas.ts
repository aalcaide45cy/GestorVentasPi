import type { CSSProperties } from "react";
import { usePreferencia } from "@/lib/preferencias";

/** Cómo se ve el botón de alertas cuando hay alguna pendiente: efecto, velocidad y color (se guarda en el perfil de cada persona). */
export const CLAVE_ALERTAS_EFECTO = "exp-alertas-efecto";
export const CLAVE_ALERTAS_VELOCIDAD = "exp-alertas-velocidad";
export const CLAVE_ALERTAS_COLOR = "exp-alertas-color";

export const EFECTOS_ALERTA = [
  { id: "parpadeo", etiqueta: "Parpadeo" },
  { id: "pulso", etiqueta: "Pulso" },
  { id: "destello", etiqueta: "Destello" },
  { id: "latido", etiqueta: "Latido" },
  { id: "brillo", etiqueta: "Brillo" },
  { id: "ninguno", etiqueta: "Sin efecto (solo el número)" },
] as const;
export type EfectoAlerta = (typeof EFECTOS_ALERTA)[number]["id"];

export const VELOCIDADES_ALERTA = [
  { id: "lenta", etiqueta: "Lenta", factor: 2 },
  { id: "normal", etiqueta: "Normal", factor: 1 },
  { id: "rapida", etiqueta: "Rápida", factor: 0.5 },
] as const;
export type VelocidadAlerta = (typeof VELOCIDADES_ALERTA)[number]["id"];

export const COLORES_ALERTA = [
  { color: "#ef4444", etiqueta: "Rojo" },
  { color: "#f97316", etiqueta: "Naranja" },
  { color: "#eab308", etiqueta: "Amarillo" },
  { color: "#3b82f6", etiqueta: "Azul" },
  { color: "#a855f7", etiqueta: "Morado" },
] as const;

export interface AspectoAlertas {
  efecto: EfectoAlerta;
  velocidad: VelocidadAlerta;
  color: string;
}

/** Duración base (en segundos) de cada efecto, la de `globals.css`. */
const DURACION_BASE: Record<Exclude<EfectoAlerta, "ninguno">, number> = {
  parpadeo: 1,
  pulso: 1.2,
  destello: 1.1,
  latido: 1.4,
  brillo: 1.6,
};

export function useAspectoAlertas(): AspectoAlertas {
  const [efecto] = usePreferencia(CLAVE_ALERTAS_EFECTO);
  const [velocidad] = usePreferencia(CLAVE_ALERTAS_VELOCIDAD);
  const [color] = usePreferencia(CLAVE_ALERTAS_COLOR);
  return {
    efecto: EFECTOS_ALERTA.some((e) => e.id === efecto)
      ? (efecto as EfectoAlerta)
      : "parpadeo",
    velocidad: VELOCIDADES_ALERTA.some((v) => v.id === velocidad)
      ? (velocidad as VelocidadAlerta)
      : "normal",
    color: color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#ef4444",
  };
}

/** La clase y el estilo con los que se anima el botón. */
export function animacionDeAlerta(a: AspectoAlertas): {
  clase: string;
  estilo: CSSProperties;
} {
  if (a.efecto === "ninguno")
    return { clase: "", estilo: { ["--gv-color" as string]: a.color } };
  const factor =
    VELOCIDADES_ALERTA.find((v) => v.id === a.velocidad)?.factor ?? 1;
  return {
    clase: `gv-ef-${a.efecto}`,
    estilo: {
      ["--gv-color" as string]: a.color,
      animationDuration: `${(DURACION_BASE[a.efecto] * factor).toFixed(2)}s`,
    },
  };
}

/** Texto de cuándo se creó una alerta. */
export const cuando = (iso: string): string =>
  new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
