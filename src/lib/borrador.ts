"use client";

import { useEffect } from "react";

/**
 * Borradores de lo que se está editando: si se recarga la página (F5) o se cierra la pestaña sin querer, al volver se recupera lo
 * que había sin guardar. Viven en la pestaña (sessionStorage), así que no se mezclan entre pestañas ni quedan para siempre.
 */
const PREFIJO = "gv-borrador:";

export function leerBorrador<T = Record<string, unknown>>(clave: string): Partial<T> | null {
  try {
    const crudo = window.sessionStorage.getItem(PREFIJO + clave);
    return crudo ? (JSON.parse(crudo) as Partial<T>) : null;
  } catch {
    return null;
  }
}

export function borrarBorrador(clave: string): void {
  try {
    window.sessionStorage.removeItem(PREFIJO + clave);
  } catch {
    /* sin almacenamiento: no hay borrador */
  }
}

/** Guarda el borrador mientras haya cambios sin guardar (un momento después de teclear) y lo borra cuando ya no los hay. */
export function useGuardarBorrador(clave: string, valor: () => unknown, hayCambios: boolean): void {
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (hayCambios) window.sessionStorage.setItem(PREFIJO + clave, JSON.stringify(valor()));
        else window.sessionStorage.removeItem(PREFIJO + clave);
      } catch {
        /* el borrador es una comodidad: si no cabe, no pasa nada */
      }
    }, 400);
    return () => clearTimeout(t);
  });
}
