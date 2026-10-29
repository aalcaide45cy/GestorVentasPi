import type { CSSProperties } from "react";
import { usePreferencia } from "@/lib/preferencias";

/** Cómo se ve el botón de alertas: icono, colores, estilo y, cuando hay alguna pendiente, la animación (se guarda en el perfil de cada persona). */
export const CLAVE_ALERTAS_EFECTO = "exp-alertas-efecto";
export const CLAVE_ALERTAS_VELOCIDAD = "exp-alertas-velocidad";
export const CLAVE_ALERTAS_COLOR = "exp-alertas-color";
export const CLAVE_ALERTAS_ICONO = "exp-alertas-icono";
export const CLAVE_ALERTAS_COLOR_ICONO = "exp-alertas-color-icono";
export const CLAVE_ALERTAS_ESTILO = "exp-alertas-estilo";
export const CLAVE_ALERTAS_TAMANO = "exp-alertas-tamano";

export const EFECTOS_ALERTA = [
  { id: "parpadeo", etiqueta: "Parpadeo" },
  { id: "intermitente", etiqueta: "Intermitente (luz de emergencia)" },
  { id: "pulso", etiqueta: "Pulso" },
  { id: "latido", etiqueta: "Latido" },
  { id: "destello", etiqueta: "Destello" },
  { id: "brillo", etiqueta: "Brillo" },
  { id: "onda", etiqueta: "Onda (como un radar)" },
  { id: "rebote", etiqueta: "Rebote" },
  { id: "temblor", etiqueta: "Temblor" },
  { id: "balanceo", etiqueta: "Balanceo (como una campana)" },
  { id: "giro", etiqueta: "Giro" },
  { id: "arcoiris", etiqueta: "Arcoíris (cambia de color)" },
  { id: "ninguno", etiqueta: "Sin efecto (solo el número)" },
] as const;
export type EfectoAlerta = (typeof EFECTOS_ALERTA)[number]["id"];

export const VELOCIDADES_ALERTA = [
  { id: "muy_lenta", etiqueta: "Muy lenta", factor: 3 },
  { id: "lenta", etiqueta: "Lenta", factor: 2 },
  { id: "normal", etiqueta: "Normal", factor: 1 },
  { id: "rapida", etiqueta: "Rápida", factor: 0.5 },
  { id: "muy_rapida", etiqueta: "Muy rápida", factor: 0.3 },
] as const;
export type VelocidadAlerta = (typeof VELOCIDADES_ALERTA)[number]["id"];

export const ESTILOS_BOTON = [
  { id: "suave", etiqueta: "Fondo suave" },
  { id: "solido", etiqueta: "Fondo de color" },
  { id: "contorno", etiqueta: "Solo el contorno" },
] as const;
export type EstiloBoton = (typeof ESTILOS_BOTON)[number]["id"];

export const TAMANOS_ICONO = [
  { id: "pequeno", etiqueta: "Pequeño", rem: 0.95 },
  { id: "normal", etiqueta: "Normal", rem: 1.1 },
  { id: "grande", etiqueta: "Grande", rem: 1.35 },
] as const;
export type TamanoIcono = (typeof TAMANOS_ICONO)[number]["id"];

export const COLORES_ALERTA = [
  { color: "#ef4444", etiqueta: "Rojo" },
  { color: "#f97316", etiqueta: "Naranja" },
  { color: "#eab308", etiqueta: "Amarillo" },
  { color: "#84cc16", etiqueta: "Lima" },
  { color: "#22c55e", etiqueta: "Verde" },
  { color: "#14b8a6", etiqueta: "Turquesa" },
  { color: "#06b6d4", etiqueta: "Celeste" },
  { color: "#3b82f6", etiqueta: "Azul" },
  { color: "#a855f7", etiqueta: "Morado" },
  { color: "#ec4899", etiqueta: "Rosa" },
  { color: "#ffffff", etiqueta: "Blanco" },
  { color: "#6b7280", etiqueta: "Gris" },
] as const;

