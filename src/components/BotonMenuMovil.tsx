"use client";

import { fijarMenuAbierto } from "@/lib/movil";

/** Botón de las tres rayas que abre el menú lateral en pantallas pequeñas (en escritorio no se ve). */
export default function BotonMenuMovil() {
  return (
    <button type="button" className="btn btn-secondary boton-menu-movil" onClick={() => fijarMenuAbierto(true)} title="Abrir el menú" aria-label="Abrir el menú">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  );
}
