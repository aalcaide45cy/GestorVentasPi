import type { ReactNode } from "react";

/** Recuadro con título para una zona de subida (pedidos, pagos…). */
export default function TarjetaZona({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: ReactNode }) {
  return (
    <section title={ayuda} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 14px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "rgba(255, 255, 255, 0.02)", minWidth: 0 }}>
      <h3 style={{ margin: 0, fontSize: "0.92rem", fontWeight: 700 }}>{titulo}</h3>
      {children}
    </section>
  );
}
