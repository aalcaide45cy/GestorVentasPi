"use client";

import { useSyncExternalStore } from "react";

type Tema = "light" | "dark";

function leerTema(): Tema {
  const actual = document.documentElement.getAttribute("data-theme");
  if (actual === "light" || actual === "dark") return actual;
  try {
    const guardado = localStorage.getItem("theme");
    if (guardado === "light" || guardado === "dark") return guardado;
  } catch {
    /* sin almacenamiento local */
  }
  return "dark";
}

function suscribirTema(avisar: () => void): () => void {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observador.disconnect();
}

export default function ThemeToggle() {
  // El tema inicial lo fija el script de la cabecera en el atributo del html; se observa su cambio.
  const theme = useSyncExternalStore(suscribirTema, leerTema, () => "dark" as Tema);

  const alternar = () => {
    const siguiente: Tema = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("theme", siguiente);
    } catch {
      /* sin almacenamiento local */
    }
    document.documentElement.setAttribute("data-theme", siguiente);
  };

  return (
    <button
      type="button"
      onClick={alternar}
      className="glass-panel-interactive"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "42px",
        height: "42px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border-light)",
        color: "var(--text-primary)",
        background: "var(--bg-btn-secondary)",
        cursor: "pointer",
        padding: 0,
        outline: "none",
      }}
      title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      {theme === "dark" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
