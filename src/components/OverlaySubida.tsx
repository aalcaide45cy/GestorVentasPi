"use client";

import { useSyncExternalStore } from "react";
import { leerSubida, suscribirSubida } from "@/lib/lecturas-pedidos-cliente";

/**
 * Pantalla completa mientras se suben los pedidos al servidor: no se puede cambiar de pantalla ni cerrar la pestaña (el navegador
 * pregunta antes de salir) hasta que termine, para que no se quede ninguno a medias. Después, la lectura sigue en el servidor.
 */
export default function OverlaySubida() {
  const s = useSyncExternalStore(suscribirSubida, leerSubida, () => null);
  if (!s) return null;
  const pct = s.total > 0 ? Math.round((100 * s.hechos) / s.total) : 0;
  return (
    <div role="alertdialog" aria-live="polite" style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0, 0, 0, 0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div className="glass-panel" style={{ padding: "28px 32px", maxWidth: "460px", width: "100%", display: "flex", flexDirection: "column", gap: "14px", textAlign: "center" }}>
        <div style={{ fontSize: "2rem" }}>📤</div>
        <strong style={{ fontSize: "1.1rem" }}>
          Subiendo pedidos: {s.hechos} de {s.total}
        </strong>
        <div style={{ height: "10px", borderRadius: "999px", background: "var(--bg-surface-tint)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--primary)", transition: "width 0.2s" }} />
        </div>
        <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>No cierres esta pestaña ni cambies de pantalla hasta que termine. Cuando acabe de subirlos, se leerán solos en segundo plano.</span>
      </div>
    </div>
  );
}
