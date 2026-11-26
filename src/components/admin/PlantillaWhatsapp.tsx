"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { usePreferencia } from "@/lib/preferencias";
import { CLAVE_PLANTILLA_WHATSAPP, PLANTILLA_WHATSAPP } from "@/lib/whatsapp";

/** El texto del mensaje de WhatsApp al cliente. Se guarda por usuario; vacío = el texto de origen. */
export default function PlantillaWhatsapp() {
  const { mostrar } = useToast();
  const [guardada, guardar] = usePreferencia(CLAVE_PLANTILLA_WHATSAPP);
  const [borrador, setBorrador] = useState<string | null>(null);
  const texto = borrador ?? (guardada?.trim() ? guardada : PLANTILLA_WHATSAPP);
  return (
    <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "14px", borderLeft: "3px solid var(--primary)" }}>
      <div>
        <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>💬 Texto del WhatsApp al cliente</h4>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: "1.5" }}>
          Se rellenan solos: <code>{"{nombre}"}</code>, <code>{"{matricula}"}</code>, <code>{"{fecha_matricula}"}</code>, <code>{"{bastidor}"}</code>, <code>{"{dia}"}</code> y <code>{"{hora}"}</code>. Lo que va entre <code>[retoma]</code> y <code>[/retoma]</code> solo sale si el cliente entrega un vehículo.
        </p>
      </div>
      <textarea className="form-input" rows={22} value={texto} onChange={(e) => setBorrador(e.target.value)} aria-label="Texto del WhatsApp" style={{ resize: "vertical", lineHeight: 1.45 }} />
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={borrador === null}
          onClick={() => {
            guardar(texto === PLANTILLA_WHATSAPP ? "" : texto);
            setBorrador(null);
            mostrar("Guardado.");
          }}
        >
          Guardar texto
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            guardar("");
            setBorrador(null);
            mostrar("Texto de origen restablecido.");
          }}
        >
          Restablecer el texto de origen
        </button>
      </div>
    </div>
  );
}
