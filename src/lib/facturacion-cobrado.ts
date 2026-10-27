/**
 * Un coche nuevo (VN) que el listado de la intranet deja en «Matriculación», «Post-venta» o «Archivado» ya está cobrado: cuenta para comisionar
 * desde su fecha de facturación, se matricule cuando se matricule. Si le falta esa fecha, se propone la de matriculación (si ya la tiene) o, si no,
 * la del día de la carga. Nunca se pisa una fecha ya puesta (en la aplicación o en el listado). Las fechas son «AAAA-MM-DD».
 */
const sinAcentos = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const ESTADOS_COBRADOS = new Set(["matriculacion", "post-venta", "post venta", "postventa", "archivado"]);

export const estadoYaCobrado = (estadoIntranet: string | null | undefined): boolean => ESTADOS_COBRADOS.has(sinAcentos(estadoIntranet ?? ""));

export function facturacionPorEstadoCobrado(datos: {
  esUsado: boolean;
  estadoListado: string | null | undefined;
  facturacionActual: string | null | undefined;
  facturacionListado: string | null | undefined;
  matriculacion: string | null | undefined;
  hoy: string;
}): string | null {
  if (datos.esUsado || datos.facturacionActual || datos.facturacionListado) return null;
  if (!estadoYaCobrado(datos.estadoListado)) return null;
  return datos.matriculacion || datos.hoy;
}