/** Iconos sugeridos para el botón (cualquier emoticono vale). */
export const ICONOS_ALERTA = [
  "❗",
  "🚨",
  "⚠️",
  "🔔",
  "⏰",
  "📣",
  "🔥",
  "👀",
  "📌",
  "⭐",
] as const;

export interface AspectoAlertas {
  efecto: EfectoAlerta;
  velocidad: VelocidadAlerta;
  /** El color del botón: borde, fondo y número. */
  color: string;
  icono: string;
  /** Vacío = el emoticono con sus propios colores; con un color, el emoticono se pinta de ese color. */
  colorIcono: string;
  estilo: EstiloBoton;
  tamano: TamanoIcono;
}

/** Duración base (en segundos) de cada efecto, la de `globals.css`. */
const DURACION_BASE: Record<Exclude<EfectoAlerta, "ninguno">, number> = {
  parpadeo: 1,
  intermitente: 1,
  pulso: 1.2,
  destello: 1.1,
  latido: 1.4,
  brillo: 1.6,
  onda: 1.5,
  rebote: 1.1,
  temblor: 0.6,
  balanceo: 1.2,
  giro: 1.6,
  arcoiris: 3,
};

const esHex = (v: string | null): v is string =>
  v !== null && /^#[0-9a-fA-F]{6}$/.test(v);

export function useAspectoAlertas(): AspectoAlertas {
  const [efecto] = usePreferencia(CLAVE_ALERTAS_EFECTO);
  const [velocidad] = usePreferencia(CLAVE_ALERTAS_VELOCIDAD);
  const [color] = usePreferencia(CLAVE_ALERTAS_COLOR);
  const [icono] = usePreferencia(CLAVE_ALERTAS_ICONO);
  const [colorIcono] = usePreferencia(CLAVE_ALERTAS_COLOR_ICONO);
  const [estilo] = usePreferencia(CLAVE_ALERTAS_ESTILO);
  const [tamano] = usePreferencia(CLAVE_ALERTAS_TAMANO);
  return {
    efecto: EFECTOS_ALERTA.some((e) => e.id === efecto)
      ? (efecto as EfectoAlerta)
      : "parpadeo",
    velocidad: VELOCIDADES_ALERTA.some((v) => v.id === velocidad)
      ? (velocidad as VelocidadAlerta)
      : "normal",
    color: esHex(color) ? color : "#ef4444",
    icono: icono && icono.trim() !== "" ? icono.trim().slice(0, 8) : "❗",
    colorIcono: esHex(colorIcono) ? colorIcono : "",
    estilo: ESTILOS_BOTON.some((e) => e.id === estilo)
      ? (estilo as EstiloBoton)
      : "suave",
    tamano: TAMANOS_ICONO.some((t) => t.id === tamano)
      ? (tamano as TamanoIcono)
      : "normal",
  };
}

/** La animación del botón: la clase y el estilo, y si va en el botón entero (la onda) o solo en el icono. */
export function animacionDeAlerta(a: AspectoAlertas): {
  clase: string;
  estilo: CSSProperties;
  enBoton: boolean;
} {
  if (a.efecto === "ninguno")
    return {
      clase: "",
      estilo: { ["--gv-color" as string]: a.color },
      enBoton: false,
    };
  const factor =
    VELOCIDADES_ALERTA.find((v) => v.id === a.velocidad)?.factor ?? 1;
  return {
    clase: `gv-ef-${a.efecto}`,
    estilo: {
      ["--gv-color" as string]: a.color,
      animationDuration: `${(DURACION_BASE[a.efecto] * factor).toFixed(2)}s`,
    },
    enBoton: a.efecto === "onda",
  };
}

/** Cómo se pinta el icono: con sus colores, o pintado de un color (los emoticonos se «pintan» ocultándolos y dejando su silueta como sombra). */
export function estiloIcono(a: AspectoAlertas): CSSProperties {
  const rem = TAMANOS_ICONO.find((t) => t.id === a.tamano)?.rem ?? 1.1;
  return {
    fontSize: `${rem}rem`,
    lineHeight: 1,
    ...(a.colorIcono
      ? { color: "transparent", textShadow: `0 0 0 ${a.colorIcono}` }
      : {}),
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
