"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { useCarga } from "@/components/comisiones/useCarga";
import { llamar, textoError } from "@/components/comisiones/api";

/** «Apagar equipo»: pide al servidor (Raspberry Pi) que se apague, siempre tras confirmación. Solo si el instalador lo activó. */
export default function BotonApagar({ colapsado }: { colapsado: boolean }) {
  const { mostrar } = useToast();
  const { datos } = useCarga<{ disponible: boolean } | null>("/api/admin/apagar", null);
  const [apagando, setApagando] = useState(false);
  if (!datos?.disponible) return null;

  const apagar = async () => {
    if (!window.confirm("¿Apagar la Raspberry Pi?\n\nLa aplicación dejará de estar disponible para todos hasta que vuelvas a encenderla (desenchufándola y enchufándola de nuevo).")) return;
    setApagando(true);
    try {
      await llamar("/api/admin/apagar", { method: "POST", cuerpo: { confirmar: true } });
      mostrar("Apagando el equipo… Espera a que se apague la luz verde antes de desenchufarlo.");
    } catch (e) {
      mostrar(textoError(e), "error");
      setApagando(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void apagar()}
      disabled={apagando}
      className="glass-panel-interactive"
      title="Apaga de forma ordenada la Raspberry Pi donde se ejecuta la aplicación (pide confirmación)"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: colapsado ? "center" : "flex-start",
        gap: "12px",
        padding: "12px 16px",
        borderRadius: "var(--radius-sm)",
        fontSize: "0.95rem",
        fontWeight: 500,
        color: "var(--text-secondary)",
        background: "rgba(255, 255, 255, 0.01)",
        border: "1px solid transparent",
        width: "100%",
        cursor: apagando ? "wait" : "pointer",
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
        <line x1="12" y1="2" x2="12" y2="12" />
      </svg>
      {!colapsado && <span>{apagando ? "Apagando…" : "Apagar equipo"}</span>}
    </button>
  );
}
