/** Hasta cuántas asignaciones se nombran en un aviso (el resto se cuenta). */
export const MAX_ASIGNACIONES_AVISO = 5;

/**
 * Frase para añadir al aviso de una tanda de pedidos o de pagos de RCI: a qué expediente va cada uno («Ana Ruiz → completa el expediente nº 12»). Vacía si no
 * hay nada que decir.
 */
export function textoAsignaciones(asignaciones: string[], titulo = "Asignación"): string {
  if (asignaciones.length === 0) return "";
  const nombradas = asignaciones.slice(0, MAX_ASIGNACIONES_AVISO).join("; ");
  const resto = asignaciones.length - MAX_ASIGNACIONES_AVISO;
  return ` ${titulo}${titulo === "Asignado" && asignaciones.length !== 1 ? "s" : ""}: ${nombradas}${resto > 0 ? ` y ${resto} más` : ""}.`;
}
