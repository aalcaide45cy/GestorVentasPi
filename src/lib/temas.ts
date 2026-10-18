/**
 * Temas de color de la aplicación. Cada tema es una paleta (tonos HSL) que se aplica sobre las variables CSS existentes:
 * no cambia el diseño, solo los colores. Los dos primeros son el oscuro y el claro originales (sin cambios).
 */
export interface TemaColor {
  id: string;
  nombre: string;
  modo: "dark" | "light";
  /** Tono principal, secundario y de acento (0–360). */
  p: number;
  s: number;
  a: number;
  /** Tono y saturación (%) de los fondos. */
  f: number;
  g: number;
  /** Claridad del fondo (%): oscuros 8 / 15 / 22 (cada vez menos oscuros); claros 96 / 90 / 84 (cada vez menos claros). */
  n: number;
  /** Variante: 0 = estándar, 1 = intermedia, 2 = suave (dark) o tintada (light). */
  v: 0 | 1 | 2;
}

export const TEMA_OSCURO = "oscuro";
export const TEMA_CLARO = "claro";

/** Familias de color: nombre, principal, secundario, acento, tono de fondo, saturación de fondo (en oscuro). */
const FAMILIAS: [string, number, number, number, number, number][] = [
  ["Violeta", 255, 195, 335, 230, 25],
  ["Índigo", 235, 200, 300, 232, 28],
  ["Azul", 215, 185, 280, 218, 28],
  ["Cielo", 200, 170, 260, 205, 26],
  ["Turquesa", 180, 150, 260, 190, 24],
  ["Esmeralda", 155, 190, 50, 165, 22],
  ["Verde", 135, 175, 40, 140, 18],
  ["Lima", 85, 140, 30, 95, 18],
  ["Ámbar", 42, 20, 200, 35, 18],
  ["Naranja", 25, 45, 215, 20, 20],
  ["Coral", 10, 340, 190, 12, 20],
  ["Rojo", 355, 20, 210, 350, 22],
  ["Rosa", 335, 285, 175, 330, 22],
  ["Magenta", 310, 255, 160, 305, 22],
  ["Púrpura", 280, 235, 150, 275, 24],
  ["Océano", 205, 230, 160, 215, 35],
  ["Bosque", 150, 100, 20, 150, 22],
  ["Atardecer", 18, 330, 255, 280, 22],
  ["Medianoche", 225, 265, 195, 240, 38],
  ["Grafito", 220, 200, 260, 220, 6],
  ["Café", 28, 15, 195, 25, 14],
  ["Arena", 45, 30, 200, 40, 12],
  ["Menta", 165, 140, 280, 170, 16],
  ["Lavanda", 262, 300, 190, 260, 20],
  ["Cereza", 345, 300, 190, 340, 26],
];

const NIVELES_OSCURO: [string, number][] = [["oscuro", 8], ["medio", 15], ["suave", 22]];
const NIVELES_CLARO: [string, number][] = [["claro", 96], ["tenue", 90], ["tinte", 84]];
const sinAcentos = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** 25 familias × 6 variantes (3 oscuras y 3 claras) = 150 temas. */
export const TEMAS: TemaColor[] = FAMILIAS.flatMap(([nombre, p, s, a, f, g]) => [
  ...NIVELES_OSCURO.map(([sufijo, n], v): TemaColor => ({ id: sinAcentos(`${nombre.toLowerCase()}-${sufijo}`), nombre: `${nombre} ${sufijo}`, modo: "dark", p, s, a, f, g, n, v: v as 0 | 1 | 2 })),
  ...NIVELES_CLARO.map(([sufijo, n], v): TemaColor => ({ id: sinAcentos(`${nombre.toLowerCase()}-${sufijo}`), nombre: `${nombre} ${sufijo}`, modo: "light", p, s, a, f, g, n, v: v as 0 | 1 | 2 })),
]);

