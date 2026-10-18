/**
 * Al duplicar un plan para otro periodo (por ejemplo, de septiembre a octubre), las fechas internas del plan (la validez de los bonus,
 * reglas y penalizaciones) se pueden trasladar al nuevo periodo:
 * - la fecha que coincide con el inicio o el fin del plan pasa al inicio o al fin del plan nuevo;
 * - si los dos planes empiezan el día 1 de un mes, las demás fechas se mueven los meses que haya de diferencia (mismo día del mes, o el último
 *   si el mes nuevo es más corto);
 * - si no, se mueven los mismos días que haya entre los dos inicios.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

const aIso = (a: number, m0: number, d: number): string => `${a}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const diasDelMes = (a: number, m0: number): number => new Date(Date.UTC(a, m0 + 1, 0)).getUTCDate();

/** Suma meses a una fecha AAAA-MM-DD conservando el día (o el último del mes si no existe). */
export function sumarMesesIso(fecha: string, meses: number): string {
  const m = ISO.exec(fecha);
  if (!m) return fecha;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes0 = ((total % 12) + 12) % 12;
  return aIso(anio, mes0, Math.min(Number(m[3]), diasDelMes(anio, mes0)));
}

function sumarDiasIso(fecha: string, dias: number): string {
  const m = ISO.exec(fecha);
  if (!m) return fecha;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dias));
  return aIso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const diasEntre = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export interface PeriodoPlan {
  inicio: string;
  fin: string;
}

/** Traslada una fecha de un periodo de plan a otro. */
export function trasladarFecha(fecha: string, de: PeriodoPlan, a: PeriodoPlan): string {
  if (!ISO.test(fecha)) return fecha;
  if (fecha === de.inicio) return a.inicio;
  if (fecha === de.fin) return a.fin;
  const ini1 = ISO.exec(de.inicio);
  const ini2 = ISO.exec(a.inicio);
  if (!ini1 || !ini2) return fecha;
  if (ini1[3] === "01" && ini2[3] === "01") return sumarMesesIso(fecha, (Number(ini2[1]) - Number(ini1[1])) * 12 + (Number(ini2[2]) - Number(ini1[2])));
  return sumarDiasIso(fecha, diasEntre(de.inicio, a.inicio));
}

interface ConFechas {
  fechaInicio: string | null;
  fechaFin: string | null;
}

/** Plan con sus fechas internas (reglas y bonus, que incluyen las penalizaciones) trasladadas al periodo nuevo, y cuántas fechas se han movido. */
export function ajustarFechasDelPlan<P extends { fechaInicio: string; fechaFin: string; reglas: ConFechas[]; bonus: ConFechas[] }>(plan: P, nuevo: PeriodoPlan): { plan: P; cambiadas: number } {
  const de: PeriodoPlan = { inicio: plan.fechaInicio, fin: plan.fechaFin };
  let cambiadas = 0;
  const mover = (r: ConFechas): ConFechas => {
    const ini = r.fechaInicio ? trasladarFecha(r.fechaInicio, de, nuevo) : null;
    const fin = r.fechaFin ? trasladarFecha(r.fechaFin, de, nuevo) : null;
    if (ini !== r.fechaInicio) cambiadas++;
    if (fin !== r.fechaFin) cambiadas++;
    return { ...r, fechaInicio: ini, fechaFin: fin };
  };
  return { plan: { ...plan, fechaInicio: nuevo.inicio, fechaFin: nuevo.fin, reglas: plan.reglas.map(mover) as P["reglas"], bonus: plan.bonus.map(mover) as P["bonus"] }, cambiadas };
}

/** Cuántas fechas internas tiene un plan (para avisar de lo que se va a ajustar). */
export function contarFechasInternas(plan: { reglas: ConFechas[]; bonus: ConFechas[] }): number {
  return [...plan.reglas, ...plan.bonus].reduce((t, r) => t + (r.fechaInicio ? 1 : 0) + (r.fechaFin ? 1 : 0), 0);
}
