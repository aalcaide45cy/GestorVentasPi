/**
 * Normalización de identificadores que se comparan entre pedidos leídos por OCR, listados del fabricante y pagos de la financiera:
 * documento del cliente (DNI, NIE o CIF, que aquí cuentan como lo mismo) y matrícula. Todo es puro, para poder probarlo.
 */

/** Documento sin espacios, guiones ni puntos y en mayúsculas. */
export const limpiarNif = (t: string | null | undefined): string => (t ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Clave para decidir si dos documentos son el mismo: sin ceros a la izquierda del número, porque unas veces vienen con ellos
 * («03217951K») y otras sin («3217951K»). Los NIE (X, Y, Z) y los CIF (letra delante) conservan su letra inicial.
 */
export function claveNif(t: string | null | undefined): string {
  const n = limpiarNif(t);
  const m = n.match(/^([A-Z]?)0*(\d+[A-Z0-9]*)$/);
  return m ? `${m[1]}${m[2]}` : n;
}

/** ¿Difieren en como mucho un carácter (un error típico de lectura)? Solo para sugerir, nunca para dar por bueno. */
export function nifParecido(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = claveNif(a);
  const y = claveNif(b);
  if (x.length < 7 || y.length < 7 || x === y) return false;
  if (Math.abs(x.length - y.length) > 1) return false;
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  if (x.length === y.length) return x.slice(i + 1) === y.slice(i + 1);
  const [largo, corto] = x.length > y.length ? [x, y] : [y, x];
  return largo.slice(i + 1) === corto.slice(i);
}

/**
 * Matrícula en el formato 1234ABC: sin la fecha que el listado del fabricante pone entre paréntesis («9109KFP(28-11-2017)»), sin
 * espacios ni guiones y sin una «E» delante (que algunos sistemas añaden a la matrícula española).
 */
export function normalizarMatricula(t: string | null | undefined): string {
  const sinFecha = (t ?? "").split("(")[0];
  const m = sinFecha.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^E\d{4}[A-Z]{3}$/.test(m) ? m.slice(1) : m;
}
