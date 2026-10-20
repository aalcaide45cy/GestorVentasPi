"use client";

import { useSyncExternalStore } from "react";
import { useToast } from "@/components/Toast";
import { contarNoLeidas, leerRegistro, registroServidor, suscribirRegistro } from "@/lib/notificaciones-cliente";

/** Campana de la barra superior: abre el registro de notificaciones y avisa con un número de las que no se han repasado. */
export default function CampanaNotificaciones() {
  const registro = useSyncExternalStore(suscribirRegistro, leerRegistro, registroServidor);
  const { abrirRegistro } = useToast();
  const nuevas = contarNoLeidas(registro);
  return (
    <button
      type="button"
      onClick={abrirRegistro}
      aria-label={nuevas > 0 ? `Notificaciones: ${nuevas} sin repasar` : "Notificaciones"}
      title={nuevas > 0 ? `Registro de notificaciones (${nuevas} sin repasar)` : "Registro de notificaciones"}
      style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "var(--bg-card)", color: "var(--text-primary)", cursor: "pointer", fontSize: "1.05rem", flexShrink: 0 }}
    >
      🔔
      {nuevas > 0 && (
        <span style={{ position: "absolute", top: "-6px", right: "-6px", minWidth: "18px", height: "18px", padding: "0 5px", borderRadius: "9px", background: "var(--danger)", color: "#fff", fontSize: "0.68rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {nuevas > 99 ? "99+" : nuevas}
        </span>
      )}
    </button>
  );
}
