"use client";

import { usePreferencia } from "@/lib/preferencias";
import PanelAjustesCorreo from "./PanelAjustesCorreo";
import PanelCola from "./PanelCola";
import PanelCuentas from "./PanelCuentas";
import PanelFirmas from "./PanelFirmas";
import PanelPlantillas from "./PanelPlantillas";

const PESTANAS = [
  { id: "cola", texto: "📬 Cola" },
  { id: "historico", texto: "🗂️ Histórico" },
  { id: "plantillas", texto: "📝 Plantillas" },
  { id: "firmas", texto: "✍️ Firmas" },
  { id: "cuentas", texto: "👤 Cuentas" },
  { id: "ajustes", texto: "⚙️ Ajustes" },
] as const;

/** «Correo»: cola de envío, histórico, plantillas, cuentas y ajustes. Solo envía, no recibe. */
export default function CorreoClient({ esAdmin }: { esAdmin: boolean }) {
  const [guardada, fijar] = usePreferencia("exp-correo-pestana");
  const actual = PESTANAS.find((p) => p.id === guardada)?.id ?? "cola";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div>
        <h2 style={{ margin: 0, fontSize: "1.5rem" }}>✉️ Correo</h2>
        <p
          style={{
            margin: "4px 0 0",
            color: "var(--text-secondary)",
            fontSize: "0.9rem",
          }}
        >
          Envío de correos con plantillas rellenadas con los datos del cliente y
          del expediente. Todo entra en una cola que revisas antes de enviar.
        </p>
      </div>
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: "4px",
          borderBottom: "1px solid var(--border-light)",
          flexWrap: "wrap",
        }}
      >
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={actual === p.id}
            onClick={() => fijar(p.id)}
            style={{
              padding: "8px 16px",
              border: "none",
              borderBottom: `3px solid ${actual === p.id ? "var(--primary)" : "transparent"}`,
              background: "transparent",
              color:
                actual === p.id ? "var(--primary)" : "var(--text-secondary)",
              fontWeight: 700,
              fontSize: "0.92rem",
              cursor: "pointer",
            }}
          >
            {p.texto}
          </button>
        ))}
      </div>
      {actual === "cola" && <PanelCola key="cola" modo="cola" />}
      {actual === "historico" && <PanelCola key="historico" modo="historico" />}
      {actual === "plantillas" && <PanelPlantillas />}
      {actual === "firmas" && <PanelFirmas />}
      {actual === "cuentas" && <PanelCuentas />}
      {actual === "ajustes" && <PanelAjustesCorreo esAdmin={esAdmin} />}
    </div>
  );
}
