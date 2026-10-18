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
