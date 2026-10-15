import type { Centimos, Fecha, Mes } from "./tipos";

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Mes `AAAA-MM` de una fecha `AAAA-MM-DD`; null si falta o no tiene el formato. */
export function mesDe(fecha: Fecha | null | undefined): Mes | null {
  if (typeof fecha !== "string" || !RE_FECHA.test(fecha)) return null;
  return fecha.slice(0, 7);
}

/** Suma `n` meses a un `AAAA-MM`. */
export function sumarMeses(mes: Mes, n: number): Mes {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  const anio = Math.floor(total / 12);
  const mm = (((total % 12) + 12) % 12) + 1;
  return `${String(anio).padStart(4, "0")}-${String(mm).padStart(2, "0")}`;
}

/** División entera hacia −∞ (también para negativos): floorDiv(−50, 100) = −1. */
export function floorDiv(a: number, b: number): number {
  const resto = ((a % b) + b) % b;
  return (a - resto) / b;
}

export function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

/** Importe entero válido (céntimos/centésimas) o null si no es un número finito. */
export function enteroValido(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.round(v);
}

/** El mes `mes` toca algún día del rango [inicio, fin]. */
export function mesEnRango(mes: Mes, inicio: Fecha, fin: Fecha): boolean {
  const mi = mesDe(inicio);
  const mf = mesDe(fin);
  if (!mi || !mf) return false;
  return mi <= mes && mes <= mf;
}

/** Etiqueta del tramo: 0 → "X", 1 → "X+1", −2 → "X-2". */
export function etiquetaTramo(tramo: number): string {
  if (tramo === 0) return "X";
  return tramo > 0 ? `X+${tramo}` : `X-${Math.abs(tramo)}`;
}

export function sumar(importes: Centimos[]): Centimos {
  return importes.reduce((a, b) => a + b, 0);
}

/**
 * Fecha que hace contar a un coche (12.3, paso 1): en VO, o si se cobra en otra fecha, la de cobro; en VN, la de facturación
 * (por defecto igual a la de matriculación; si el vendedor la cambia a mano, manda ella) y, sin facturación, la de matriculación.
 */
export function fechaQueCuenta(e: { clase: string; cobradoOtraFecha: boolean; fechaCobro: Fecha | null; fechaMatriculacion: Fecha | null; fechaFacturacion?: Fecha | null }): { fecha: Fecha | null; usaCobro: boolean } {
  const usaCobro = e.clase === "VO" || e.cobradoOtraFecha;
  return { fecha: usaCobro ? e.fechaCobro : (e.fechaFacturacion ?? e.fechaMatriculacion), usaCobro };
}
