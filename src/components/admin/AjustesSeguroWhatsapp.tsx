"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { usePreferencia } from "@/lib/preferencias";
import { CLAVE_SEGURO_NOMBRE, CLAVE_SEGURO_PLANTILLA, CLAVE_SEGURO_TELEFONO, PLANTILLA_SEGURO, numeroWhatsapp } from "@/lib/whatsapp";

/** A quién se avisa para el seguro (nombre y móvil) y el texto del mensaje. Se guarda por usuario. */
export default function AjustesSeguroWhatsapp() {
  const { mostrar } = useToast();
  const [nombre, guardarNombre] = usePreferencia(CLAVE_SEGURO_NOMBRE);
  const [telefono, guardarTelefono] = usePreferencia(CLAVE_SEGURO_TELEFONO);
  const [plantilla, guardarPlantilla] = usePreferencia(CLAVE_SEGURO_PLANTILLA);
  // Lo que se está escribiendo; null = lo guardado
  const [n, setN] = useState<string | null>(null);
  const [t, setT] = useState<string | null>(null);
  const [p, setP] = useState<string | null>(null);
  const valorNombre = n ?? nombre ?? "";
  const valorTelefono = t ?? telefono ?? "";
  const texto = p ?? (plantilla?.trim() ? plantilla : PLANTILLA_SEGURO);

  const guardar = () => {
    guardarNombre(valorNombre.trim());
    guardarTelefono(valorTelefono.trim());
    guardarPlantilla(texto === PLANTILLA_SEGURO ? "" : texto);
    setN(null);
    setT(null);
    setP(null);
    mostrar("Guardado.");
  };

  return (
    <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "14px", borderLeft: "3px solid var(--primary)" }}>
      <div>
        <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>🛡️ WhatsApp al compañero de los seguros</h4>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: "1.5" }}>
          Se rellenan solos: <code>{"{companero}"}</code>, <code>{"{nombre}"}</code>, <code>{"{telefono}"}</code>, <code>{"{email}"}</code>, <code>{"{vehiculo}"}</code>, <code>{"{matricula}"}</code>, <code>{"{bastidor}"}</code> y <code>{"{entrega}"}</code>.
        </p>
      </div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 200px" }}>
          Nombre
          <input className="form-input" value={valorNombre} onChange={(e) => setN(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 200px" }}>
          Teléfono móvil
          <input className="form-input" type="tel" value={valorTelefono} onChange={(e) => setT(e.target.value)} />
          {valorTelefono.trim() !== "" && !numeroWhatsapp(valorTelefono) && <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>No parece un móvil válido.</span>}
        </label>
      </div>
      <textarea className="form-input" rows={18} value={texto} onChange={(e) => setP(e.target.value)} aria-label="Texto del WhatsApp para el seguro" style={{ resize: "vertical", lineHeight: 1.45 }} />
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" disabled={n === null && t === null && p === null} onClick={guardar}>
          Guardar
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            guardarPlantilla("");
            setP(null);
            mostrar("Texto de origen restablecido.");
          }}
        >
          Restablecer el texto de origen
        </button>
      </div>
    </div>
  );
}
