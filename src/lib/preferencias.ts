"use client";

import { useCallback, useSyncExternalStore } from "react";
import { esPreferenciaSincronizada } from "./preferencias-sincronizadas";

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

/** Preferencia del navegador: durante cuántos días, desde que se hace el pedido, la fila de Expedientes sale con fondo azulado. 0 = nunca. Por defecto, 3. */
export const CLAVE_DIAS_PEDIDO_DESTACADO = "exp-dias-pedido-destacado";
export const DIAS_PEDIDO_DESTACADO_POR_DEFECTO = 3;
export const MAX_DIAS_PEDIDO_DESTACADO = 365;

/** Días configurados a partir de lo guardado (vacío o no válido = el valor por defecto). */
export function leerDiasPedidoDestacado(guardado: string | null): number {
  const n = Number(guardado);
  return guardado !== null && guardado !== "" && Number.isInteger(n) && n >= 0 && n <= MAX_DIAS_PEDIDO_DESTACADO ? n : DIAS_PEDIDO_DESTACADO_POR_DEFECTO;
}

/** Color y fuerza del fondo de los pedidos recientes (Configuración › Expedientes › Lista). Por defecto, azul y fuerza media. */
export const CLAVE_COLOR_PEDIDO_DESTACADO = "exp-color-pedido-destacado";
export const CLAVE_FUERZA_PEDIDO_DESTACADO = "exp-fuerza-pedido-destacado";
export const COLOR_PEDIDO_DESTACADO_POR_DEFECTO = "#3b82f6";
export const FUERZAS_PEDIDO_DESTACADO = [
  { clave: "suave", texto: "Suave", alfa: 0.1 },
  { clave: "media", texto: "Media", alfa: 0.18 },
  { clave: "fuerte", texto: "Fuerte", alfa: 0.32 },
] as const;
export const COLORES_PEDIDO_DESTACADO = [
  { texto: "Azul", color: "#3b82f6" },
  { texto: "Celeste", color: "#0ea5e9" },
  { texto: "Turquesa", color: "#14b8a6" },
  { texto: "Verde", color: "#22c55e" },
  { texto: "Lima", color: "#a3e635" },
  { texto: "Amarillo", color: "#facc15" },
  { texto: "Naranja", color: "#f97316" },
  { texto: "Rojo", color: "#ef4444" },
  { texto: "Rosa", color: "#ec4899" },
  { texto: "Morado", color: "#8b5cf6" },
  { texto: "Gris", color: "#94a3b8" },
] as const;

/** Fondo (con transparencia, para que sirva en tema claro y oscuro) a partir del color y la fuerza guardados. */
export function fondoPedidoDestacado(color: string | null, fuerza: string | null): string {
  const hex = color && /^#[0-9a-f]{6}$/i.test(color) ? color : COLOR_PEDIDO_DESTACADO_POR_DEFECTO;
  const alfa = (FUERZAS_PEDIDO_DESTACADO.find((f) => f.clave === fuerza) ?? FUERZAS_PEDIDO_DESTACADO[1]).alfa;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

/** Lectura puntual (fuera de componentes): ¿se permiten expedientes duplicados en este navegador? */
export function permitirDuplicadosAhora(): boolean {
  return leer(CLAVE_PERMITIR_DUPLICADOS) === "true";
}

// Las preferencias de ajustes (ver `preferencias-sincronizadas.ts`) se guardan también en el servidor, por usuario. Los cambios se juntan unos instantes y se mandan de una vez.
let sincronizacionActiva = false;
const pendientesDeEnviar = new Map<string, string>();
let temporizadorEnvio: ReturnType<typeof setTimeout> | null = null;

function enviarPendientes(): void {
  temporizadorEnvio = null;
  if (pendientesDeEnviar.size === 0) return;
  const valores = Object.fromEntries(pendientesDeEnviar);
  pendientesDeEnviar.clear();
  fetch("/api/preferencias", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ valores }), keepalive: true }).catch(() => undefined);
}

/** La llama el sincronizador cuando ya ha traído las preferencias del servidor: desde ahí, cada cambio también se guarda allí. */
export function activarSincronizacion(): void {
  sincronizacionActiva = true;
}

/** Guarda una preferencia del navegador (y, si es de ajustes, también en el servidor) y avisa a los componentes que la leen. */
export function guardarPreferencia(clave: string, valor: string, opciones: { soloLocal?: boolean } = {}): void {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: la preferencia no se recuerda */
  }
  window.dispatchEvent(new Event(EVENTO));
  if (opciones.soloLocal || !sincronizacionActiva || !esPreferenciaSincronizada(clave)) return;
  pendientesDeEnviar.set(clave, valor);
  if (temporizadorEnvio === null) temporizadorEnvio = setTimeout(enviarPendientes, 600);
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
