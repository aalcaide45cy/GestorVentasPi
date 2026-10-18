/**
 * Lo que falta en un expediente pero no impide guardarlo. Las pantallas avisan con estos textos y señalan el campo con un resplandor
 * (ver `señalarCampo`). Al crear un expediente se pasa la lista en la dirección de la pantalla de edición (`?falta=fRci,nombre`).
 */
export const MENSAJE_CAMPO_FALTANTE: Record<string, string> = {
  fRci: "Falta la fecha RCI (contratación de la financiera): el tipo de pago la pide para matricular o facturar. Se ha guardado igualmente; indícala cuando la tengas.",
  nombre: "Falta el nombre del cliente: se ha guardado el expediente, pero no los datos del cliente (un cliente necesita al menos su nombre).",
  fCobrado: "Has marcado que se cobró en otra fecha pero falta esa fecha: el expediente se ha guardado sin ella.",
};

/** Dirección de la pantalla de edición de un expediente, con los campos que faltan para señalarlos al abrirla. */
export function direccionDeEdicion(idExpediente: number, faltan: string[]): string {
  return `/dashboard/expedientes/editar/${idExpediente}${faltan.length > 0 ? `?falta=${encodeURIComponent(faltan.join(","))}` : ""}`;
}
