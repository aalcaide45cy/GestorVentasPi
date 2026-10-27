/**
 * Qué preferencias del navegador se guardan también en la base de datos, por usuario, para que sean las mismas en cualquier equipo (el PC, el Mac, el
 * móvil…). Lo comparten el navegador y el servidor: el servidor solo acepta estas claves.
 *
 * Se guarda casi todo: ajustes, columnas, filtros, reglas de color, pestañas abiertas, mes que se mira, menú lateral, paleta de colores…
 * Quedan solo en el navegador lo que sería peligroso o confuso llevarse a otro equipo: los candados de selección y eliminación (desbloquear uno no debe
 * desbloquear el otro), el modo «permitir duplicados» de pruebas, el tema claro/oscuro (se aplica antes de cargar la página), el borrador de una
 * lectura a medias y la lista de expedientes visibles en ese momento.
 */

const PREFIJOS = [
  "exp-", "clientes-", "tabla-", "plegable-", "panel-", "desglose-", "mostrar-anulados-", "mostrar-deshabilitados-", "foto-cliente-",
  "subpestana-", "cotejo-", "laboratorio-", "pagos-rci-",
];
const EXACTAS = [
  "dash-orden-paneles", "dash-paneles-ocultos", "dash-n-recientes", "dash-colores-filas", "dash-docs-pestana", "expedientes-etiqueta-copia",
  "pedidos-ventana-solo-si-falta-marca-modelo", "config-pestana", "herramientas-pestana", "sidebar-collapsed", "paleta-colores",
];
/** Dentro de los prefijos de arriba, lo que no debe viajar entre equipos. */
const EXCLUIDAS = ["exp-seleccion-desde", "exp-borrado-desde"];

export const MAX_CLAVE_PREFERENCIA = 120;
export const MAX_VALOR_PREFERENCIA = 200_000;
export const MAX_PREFERENCIAS_POR_PETICION = 200;

export function esPreferenciaSincronizada(clave: string): boolean {
  if (clave.length === 0 || clave.length > MAX_CLAVE_PREFERENCIA) return false;
  if (EXCLUIDAS.some((e) => clave.startsWith(e))) return false;
  return EXACTAS.includes(clave) || PREFIJOS.some((p) => clave.startsWith(p));
}
