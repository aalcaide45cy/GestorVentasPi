"use client";

import { useEffect } from "react";

const RE_CANCELAR = /^(cancelar|cerrar|no|volver|descartar|salir)\b/i;
const RE_ACEPTAR = /^(aceptar|guardar|confirmar|s[ií]|eliminar|borrar|continuar|crear|entendido|ok)\b/i;

/** Devuelve el contenedor de modal abierto (fixed/absolute casi a pantalla completa y z-index >= 100). */
function buscarModal(): HTMLElement | null {
  let encontrado: HTMLElement | null = null;
  for (const el of document.body.querySelectorAll<HTMLElement>("div")) {
    const estilo = getComputedStyle(el);
    if (estilo.position !== "fixed" && estilo.position !== "absolute") continue;
    if (Number.parseInt(estilo.zIndex, 10) < 100) continue;
    const r = el.getBoundingClientRect();
    if (r.width < window.innerWidth * 0.9 || r.height < window.innerHeight * 0.9) continue;
    encontrado = el;
  }
  return encontrado;
}

/** Un botón con `data-tecla="escape"` o `data-tecla="enter"` manda sobre el reparto por texto. */
function pulsarMarcado(modal: HTMLElement, tecla: "escape" | "enter"): boolean {
  const b = modal.querySelector<HTMLButtonElement>(`button[data-tecla="${tecla}"]:not([disabled])`);
  if (!b) return false;
  b.click();
  return true;
}

function pulsar(modal: HTMLElement, patron: RegExp): boolean {
  for (const b of modal.querySelectorAll<HTMLButtonElement>("button:not([disabled])")) {
    const texto = (b.textContent ?? "").replace(/[^\p{L}\p{N}\s]/gu, "").trim();
    if (patron.test(texto)) {
      b.click();
      return true;
    }
  }
  return false;
}

/** Esc pulsa cancelar/cerrar; Enter pulsa el botón principal (salvo en campos de varias líneas, desplegables y botones). */
export default function GlobalModalKeyboardHandler() {
  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      const modal = buscarModal();
      if (!modal) return;
      if (e.key === "Escape") {
        if (pulsarMarcado(modal, "escape") || pulsar(modal, RE_CANCELAR)) e.preventDefault();
        return;
      }
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement) return;
      if (pulsarMarcado(modal, "enter") || pulsar(modal, RE_ACEPTAR)) e.preventDefault();
    }
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, []);
  return null;
}
