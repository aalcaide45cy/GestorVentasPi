"use client";

import type { ReactNode } from "react";
import BotonAyuda from "@/components/BotonAyuda";
import { usePreferencia } from "@/lib/preferencias";

/**
 * Piezas para ordenar las pantallas de Configuración: subpestañas (recuerdan cuál estaba abierta) y bloques que se pliegan y
 * despliegan (también recuerdan su estado en este navegador).
 */

export interface SubPestana {
  clave: string;
  etiqueta: ReactNode;
  /** Qué hay dentro (sale al pasar el ratón). */
  ayuda?: string;
  /** Número o aviso pequeño junto al nombre. */
  insignia?: ReactNode;
}

/** Fila de subpestañas con el contenido de la elegida debajo. La pestaña abierta se recuerda por `id`. */
/** Con `guiaBase` («config.bbdd»), cada pestaña lleva una «i» con su guía de uso (clave `guiaBase.clavePestaña` en `lib/guias.ts`). */
export function SubPestanas({ id, pestanas, guiaBase, children }: { id: string; pestanas: SubPestana[]; guiaBase?: string; children: (clave: string) => ReactNode }) {
  const [guardada, guardar] = usePreferencia(`subpestana-${id}`);
  const actual = pestanas.some((p) => p.clave === guardada) ? (guardada as string) : pestanas[0].clave;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div role="tablist" style={{ display: "flex", gap: "4px", flexWrap: "wrap", borderBottom: "1px solid var(--border-light)" }}>
        {pestanas.map((p) => {
          const activa = p.clave === actual;
          return (
            <span key={p.clave} style={{ display: "inline-flex", alignItems: "center", gap: "2px", marginBottom: "-1px" }}>
            <button
              type="button"
              role="tab"
              aria-selected={activa}
              title={p.ayuda}
              onClick={() => guardar(p.clave)}
              style={{
                padding: "10px 16px",
                fontSize: "0.9rem",
                fontWeight: activa ? 700 : 500,
                background: activa ? "rgba(var(--primary-rgb), 0.12)" : "transparent",
                color: activa ? "var(--primary)" : "var(--text-secondary)",
                border: "none",
                borderBottom: `3px solid ${activa ? "var(--primary)" : "transparent"}`,
                borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {p.etiqueta}
              {p.insignia !== undefined && p.insignia !== null && (
                <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "1px 7px", borderRadius: "999px", background: "var(--bg-surface-tint)", color: "var(--text-secondary)" }}>{p.insignia}</span>
              )}
            </button>
            {guiaBase && <BotonAyuda guia={`${guiaBase}.${p.clave}`} />}
            </span>
          );
        })}
      </div>
      <div role="tabpanel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {children(actual)}
      </div>
    </div>
  );
}

/** Bloque con título que se pliega y despliega; su estado se recuerda. */
export function Plegable({ id, titulo, resumen, acciones, abiertoPorDefecto = true, children, borde }: { id: string; titulo: ReactNode; resumen?: ReactNode; acciones?: ReactNode; abiertoPorDefecto?: boolean; children: ReactNode; borde?: string }) {
  const [guardado, guardar] = usePreferencia(`plegable-${id}`);
  const abierto = guardado === null ? abiertoPorDefecto : guardado === "abierto";
  return (
    <section className="glass-panel" style={{ padding: "0", display: "flex", flexDirection: "column", border: borde ?? "1px solid var(--border-light)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", flexWrap: "wrap" }}>
        <button type="button" onClick={() => guardar(abierto ? "cerrado" : "abierto")} aria-expanded={abierto} title={abierto ? "Plegar" : "Desplegar"} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "200px" }}>
          <span aria-hidden="true" style={{ display: "inline-block", width: "1em", color: "var(--text-secondary)" }}>
            {abierto ? "▾" : "▸"}
          </span>
          <span style={{ fontSize: "1.02rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>{titulo}</span>
          {resumen && <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 500 }}>{resumen}</span>}
        </button>
        {acciones}
      </div>
      {abierto && <div style={{ padding: "0 16px 16px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>{children}</div>}
    </section>
  );
}
