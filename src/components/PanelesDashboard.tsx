"use client";

import BotonAjustes from "@/components/BotonAjustes";
import { useState, type ReactNode } from "react";
import { CLAVE_DASH_ORDEN, CLAVE_DASH_OCULTOS, PANELES_DASHBOARD, moverPanel, ordenPanelesDashboard, panelesOcultosDashboard, type IdPanelDashboard } from "@/lib/dashboard-paneles";
import { usePreferencia } from "@/lib/preferencias";

interface Props {
  /** Cada panel ya pintado (o `null` si hoy no toca, como el aviso de validación sin avisos), por su identificador. */
  paneles: Partial<Record<IdPanelDashboard, ReactNode>>;
  esAdmin: boolean;
}

const estiloBoton = { padding: "3px 10px", fontSize: "0.8rem" } as const;

/**
 * Los paneles del Dashboard en el orden que cada persona prefiera: con el candado abierto se arrastran (o se suben y bajan con las flechas) y se
 * recuerda el orden en este navegador. Los paneles que se hayan ocultado en Configuración › Dashboard no salen. Con el candado cerrado no hay
 * nada arrastrable, para que soltar pedidos sobre las cajas y las filas siga funcionando.
 */
export default function PanelesDashboard({ paneles, esAdmin }: Props) {
  const [ordenGuardado, guardarOrden] = usePreferencia(CLAVE_DASH_ORDEN);
  const [ocultosGuardado] = usePreferencia(CLAVE_DASH_OCULTOS);
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [arrastrando, setArrastrando] = useState<IdPanelDashboard | null>(null);
  const [encima, setEncima] = useState<IdPanelDashboard | null>(null);

  const orden = ordenPanelesDashboard(ordenGuardado);
  const ocultos = panelesOcultosDashboard(ocultosGuardado);
  const visibles = orden.filter((id) => !ocultos.includes(id) && paneles[id] != null);
  const nombre = (id: IdPanelDashboard) => PANELES_DASHBOARD.find((p) => p.id === id)?.titulo ?? id;
  const guardar = (nuevo: IdPanelDashboard[]) => guardarOrden(JSON.stringify(nuevo));
  const desplazar = (id: IdPanelDashboard, delta: -1 | 1) => {
    const i = visibles.indexOf(id);
    const vecino = visibles[i + delta];
    if (vecino) guardar(moverPanel(orden, id, vecino));
  };
  const soltar = (destino: IdPanelDashboard) => {
    if (arrastrando) guardar(moverPanel(orden, arrastrando, destino));
    setArrastrando(null);
    setEncima(null);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        {desbloqueado && <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Arrastra el asa ⠿ de cada panel (o usa las flechas) para cambiarlo de sitio.</span>}
        {desbloqueado && !!ordenGuardado && (
          <button type="button" className="btn btn-secondary" style={estiloBoton} onClick={() => guardarOrden("")} title="Vuelve al orden de siempre">
            ↺ Orden por defecto
          </button>
        )}
        {esAdmin && <BotonAjustes pestana="dashboard" titulo="Ajustes del Dashboard" ayuda="Mostrar u ocultar paneles y elegir cuántos expedientes salen (Configuración › Dashboard)" />}
        <button type="button" className={desbloqueado ? "btn btn-primary" : "btn btn-secondary"} style={estiloBoton} onClick={() => setDesbloqueado((v) => !v)} aria-pressed={desbloqueado} title={desbloqueado ? "Bloquea los paneles en su sitio" : "Desbloquea los paneles para cambiarlos de sitio arrastrándolos"}>
          {desbloqueado ? "🔓 Bloquear" : "🔒 Mover paneles"}
        </button>
      </div>

      {visibles.map((id, i) => (
        <div
          key={id}
          onDragOver={desbloqueado && arrastrando ? (e) => { e.preventDefault(); setEncima(id); } : undefined}
          onDrop={desbloqueado && arrastrando ? (e) => { e.preventDefault(); soltar(id); } : undefined}
          style={desbloqueado ? { display: "flex", flexDirection: "column", gap: "6px", padding: "6px", border: `2px dashed ${encima === id && arrastrando && arrastrando !== id ? "var(--primary)" : "var(--border-light)"}`, borderRadius: "var(--radius-md)", opacity: arrastrando === id ? 0.5 : 1, background: encima === id && arrastrando && arrastrando !== id ? "rgba(var(--primary-rgb), 0.06)" : undefined } : { display: "contents" }}
        >
          {desbloqueado && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); setArrastrando(id); }} onDragEnd={() => { setArrastrando(null); setEncima(null); }} title="Arrastra para mover este panel" aria-label={`Mover ${nombre(id)}`} style={{ cursor: "grab", fontSize: "1.2rem", lineHeight: 1, padding: "2px 6px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", userSelect: "none" }}>
                ⠿
              </span>
              <strong>{nombre(id)}</strong>
              <span style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
                <button type="button" className="btn btn-secondary" style={estiloBoton} disabled={i === 0} onClick={() => desplazar(id, -1)} aria-label={`Subir ${nombre(id)}`} title="Subir">▲</button>
                <button type="button" className="btn btn-secondary" style={estiloBoton} disabled={i === visibles.length - 1} onClick={() => desplazar(id, 1)} aria-label={`Bajar ${nombre(id)}`} title="Bajar">▼</button>
              </span>
            </div>
          )}
          {paneles[id]}
        </div>
      ))}
    </>
  );
}
