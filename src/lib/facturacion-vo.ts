/**
 * Fecha de facturación por defecto de un usado (VO): la de la RCI (contratación de la financiera) y, si no la tiene porque
 * es de contado, el último día del mes en que se hizo el pedido (la fecha del expediente). Las fechas son «AAAA-MM-DD».
 */
export function facturacionPorDefectoVo(fechaRci: string | null | undefined, fechaExpediente: string | null | undefined): string | null {
  if (fechaRci) return fechaRci;
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(fechaExpediente ?? "");
  if (!m) return null;
  const ultimo = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return `${m[1]}-${m[2]}-${String(ultimo).padStart(2, "0")}`;
}
