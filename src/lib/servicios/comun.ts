import { z } from "zod";

/** Fecha ISO `AAAA-MM-DD` válida en el calendario. */
export function esFechaIso(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [a, m, d] = valor.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** Fecha opcional: `""`, `null` o ausente → `null`; si hay valor debe ser ISO válido. */
export const fechaOpcional = z
  .union([z.string(), z.null()])
  .transform((v, ctx) => {
    if (v === null || v.trim() === "") return null;
    const t = v.trim();
    if (!esFechaIso(t)) {
      ctx.addIssue({ code: "custom", message: `Fecha no válida: ${t}` });
      return z.NEVER;
    }
    return t;
  });

/** Entero positivo opcional: `""`, `null`, `0` o ausente → `null`; admite números en texto. */
export const idOpcional = z
  .union([z.number(), z.string(), z.null()])
  .transform((v, ctx) => {
    if (v === null || v === "" || v === 0 || v === "0") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Identificador no válido" });
      return z.NEVER;
    }
    return n;
  });

/** Texto opcional recortado; vacío → `null`. */
export const textoOpcional = (max: number) =>
  z
    .union([z.string(), z.null()])
    .transform((v) => (v === null || v.trim() === "" ? null : v.trim()))
    .pipe(z.string().max(max, `Máximo ${max} caracteres`).nullable());

export const listaIds = z.array(z.coerce.number().int().positive()).min(1, "Faltan los identificadores");

/** Escapa los comodines de LIKE para buscar texto literal. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Categoría de un tipo de venta deducida de su nombre (como hacía la aplicación original). */
export function categoriaTipoVenta(nombre: string): "CONTADO" | "CREDITO" | "PREFERENCE" | "RENTING" {
  const n = nombre.toLowerCase();
  if (n.includes("pref")) return "PREFERENCE";
  if (n.includes("rent")) return "RENTING";
  if (n.includes("créd") || n.includes("cred") || n.includes("financ")) return "CREDITO";
  return "CONTADO";
}

/** Clase (VN/VO) y subtipo VO de un estado deducidos de su nombre. */
export function claseEstado(nombre: string): { clase: "VN" | "VO"; subtipo: string | null } {
  const n = nombre.toLowerCase();
  if (n === "nuevo") return { clase: "VN", subtipo: null };
  if (n.includes("km0") || n.includes("km 0")) return { clase: "VO", subtipo: "KM0" };
  if (n.includes("demo")) return { clase: "VO", subtipo: "DEMO" };
  if (n.includes("buyback")) return { clase: "VO", subtipo: "BUYBACK" };
  // Solo se da por usado lo que lo dice; un nombre desconocido («Matriculación», «Entrega»…) no cambia nada y se queda como nuevo
  if (/(usado|usados|ocasion|ocasión|segunda mano|vo)/.test(n)) return { clase: "VO", subtipo: "USADO" };
  return { clase: "VN", subtipo: null };
}

