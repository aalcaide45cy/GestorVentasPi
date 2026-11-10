"use client";

import { usePreferencia } from "@/lib/preferencias";
import PanelNotas from "./PanelNotas";

/** «Notas»: dos secciones, Notas (texto con formato, adjuntos…) y Flujos (diagramas y tableros). */
export default function NotasClient() {
  const [guardada, fijar] = usePreferencia("exp-notas-seccion");
  const seccion = guardada === "flujos" ? "flujos" : "notas";
  const pestana = (id: "notas" | "flujos", texto: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={seccion === id}
      onClick={() => fijar(id)}
      style={{
        padding: "8px 18px",
        border: "none",
        borderBottom: `3px solid ${seccion === id ? "var(--primary)" : "transparent"}`,
        background: "transparent",
        color: seccion === id ? "var(--primary)" : "var(--text-secondary)",
        fontWeight: 700,
        fontSize: "0.95rem",
        cursor: "pointer",
      }}
    >
      {texto}
    </button>
  );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        minHeight: 0,
      }}
    >
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Notas</h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Tus notas y tus flujos de trabajo, con grupos, etiquetas y adjuntos.
          Se guardan solas y las puedes compartir con el equipo.
        </p>
      </div>
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: "4px",
          borderBottom: "1px solid var(--border-light)",
        }}
      >
        {pestana("notas", "📝 Notas")}
        {pestana("flujos", "🔀 Flujos")}
      </div>
      {seccion === "notas" ? (
        <PanelNotas key="notas" tipos={["nota"]} />
      ) : (
        <PanelNotas key="flujos" tipos={["diagrama", "tablero"]} />
      )}
    </div>
  );
}
