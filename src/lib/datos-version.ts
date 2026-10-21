"use client";

import { useSyncExternalStore } from "react";

/**
 * Versión de los datos de la aplicación: al deshacer o rehacer se avisa con `avisarCambioDeDatos` y todo lo que se carga con
 * `useCarga` se vuelve a pedir solo, sin recargar la página (la página conserva el scroll y lo que se estaba haciendo).
 */
let version = 0;
const oyentes = new Set<() => void>();

export function avisarCambioDeDatos(): void {
  version += 1;
  oyentes.forEach((avisar) => avisar());
}

let pendiente: ReturnType<typeof setTimeout> | null = null;
/**
 * Avisa del cambio de datos cuando pasa un momento sin más cambios (una operación con muchas peticiones, como crear cien expedientes, solo
 * provoca una recarga al final). Lo llaman las escrituras a la API para que listas, contadores y avisos se pongan al día sin recargar la página.
 */
export function avisarCambioDeDatosTrasPausa(esperaMs = 600): void {
  if (pendiente) clearTimeout(pendiente);
  pendiente = setTimeout(() => {
    pendiente = null;
    avisarCambioDeDatos();
  }, esperaMs);
}

export function useVersionDatos(): number {
  return useSyncExternalStore(
    (avisar) => {
      oyentes.add(avisar);
      return () => oyentes.delete(avisar);
    },
    () => version,
    () => 0,
  );
}
