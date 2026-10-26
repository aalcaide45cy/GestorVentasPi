/**
 * Paneles del Dashboard que se pueden mover (con el candado) y mostrar u ocultar (Configuración › Dashboard). El orden, los ocultos y el número de
 * «Últimos expedientes» se guardan en el navegador de cada persona.
 */
export const PANELES_DASHBOARD = [
  { id: "validacion", titulo: "Validación de comisiones pendiente", ayuda: "El aviso de rejillas por validar (solo sale cuando hay algo pendiente)" },
  { id: "metricas", titulo: "Métricas del mes", ayuda: "Objetivo del mes, expedientes del mes, totales, clientes y tipos de pago" },
  { id: "documentos", titulo: "Pedidos y pagos", ayuda: "Las cajas de arrastre de pedidos y pagos de RCI y la cola de pedidos" },
  { id: "recientes", titulo: "Últimos expedientes activos", ayuda: "La tabla de los últimos expedientes" },
  { id: "rapida", titulo: "Crear un expediente con un clic", ayuda: "El acceso rápido a modelos y formas de pago" },
] as const;

export type IdPanelDashboard = (typeof PANELES_DASHBOARD)[number]["id"];

export const CLAVE_DASH_ORDEN = "dash-orden-paneles";
export const CLAVE_DASH_OCULTOS = "dash-paneles-ocultos";
export const CLAVE_DASH_RECIENTES = "dash-n-recientes";
/** Si «Últimos expedientes activos» pinta las filas con las reglas de color de Expedientes (Configuración › Expedientes › Colores de fila). Por defecto, sí. */
export const CLAVE_DASH_COLORES = "dash-colores-filas";

export const RECIENTES_POR_DEFECTO = 5;
export const RECIENTES_MAXIMO = 50;

const IDS: string[] = PANELES_DASHBOARD.map((p) => p.id);

function lista(guardado: string | null): string[] {
  try {
    const v: unknown = guardado ? JSON.parse(guardado) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Orden guardado completado con los paneles que falten (por ejemplo, uno nuevo) y sin los que ya no existan. */
export function ordenPanelesDashboard(guardado: string | null): IdPanelDashboard[] {
  const propios = [...new Set(lista(guardado).filter((id) => IDS.includes(id)))];
  return [...propios, ...IDS.filter((id) => !propios.includes(id))] as IdPanelDashboard[];
}

export function panelesOcultosDashboard(guardado: string | null): IdPanelDashboard[] {
  return [...new Set(lista(guardado).filter((id) => IDS.includes(id)))] as IdPanelDashboard[];
}

/** Cuántos expedientes enseña «Últimos expedientes activos» (de 1 a 50; si no hay valor válido, 5). */
export function recientesDashboard(guardado: string | null): number {
  const n = Number(guardado);
  return guardado !== null && guardado !== "" && Number.isInteger(n) && n >= 1 && n <= RECIENTES_MAXIMO ? n : RECIENTES_POR_DEFECTO;
}

/** Mueve `id` a la posición de `destino` dentro de `orden` (arrastrar y soltar). */
export function moverPanel(orden: IdPanelDashboard[], id: IdPanelDashboard, destino: IdPanelDashboard): IdPanelDashboard[] {
  if (id === destino) return orden;
  const sin = orden.filter((x) => x !== id);
  sin.splice(sin.indexOf(destino) + (orden.indexOf(id) < orden.indexOf(destino) ? 1 : 0), 0, id);
  return sin;
}

/** ¿Se pintan las filas de la tabla del Dashboard con las reglas de color? Sí, salvo que se haya desactivado. */
export const coloresFilasDashboard = (guardado: string | null): boolean => guardado !== "false";
