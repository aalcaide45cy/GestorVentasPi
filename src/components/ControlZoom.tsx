"use client";

import { useState } from "react";
import { COOKIE_ZOOM, ZOOM_MAX, ZOOM_MIN, ZOOM_NORMAL, factorZoom, moverZoom, zoomValido } from "@/lib/zoom";

const boton = { width: "34px", height: "34px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)", background: "var(--bg-btn-secondary)", color: "var(--text-primary)", cursor: "pointer", fontSize: "1.05rem", fontWeight: 700, padding: 0 } as const;

/**
 * Tamaño de la página para este navegador (de 60 % a 200 %), para adaptarla a cada pantalla y resolución. Se guarda en una cookie y el
 * servidor ya pinta la primera vista a ese tamaño; se aplica al momento con la propiedad CSS `zoom` de la página.
 */
export default function ControlZoom({ inicial }: { inicial: number }) {
  const [valor, setValor] = useState(zoomValido(inicial));
  const poner = (n: number) => {
    setValor(n);
    document.documentElement.style.zoom = String(factorZoom(n));
    document.documentElement.style.setProperty("--z", String(factorZoom(n)));
    document.cookie = `${COOKIE_ZOOM}=${n}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "space-between" }} title="Tamaño de la página en este navegador (de 60 % a 200 %, de 1 en 1): pensado para adaptarla a cada pantalla">
      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>🔍 Tamaño</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <button type="button" style={boton} onClick={() => poner(moverZoom(valor, -1))} disabled={valor === ZOOM_MIN} aria-label="Hacer la página más pequeña" title="Un 1 % más pequeño">
          −
        </button>
        <button type="button" onClick={() => poner(ZOOM_NORMAL)} style={{ ...boton, width: "58px", fontSize: "0.82rem" }} title={valor === ZOOM_NORMAL ? "Tamaño normal" : "Volver al tamaño normal (100 %)"}>
          {valor} %
        </button>
        <button type="button" style={boton} onClick={() => poner(moverZoom(valor, 1))} disabled={valor === ZOOM_MAX} aria-label="Hacer la página más grande" title="Un 1 % más grande">
          +
        </button>
      </span>
    </div>
  );
}
