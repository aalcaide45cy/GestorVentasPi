/** Formato español de importes (céntimos) y puntos (centésimas); siempre con al menos 2 decimales. */

const fmtEuros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
const fmtPuntos = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });

export function euros(centimos: number | null | undefined): string {
  return fmtEuros.format((centimos ?? 0) / 100);
}

/** Importe con signo explícito: «+150,00 €» / «−150,00 €». */
export function eurosConSigno(centimos: number): string {
  return `${centimos > 0 ? "+" : ""}${euros(centimos)}`;
}

export function puntos(centesimas: number | null | undefined): string {
  return fmtPuntos.format((centesimas ?? 0) / 100);
}

/** Texto escrito por el usuario («1.234,50» o «1234.5») → entero ×100, o null si no es un número. */
export function aCentesimas(texto: string): number | null {
  const t = texto.trim().replace(/[€\s]/g, "");
  if (t === "") return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return null;
  return Math.round(Number(normal) * 100);
}

/** Entero ×100 → texto editable («1234,50»); null → vacío. */
export function deCentesimas(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  const signo = valor < 0 ? "-" : "";
  const abs = Math.abs(valor);
  return `${signo}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** `2026-06` → «Junio 2026». */
export function nombreMes(mes: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes ?? "");
  return m ? `${MESES[Number(m[2]) - 1]} ${m[1]}` : "";
}

export function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function etiquetaTramo(tramo: number): string {
  if (tramo === 0) return "X";
  return tramo > 0 ? `X+${tramo}` : `X−${Math.abs(tramo)}`;
}
