"use client";

import { useState } from "react";
import { TEMAS, TEMA_CLARO, TEMA_OSCURO, muestraTema, type TemaColor } from "@/lib/temas";
import { Plegable, SubPestanas } from "./estructura";
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

const INTENSIDADES: { v: number; titulo: string; ayuda: string }[] = [
  { v: 0, titulo: "Más intensos", ayuda: "Muy oscuros o muy claros" },
  { v: 1, titulo: "Intermedios", ayuda: "Ni muy intensos ni muy suaves" },
  { v: 2, titulo: "Suaves", ayuda: "Menos oscuros o menos claros" },
];

/** Pestaña «Tema»: 152 combinaciones de color (2 originales + 150 nuevas), ordenadas en oscuros, claros y originales, y dentro de cada uno por intensidad. Se guarda en este navegador. */
export default function PestanaTemas() {
  const [actual, setActual] = useState(temaGuardado);

  const elegir = (id: string) => {
    window.__gvTema?.(id);
    setActual(id);
  };

  const todos = [...OFICIALES, ...TEMAS];
  const oscuros = TEMAS.filter((t) => t.modo === "dark");
  const claros = TEMAS.filter((t) => t.modo === "light");
  const nombreActual = todos.find((t) => t.id === actual)?.nombre ?? "—";

  const tarjetaTema = (t: TemaColor) => {
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
  };

  const rejilla = (lista: TemaColor[]) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "14px" }}>{lista.map(tarjetaTema)}</div>
  );

  /** Los temas de un modo, en bloques plegables por intensidad. */
  const porIntensidad = (lista: TemaColor[], modo: string) =>
    INTENSIDADES.map((i) => {
      const delGrupo = lista.filter((t) => t.v === i.v);
      return delGrupo.length === 0 ? null : (
        <Plegable key={i.v} id={`temas-${modo}-${i.v}`} titulo={i.titulo} resumen={`${delGrupo.length} temas · ${i.ayuda}`} abiertoPorDefecto={i.v === 0}>
          {rejilla(delGrupo)}
        </Plegable>
      );
    });

  return (
    <div className="glass-panel" style={{ ...estiloPanel, padding: "32px" }}>
      <div>
        <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>🎨 Tema de colores</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
          Elige la combinación de colores de la aplicación. El cambio es inmediato y se recuerda en este navegador: cada persona (o cada dispositivo) puede tener el suyo. Ahora: <b>{nombreActual}</b>.
        </p>
      </div>

      <SubPestanas
        id="temas"
        pestanas={[
          { clave: "oscuros", etiqueta: "🌙 Oscuros", insignia: oscuros.length, ayuda: "Temas de fondo oscuro" },
          { clave: "claros", etiqueta: "☀️ Claros", insignia: claros.length, ayuda: "Temas de fondo claro" },
          { clave: "originales", etiqueta: "⭐ Originales", insignia: OFICIALES.length, ayuda: "Los dos temas de la aplicación original" },
        ]}
      >
        {(pestana) => (pestana === "oscuros" ? porIntensidad(oscuros, "oscuros") : pestana === "claros" ? porIntensidad(claros, "claros") : rejilla(OFICIALES))}
      </SubPestanas>
    </div>
  );
}
