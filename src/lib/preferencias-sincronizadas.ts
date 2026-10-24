/**
 * Qué preferencias del navegador se guardan también en la base de datos, por usuario, para que sean las mismas en cualquier equipo (el PC, el Mac, el
 * móvil…). Lo comparten el navegador y el servidor: el servidor solo acepta estas claves.
 *
 * Quedan solo en el navegador lo que depende del equipo o de lo que se está haciendo en ese momento: la pestaña abierta, el mes que se mira, el
 * zoom, el tema, la cola de pedidos, los filtros del momento y el modo «permitir duplicados» de pruebas.
 */

const PREFIJOS = ["exp-", "clientes-", "tabla-", "plegable-", "panel-", "desglose-", "mostrar-anulados-", "mostrar-deshabilitados-", "foto-cliente-"];
const EXACTAS = ["dash-orden-paneles", "dash-paneles-ocultos", "dash-n-recientes", "expedientes-etiqueta-copia", "pedidos-ventana-solo-si-falta-marca-modelo"];
/** Dentro de los prefijos de arriba, lo que es estado de pantalla del momento. */
const EXCLUIDAS = ["exp-resumen-", "exp-filtros-guardados", "exp-filtros-abiertos", "exp-seleccion-desde", "exp-borrado-desde"];

export const MAX_CLAVE_PREFERENCIA = 120;
export const MAX_VALOR_PREFERENCIA = 200_000;
export const MAX_PREFERENCIAS_POR_PETICION = 200;

export function esPreferenciaSincronizada(clave: string): boolean {
  if (clave.length === 0 || clave.length > MAX_CLAVE_PREFERENCIA) return false;
  if (EXCLUIDAS.some((e) => clave.startsWith(e))) return false;
  return EXACTAS.includes(clave) || PREFIJOS.some((p) => clave.startsWith(p));
}
