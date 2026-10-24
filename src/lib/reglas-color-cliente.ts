"use client";

import { useMemo } from "react";
import { CLAVE_COLOR_PEDIDO_DESTACADO, CLAVE_DIAS_PEDIDO_DESTACADO, CLAVE_FUERZA_PEDIDO_DESTACADO, COLOR_PEDIDO_DESTACADO_POR_DEFECTO, leerDiasPedidoDestacado, usePreferencia } from "./preferencias";
import { leerEsquemas, leerReglas, reglaPedidosRecientes, type EsquemaReglas, type ReglaColor } from "./reglas-color";

export const CLAVE_REGLAS_COLOR = "exp-reglas-color";
export const CLAVE_ESQUEMAS_COLOR = "exp-esquemas-color";

/**
 * Reglas de color de las filas de Expedientes de este navegador. Mientras no se haya guardado ninguna, vale la regla «Pedidos recientes» hecha con lo que
 * se tenía configurado antes de que existieran las reglas (días, color e intensidad), para no perder nada.
 */
export function useReglasColor(): [ReglaColor[], (reglas: ReglaColor[]) => void] {
  const [guardado, fijar] = usePreferencia(CLAVE_REGLAS_COLOR);
  const [dias] = usePreferencia(CLAVE_DIAS_PEDIDO_DESTACADO);
  const [color] = usePreferencia(CLAVE_COLOR_PEDIDO_DESTACADO);
  const [fuerza] = usePreferencia(CLAVE_FUERZA_PEDIDO_DESTACADO);
  const reglas = useMemo(
    () => leerReglas(guardado, [reglaPedidosRecientes(leerDiasPedidoDestacado(dias), color ?? COLOR_PEDIDO_DESTACADO_POR_DEFECTO, fuerza)]),
    [guardado, dias, color, fuerza],
  );
  return [reglas, (nuevas) => fijar(JSON.stringify(nuevas))];
}

/** Esquemas de reglas guardados con nombre en este navegador. */
export function useEsquemasColor(): [EsquemaReglas[], (esquemas: EsquemaReglas[]) => void] {
  const [guardado, fijar] = usePreferencia(CLAVE_ESQUEMAS_COLOR);
  const esquemas = useMemo(() => leerEsquemas(guardado), [guardado]);
  return [esquemas, (nuevos) => fijar(JSON.stringify(nuevos))];
}
