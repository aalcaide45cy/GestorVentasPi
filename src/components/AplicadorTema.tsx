"use client";

import { useEffect } from "react";
import { guardarPreferencia } from "@/lib/preferencias";
import { COOKIE_TEMA, VARIABLES_TEMA, variablesTema } from "@/lib/temas";

declare global {
  interface Window {
    __gvTema?: (id: string) => void;
  }
}

/**
 * Cambia el tema de colores desde el navegador (`window.__gvTema(id)`). El tema elegido se guarda en el navegador y en una cookie,
 * y el servidor pinta cada página ya con sus colores. También recoge el tema que alguien tenía guardado antes de existir la cookie.
 */
export default function AplicadorTema() {
  useEffect(() => {
    const raiz = document.documentElement;
    const aplicar = (id: string) => {
      const { claro, vars } = variablesTema(id);
      for (const n of VARIABLES_TEMA) raiz.style.removeProperty(n);
      for (const [n, v] of Object.entries(vars)) raiz.style.setProperty(n, v);
      raiz.setAttribute("data-theme", claro ? "light" : "dark");
      try {
        localStorage.setItem("theme", claro ? "light" : "dark");
        localStorage.setItem("colorTheme", id);
      } catch {
        /* sin almacenamiento local */
      }
      document.cookie = `${COOKIE_TEMA}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
      // El tema elegido viaja con la persona a cualquier equipo (se guarda también en su perfil)
      guardarPreferencia("perfil-tema", id);
    };
    window.__gvTema = aplicar;
    if (!document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE_TEMA}=`))) {
      try {
        const guardado = localStorage.getItem("colorTheme") ?? (localStorage.getItem("theme") === "light" ? "claro" : null);
        if (guardado) aplicar(guardado);
      } catch {
        /* sin almacenamiento local */
      }
    }
  }, []);
  return null;
}
