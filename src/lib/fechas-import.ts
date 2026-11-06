import { esFechaIso } from "@/lib/servicios/comun";

function aIso(a: number, m: number, d: number): string | null {
  const t = `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return esFechaIso(t) ? t : null;
}

/**
 * Interpreta una fecha de importación (10.4): `DD/MM/AAAA`, `DD-MM-AAAA`, `AAAA-MM-DD`,
 * número de serie de Excel (base 25569 días), objeto Date o fecha ISO completa.
 * Devuelve `AAAA-MM-DD` o `null` si no se puede interpretar.
 */
export function parseFechaFlexible(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return aIso(
      valor.getUTCFullYear(),
      valor.getUTCMonth() + 1,
      valor.getUTCDate(),
    );
  }

  if (typeof valor === "number") {
    if (!Number.isFinite(valor) || valor < 1) return null;
    const f = new Date(Math.round((valor - 25569) * 86400 * 1000));
    return aIso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
  }

  const texto = String(valor).trim();
  if (!texto) return null;

  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(texto);
  if (dmy) return aIso(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  const ymd = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(texto);
  if (ymd) return aIso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  const d = new Date(texto);
  if (!Number.isNaN(d.getTime()))
    return aIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return null;
}

/**
 * La hora (`HH:MM`) de una celda de fecha de importación: la parte decimal de un número de serie de Excel, la hora de un objeto Date o la «10:30»
 * que acompañe a un texto. Devuelve `null` si no hay hora (o es la medianoche, que es lo que queda al guardar solo la fecha).
 */
export function parseHoraFlexible(valor: unknown): string | null {
  const fmt = (h: number, m: number): string | null =>
    h < 0 || h > 23 || m < 0 || m > 59 || (h === 0 && m === 0)
      ? null
      : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  if (valor === null || valor === undefined || valor === "") return null;
  if (valor instanceof Date)
    return Number.isNaN(valor.getTime())
      ? null
      : fmt(valor.getUTCHours(), valor.getUTCMinutes());
  if (typeof valor === "number") {
    if (!Number.isFinite(valor) || valor < 1) return null;
    const minutos = Math.round((valor - Math.floor(valor)) * 24 * 60);
    return minutos >= 24 * 60
      ? null
      : fmt(Math.floor(minutos / 60), minutos % 60);
  }
  const t =
    /(?:^|[\sT])(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([ap])\.?m\.?)?/i.exec(
      String(valor).trim(),
    );
  if (!t) return null;
  let h = Number(t[1]);
  if (t[3]) h = (h % 12) + (t[3].toLowerCase() === "p" ? 12 : 0);
  return fmt(h, Number(t[2]));
}

/** Teléfono de importación: sin `.0` final y solo dígitos y `+`. */
export function limpiarTelefono(valor: unknown): string {
  let t = String(valor ?? "").trim();
  if (t.endsWith(".0")) t = t.slice(0, -2);
  return t.replace(/[^\d+]/g, "");
}

/** Matrícula de importación: se descarta lo que siga a un «(». */
export function limpiarMatricula(valor: unknown): string {
  return String(valor ?? "")
    .split("(")[0]
    .trim();
}
