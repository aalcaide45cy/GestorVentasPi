/**
 * Qué preferencias del navegador se guardan también en la base de datos, por usuario, para que sean las mismas en cualquier equipo (el PC, el Mac, el
 * móvil…). Lo comparten el navegador y el servidor: el servidor solo acepta estas claves.
 *
 * Se guarda todo lo que es de la persona: ajustes, columnas, filtros, reglas de color, pestañas abiertas, mes que se mira, menú lateral, paleta de
 * colores, candados de selección y eliminación, el tema y el tamaño de la página… Solo quedan en el navegador lo que es del momento y no sirve en otro
 * equipo: el borrador de una lectura a medias y la lista de expedientes visibles ahora mismo.
 */

const PREFIJOS = [
  "exp-", "clientes-", "tabla-", "plegable-", "panel-", "desglose-", "mostrar-anulados-", "mostrar-deshabilitados-", "foto-cliente-",
  "subpestana-", "cotejo-", "laboratorio-", "pagos-rci-",
];
const EXACTAS = [
  "dash-orden-paneles", "dash-paneles-ocultos", "dash-n-recientes", "dash-colores-filas", "dash-docs-pestana", "expedientes-etiqueta-copia",
  "pedidos-ventana-solo-si-falta-marca-modelo", "config-pestana", "herramientas-pestana", "sidebar-collapsed", "paleta-colores", "expedientes-permitir-duplicados", "perfil-tema", "perfil-zoom",
];
/** Dentro de los prefijos de arriba, lo que no debe viajar entre equipos (ahora nada). */
const EXCLUIDAS: string[] = [];

export const MAX_CLAVE_PREFERENCIA = 120;
export const MAX_VALOR_PREFERENCIA = 200_000;
export const MAX_PREFERENCIAS_POR_PETICION = 200;

export function esPreferenciaSincronizada(clave: string): boolean {
  if (clave.length === 0 || clave.length > MAX_CLAVE_PREFERENCIA) return false;
  if (EXCLUIDAS.some((e) => clave.startsWith(e))) return false;
  return EXACTAS.includes(clave) || PREFIJOS.some((p) => clave.startsWith(p));
}
