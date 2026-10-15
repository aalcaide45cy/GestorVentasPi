"use client";

import { useState } from "react";
import { TEMAS, TEMA_CLARO, TEMA_OSCURO, muestraTema, type TemaColor } from "@/lib/temas";
import { estiloPanel } from "./utilidades";

declare global {
  interface Window {
    __gvTema?: (id: string) => void;
  }
}

const OFICIALES: TemaColor[] = [
  { id: TEMA_OSCURO, nombre: "Oscuro (original)", modo: "dark", p: 255, s: 195, a: 335, f: 230, g: 25, n: 8, v: 0 },
  { id: TEMA_CLARO, nombre: "Claro (original)", modo: "light", p: 255, s: 195, a: 335, f: 220, g: 30, n: 96, v: 0 },
];

function temaGuardado(): string {
  try {
    return localStorage.getItem("colorTheme") ?? (localStorage.getItem("theme") === "light" ? TEMA_CLARO : TEMA_OSCURO);
  } catch {
    return TEMA_OSCURO;
  }
}

/** Pestaña «Tema»: 152 combinaciones de color (2 originales + 150 nuevas, con distintos grados de claridad). Se guarda en este navegador. */
export default function PestanaTemas() {
  const [actual, setActual] = useState(temaGuardado);
  const [filtro, setFiltro] = useState<"todos" | "dark" | "light">("todos");
  const [variante, setVariante] = useState<"todas" | "0" | "1" | "2">("todas");

  const elegir = (id: string) => {
    window.__gvTema?.(id);
    setActual(id);
  };

  const lista = [...OFICIALES, ...TEMAS].filter((t) => (filtro === "todos" || t.modo === filtro) && (variante === "todas" || String(t.v) === variante));

  return (
    <div className="glass-panel" style={{ ...estiloPanel, padding: "32px" }}>
      <div>
        <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>🎨 Tema de colores</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
          Elige la combinación de colores de la aplicación. El cambio es inmediato y se recuerda en este navegador: cada persona (o cada dispositivo) puede tener el suyo.
        </p>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {(["todos", "dark", "light"] as const).map((f) => (
          <button key={f} type="button" className={`btn ${filtro === f ? "btn-primary" : "btn-secondary"}`} onClick={() => setFiltro(f)} style={{ padding: "8px 16px", fontSize: "0.85rem" }} title={f === "todos" ? "Mostrar todos los temas" : f === "dark" ? "Solo los temas de fondo oscuro" : "Solo los temas de fondo claro"}>
            {f === "todos" ? "Todos" : f === "dark" ? "🌙 Oscuros" : "☀️ Claros"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Intensidad del fondo:</span>
        {([["todas", "Todas"], ["0", "Más intensos (muy oscuros / muy claros)"], ["1", "Intermedios"], ["2", "Suaves (menos oscuros / menos claros)"]] as const).map(([clave, texto]) => (
          <button key={clave} type="button" className={`btn ${variante === clave ? "btn-primary" : "btn-secondary"}`} onClick={() => setVariante(clave)} style={{ padding: "6px 12px", fontSize: "0.8rem" }} title="Filtra los temas por lo claro u oscuro que es su fondo">
            {texto}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "14px" }}>
        {lista.map((t) => {
          const m = muestraTema(t);
          const activo = actual === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => elegir(t.id)}
              title={`Aplicar el tema «${t.nombre}»`}
              aria-pressed={activo}
              style={{ cursor: "pointer", padding: "10px", textAlign: "left", background: "var(--bg-surface-tint)", color: "var(--text-primary)", borderRadius: "var(--radius-sm)", border: `2px solid ${activo ? "var(--primary)" : "var(--border-light)"}`, display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <span style={{ display: "block", background: m.fondo, borderRadius: "6px", padding: "8px", border: "1px solid var(--border-light)" }}>
                <span style={{ display: "block", background: m.tarjeta, borderRadius: "5px", padding: "6px", marginBottom: "6px" }}>
                  <span style={{ display: "block", height: "6px", width: "60%", background: m.texto, opacity: 0.8, borderRadius: "3px", marginBottom: "4px" }} />
                  <span style={{ display: "block", height: "5px", width: "40%", background: m.texto, opacity: 0.35, borderRadius: "3px" }} />
                </span>
                <span style={{ display: "flex", gap: "5px" }}>
                  <span style={{ flex: 2, height: "12px", borderRadius: "4px", background: m.principal }} />
                  <span style={{ flex: 1, height: "12px", borderRadius: "4px", background: m.secundario }} />
                  <span style={{ flex: 1, height: "12px", borderRadius: "4px", background: m.acento }} />
                </span>
              </span>
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                {activo ? "✓ " : ""}
                {t.nombre}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
