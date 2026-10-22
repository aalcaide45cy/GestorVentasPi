/**
 * Expedientes «anulados»: los que el listado de la intranet del fabricante marca como Anulado (se guarda en `estado_intranet` al leer el Excel con
 * «Completa matrícula, bastidor, fechas…»). No son ventas: en cualquier listado de expedientes salen ocultos y solo se enseñan si se activa la casilla
 * «Mostrar anulados» de esa pantalla.
 */
export const esAnulado = (estadoIntranet: string | null | undefined): boolean => /anulad/i.test(estadoIntranet ?? "");

/** Preferencia del navegador de cada pantalla (`true` = enseñar también los anulados). Por defecto, ocultos. */
export const claveMostrarAnulados = (pantalla: string): string => `mostrar-anulados-${pantalla}`;

/** Preferencia del navegador de cada pantalla (`true` = enseñar y contar también los expedientes deshabilitados). Por defecto, no. */
export const claveMostrarDeshabilitados = (pantalla: string): string => `mostrar-deshabilitados-${pantalla}`;
