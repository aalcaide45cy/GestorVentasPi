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
