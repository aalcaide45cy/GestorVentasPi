/**
 * Rango de fechas del listado de expedientes («Desde / Hasta» y sus atajos). Todo con fechas «AAAA-MM-DD» en hora local, sin husos: una fecha de un
 * expediente se compara como texto, que con este formato ordena igual que el calendario.
 */
export type AtajoRango = "hoy" | "semana" | "mes" | "mes_pasado" | "anio";

export interface RangoFechas {
  desde: string;
  hasta: string;
}

export const RANGO_VACIO: RangoFechas = { desde: "", hasta: "" };

const dos = (n: number) => String(n).padStart(2, "0");
export const aIso = (d: Date): string => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

/** Las fechas del atajo respecto a `hoy` (la semana va de lunes a domingo). */
export function rangoDeAtajo(atajo: AtajoRango, hoy: Date = new Date()): RangoFechas {
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  switch (atajo) {
    case "hoy":
      return { desde: aIso(hoy), hasta: aIso(hoy) };
    case "semana": {
      const lunes = new Date(y, m, hoy.getDate() - ((hoy.getDay() + 6) % 7));
      const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
      return { desde: aIso(lunes), hasta: aIso(domingo) };
    }
    case "mes":
      return { desde: aIso(new Date(y, m, 1)), hasta: aIso(new Date(y, m + 1, 0)) };
    case "mes_pasado":
      return { desde: aIso(new Date(y, m - 1, 1)), hasta: aIso(new Date(y, m, 0)) };
    case "anio":
      return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
  }
}

/**
 * La fecha movida `meses` meses (negativo = hacia atrás), dejando el mismo día o el último del mes si no existe (31 de marzo - 1 mes = 28 de febrero).
 * Sin fecha parte de `hoy`.
 */
export function moverMeses(fecha: string, meses: number, hoy: Date = new Date()): string {
  const [y, m, d] = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha.split("-").map(Number) : [hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate()];
  const total = y * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = total % 12;
  const ultimo = new Date(anio, mes + 1, 0).getDate();
  return aIso(new Date(anio, mes, Math.min(d, ultimo)));
}

const valida = (f: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(f);

/** El rango con las fechas bien formadas y, si «desde» es posterior a «hasta», cambiadas de sitio. */
export function normalizarRango(r: RangoFechas): RangoFechas {
  const desde = valida(r.desde) ? r.desde : "";
  const hasta = valida(r.hasta) ? r.hasta : "";
  return desde && hasta && desde > hasta ? { desde: hasta, hasta: desde } : { desde, hasta };
}

export const hayRango = (r: RangoFechas): boolean => valida(r.desde) || valida(r.hasta);

/** ¿La fecha cae dentro del rango (inclusive)? Sin fecha no entra en un rango puesto. */
export function enRango(fecha: string | null | undefined, rango: RangoFechas): boolean {
  const r = normalizarRango(rango);
  if (!r.desde && !r.hasta) return true;
  if (!fecha) return false;
  const f = fecha.slice(0, 10);
  if (r.desde && f < r.desde) return false;
  if (r.hasta && f > r.hasta) return false;
  return true;
}

const dmy = (f: string) => f.split("-").reverse().join("/");

/** «del 01/10/2026 al 22/10/2026», «desde el …» o «hasta el …». */
export function textoRango(rango: RangoFechas): string {
  const r = normalizarRango(rango);
  if (r.desde && r.hasta) return r.desde === r.hasta ? `el ${dmy(r.desde)}` : `del ${dmy(r.desde)} al ${dmy(r.hasta)}`;
  if (r.desde) return `desde el ${dmy(r.desde)}`;
  if (r.hasta) return `hasta el ${dmy(r.hasta)}`;
  return "";
}
