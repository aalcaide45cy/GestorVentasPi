"use client";

import { useEffect } from "react";
import { ayudaPara } from "@/lib/ayudas";

const SELECTOR = "button, a, label, th, summary, input, select, textarea, [role='tab'], [role='button']";

/** Texto con el que se identifica un elemento para buscar su ayuda. */
function textoDe(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const etiqueta = el.labels?.[0]?.textContent;
    if (etiqueta) return etiqueta;
    return el.getAttribute("aria-label") ?? ("placeholder" in el ? (el as HTMLInputElement).placeholder : "") ?? "";
  }
  return el.getAttribute("aria-label") ?? el.textContent ?? "";
}

/**
 * Ayuda al pasar el ratón por cualquier opción de la aplicación: al entrar en un botón, enlace, etiqueta, cabecera o campo sin
 * `title` propio, le asigna uno según su texto (diccionario en `lib/ayudas.ts`). Un único escuchador para toda la página.
 */
export default function AyudaEmergente() {
  useEffect(() => {
    const poner = (e: Event) => {
      const origen = e.target;
      if (!(origen instanceof Element)) return;
      const el = origen.closest<HTMLElement>(SELECTOR);
      if (!el || el.hasAttribute("title") || el.hasAttribute("data-sin-ayuda")) return;
      const ayuda = ayudaPara(textoDe(el));
      if (ayuda) el.setAttribute("title", ayuda);
      else el.setAttribute("data-sin-ayuda", "");
    };
    document.addEventListener("mouseover", poner, true);
    document.addEventListener("focusin", poner, true);
    return () => {
      document.removeEventListener("mouseover", poner, true);
      document.removeEventListener("focusin", poner, true);
    };
  }, []);
  return null;
}
