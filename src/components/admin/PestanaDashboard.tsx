"use client";

import { useToast } from "@/components/Toast";
import { CLAVE_DASH_ORDEN, CLAVE_DASH_OCULTOS, CLAVE_DASH_RECIENTES, PANELES_DASHBOARD, RECIENTES_MAXIMO, RECIENTES_POR_DEFECTO, ordenPanelesDashboard, panelesOcultosDashboard, recientesDashboard, type IdPanelDashboard } from "@/lib/dashboard-paneles";
import { usePreferencia } from "@/lib/preferencias";
import { estiloPanel } from "./utilidades";

/** Pestaña «Dashboard»: qué paneles se ven en el Dashboard y cuántos expedientes enseña «Últimos expedientes activos» (se guarda en el navegador). */
export default function PestanaDashboard() {
  const { mostrar } = useToast();
  const [ocultosGuardado, guardarOcultos] = usePreferencia(CLAVE_DASH_OCULTOS);
  const [, guardarOrden] = usePreferencia(CLAVE_DASH_ORDEN);
  const [recientesGuardado, guardarRecientes] = usePreferencia(CLAVE_DASH_RECIENTES);
  const ocultos = panelesOcultosDashboard(ocultosGuardado);
  const recientes = recientesDashboard(recientesGuardado);

  const alternar = (id: IdPanelDashboard, ver: boolean) => {
    guardarOcultos(JSON.stringify(ver ? ocultos.filter((x) => x !== id) : [...ocultos, id]));
  };
  const elegirRecientes = (n: number) => guardarRecientes(String(Math.max(1, Math.min(RECIENTES_MAXIMO, Math.round(n) || RECIENTES_POR_DEFECTO))));
  const restaurar = () => {
    guardarOcultos("[]");
    guardarOrden("");
    guardarRecientes(String(RECIENTES_POR_DEFECTO));
    mostrar("Dashboard restaurado: todos los paneles, en su orden y con 5 expedientes recientes.");
  };

  return (
    <div className="glass-panel" style={{ ...estiloPanel, gap: "20px" }}>
      <div>
        <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>🏠 Ajustes del Dashboard</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
          Elige qué paneles quieres ver en el Dashboard y cuántos expedientes recientes salen. Estos ajustes se guardan en tu navegador. Para cambiar el orden, pulsa «🔒 Mover paneles» en el propio Dashboard.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "14px", borderLeft: "3px solid var(--primary)" }}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0" }}>👁️ Paneles que se ven</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>Marca los que quieras ver. Se guarda solo.</p>
        </div>
        {PANELES_DASHBOARD.map((p) => (
          <label key={p.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
            <input type="checkbox" checked={!ocultos.includes(p.id)} onChange={(e) => alternar(p.id, e.target.checked)} style={{ width: "18px", height: "18px", marginTop: "2px", accentColor: "var(--primary)" }} />
            <span>
              <strong>{p.titulo}</strong>
              <br />
              <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{p.ayuda}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "14px", borderLeft: "3px solid var(--primary)" }}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0" }}>📋 Expedientes en «Últimos expedientes activos»</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>Cuántos expedientes recientes enseña esa tabla (de 1 a {RECIENTES_MAXIMO}; por defecto {RECIENTES_POR_DEFECTO}). Se guarda sola.</p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.95rem" }}>
          Expedientes:
          <input type="number" className="form-input" min={1} max={RECIENTES_MAXIMO} step={1} style={{ width: "90px" }} value={recientes} onChange={(e) => elegirRecientes(Number(e.target.value))} />
        </label>
      </div>

      <div>
        <button type="button" className="btn btn-secondary" onClick={restaurar} title="Vuelve a mostrar todos los paneles, en su orden de siempre y con 5 expedientes recientes">
          ↺ Restaurar el Dashboard
        </button>
      </div>
    </div>
  );
}
