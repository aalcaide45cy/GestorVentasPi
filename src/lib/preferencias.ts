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

/** Preferencia del navegador: permitir expedientes duplicados (para probar rápido). Por defecto, desactivada. */
export const CLAVE_PERMITIR_DUPLICADOS = "expedientes-permitir-duplicados";

/** Preferencia del navegador: escribir la etiqueta «COPIA» en los duplicados. Por defecto, activada (vale «false» si se desactiva). */
export const CLAVE_ETIQUETA_COPIA = "expedientes-etiqueta-copia";

/**
 * Preferencia del navegador: al leer un pedido, mostrar la ventana «Pedido leído» solo si la marca o el modelo no existen todavía
 * (o hay algo que decidir). Por defecto, desactivada: la ventana sale siempre.
 */
export const CLAVE_VENTANA_SOLO_SI_NUEVO = "pedidos-ventana-solo-si-falta-marca-modelo";

/** Preferencia del navegador: segundos que hay que dejar el ratón sobre el nombre de un cliente para ver su foto. Por defecto, 3. */
export const CLAVE_RETRASO_FOTO = "foto-cliente-retraso-segundos";
export const RETRASO_FOTO_POR_DEFECTO = 3;

/** Lectura puntual (fuera de componentes): ¿se permiten expedientes duplicados en este navegador? */
export function permitirDuplicadosAhora(): boolean {
  return leer(CLAVE_PERMITIR_DUPLICADOS) === "true";
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
