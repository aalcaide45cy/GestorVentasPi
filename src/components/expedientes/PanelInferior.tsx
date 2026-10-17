"use client";

import type { ReactNode } from "react";
import { usePreferencia } from "@/lib/preferencias";

/**
 * Desplegable flotante en la parte inferior de la pantalla: un botón siempre visible que abre un panel con el resumen estadístico,
 * las comisiones y la cartera, para tenerlos a mano sin perder de vista la lista. Recuerda si estaba abierto.
 */
export default function PanelInferior({ children }: { children: ReactNode }) {
  const [guardado, guardar] = usePreferencia("exp-panel-inferior");
  const abierto = guardado === "abierto";
  return (
    <>
      {/* Pegado al borde inferior de la zona de contenido mientras se baja por la lista */}
      <div style={{ position: "sticky", bottom: 0, zIndex: 60, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
        {abierto && (
          <div
            className="glass-panel"
            style={{ pointerEvents: "auto", width: "100%", maxHeight: "62vh", overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "12px", background: "var(--bg-app)", boxShadow: "0 -10px 30px rgba(0,0,0,0.35)", border: "1px solid var(--border-light)", borderBottom: "none", borderRadius: "var(--radius-md) var(--radius-md) 0 0" }}
          >
            {children}
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => guardar(abierto ? "cerrado" : "abierto")}
          title="Abre o cierra el resumen del mes, las comisiones y la cartera"
          style={{ pointerEvents: "auto", borderRadius: abierto ? 0 : "var(--radius-md) var(--radius-md) 0 0", padding: "8px 22px", fontWeight: 700 }}
        >
          {abierto ? "▼" : "▲"} 📊 Resumen · 💶 Comisiones · 📁 Cartera
        </button>
      </div>
    </>
  );
}
