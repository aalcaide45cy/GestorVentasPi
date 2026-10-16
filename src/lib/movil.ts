"use client";

import { useSyncExternalStore } from "react";

/** Ancho máximo (px) en el que el menú lateral pasa a ser un cajón y la pantalla se adapta al móvil. Debe coincidir con globals.css. */
export const ANCHO_MOVIL = 900;

const CONSULTA = `(max-width: ${ANCHO_MOVIL}px)`;

function suscribir(avisar: () => void): () => void {
  const m = window.matchMedia(CONSULTA);
  m.addEventListener("change", avisar);
  return () => m.removeEventListener("change", avisar);
}

/** ¿La pantalla es de móvil o tableta pequeña? (en el servidor y en el primer pintado, no). */
export function useMovil(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  );
}

/** Abre o cierra el cajón del menú lateral en móvil. */
export function fijarMenuAbierto(abierto: boolean): void {
  document.body.classList.toggle("menu-abierto", abierto);
}