/** Colores de muestra de un tema (para las tarjetas del selector). */
export function muestraTema(t: TemaColor): { fondo: string; tarjeta: string; principal: string; secundario: string; acento: string; texto: string } {
  const oscuro = t.modo === "dark";
  return {
    fondo: oscuro ? `hsl(${t.f}, ${t.g}%, ${t.n}%)` : `hsl(${t.f}, ${Math.round(t.g * 0.8)}%, ${t.n}%)`,
    tarjeta: oscuro ? `hsl(${t.f}, ${t.g}%, ${t.n + 5}%)` : t.n >= 96 ? "hsl(0, 0%, 100%)" : `hsl(${t.f}, ${Math.round(t.g * 0.5)}%, ${Math.min(99, t.n + 7)}%)`,
    principal: `hsl(${t.p}, 85%, 62%)`,
    secundario: `hsl(${t.s}, 90%, 55%)`,
    acento: `hsl(${t.a}, 85%, 60%)`,
    texto: oscuro ? "hsl(220, 20%, 98%)" : "hsl(224, 71%, 4%)",
  };
}

/** Nombres de todas las variables CSS que puede fijar un tema (para limpiarlas al cambiar de tema). */
export const VARIABLES_TEMA = ["--primary-hue", "--secondary-hue", "--accent-hue", "--accent-rgb", "--secondary-rgb", "--bg-app", "--bg-surface", "--bg-card", "--bg-surface-hover", "--bg-surface-glass"] as const;

/** Nombre de la cookie con el tema elegido: así el servidor pinta la primera vista ya con sus colores, sin parpadeo ni scripts. */
export const COOKIE_TEMA = "gv_tema";

function rgb(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lum = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lum, 1 - lum);
  const f = (n: number) => Math.round(255 * (lum - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `${f(0)}, ${f(8)}, ${f(4)}`;
}

/** ¿Es un identificador de tema conocido (los dos originales o uno de los 150)? */
export const esTemaValido = (id: string | null | undefined): id is string => !!id && (id === TEMA_OSCURO || id === TEMA_CLARO || TEMAS.some((t) => t.id === id));

/**
 * Modo y variables CSS de un tema. Los originales («oscuro» y «claro») no fijan ninguna variable: se ve el diseño de siempre.
 * La fórmula de colores vive solo aquí.
 */
export function variablesTema(id: string): { claro: boolean; vars: Record<string, string> } {
  const t = TEMAS.find((x) => x.id === id);
  if (!t) return { claro: id === TEMA_CLARO, vars: {} };
  const claro = t.modo === "light";
  const { p, s, a, f, g, n } = t;
  const vars: Record<string, string> = {
    "--primary-hue": String(p),
    "--secondary-hue": String(s),
    "--accent-hue": String(a),
    "--accent-rgb": rgb(p, 85, 62),
    "--secondary-rgb": rgb(s, 90, 55),
  };
  if (claro) {
    const gs = Math.round(g * 0.8);
    const gt = Math.round(g * 0.5);
    vars["--bg-app"] = `hsl(${f}, ${gs}%, ${n}%)`;
    vars["--bg-surface-hover"] = `hsl(${f}, ${gs}%, ${n - 3}%)`;
    if (n < 96) {
      const sf = `hsl(${f}, ${gt}%, ${Math.min(99, n + 7)}%)`;
      vars["--bg-surface"] = sf;
      vars["--bg-card"] = sf;
      vars["--bg-surface-glass"] = `hsla(${f}, ${gt}%, ${Math.min(99, n + 8)}%, 0.85)`;
    }
  } else {
    vars["--bg-app"] = `hsl(${f}, ${g}%, ${n}%)`;
    vars["--bg-surface"] = `hsl(${f}, ${g}%, ${n + 4}%)`;
    vars["--bg-card"] = `hsl(${f}, ${g}%, ${n + 4}%)`;
    vars["--bg-surface-hover"] = `hsl(${f}, ${g}%, ${n + 8}%)`;
    vars["--bg-surface-glass"] = `hsla(${f}, ${g}%, ${n + 1}%, 0.65)`;
  }
  return { claro, vars };
}
