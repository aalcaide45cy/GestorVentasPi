"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENTO = "gv-preferencia";

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function suscribir(avisar: () => void): () => void {
  window.addEventListener("storage", avisar);
  window.addEventListener(EVENTO, avisar);
  return () => {
    window.removeEventListener("storage", avisar);
    window.removeEventListener(EVENTO, avisar);
  };
}

/** Guarda una preferencia del navegador y avisa a los componentes que la leen. */
export function guardarPreferencia(clave: string, valor: string): void {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: la preferencia no se recuerda */
  }
  window.dispatchEvent(new Event(EVENTO));
}

/**
 * Lee una preferencia de `localStorage` sin romper la hidratación: en el servidor y en el primer
 * pintado vale `null`; después, el valor guardado.
 */
export function usePreferencia(clave: string): [string | null, (valor: string) => void] {
  const valor = useSyncExternalStore(
    suscribir,
    () => leer(clave),
    () => null,
  );
  const fijar = useCallback((nuevo: string) => guardarPreferencia(clave, nuevo), [clave]);
  return [valor, fijar];
}
