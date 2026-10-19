"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import PanelRendimiento from "@/components/admin/PanelRendimiento";
import type { Recursos } from "@/lib/rendimiento";

const COLORES = { ok: "var(--border-light)", aviso: "var(--warning)", alto: "var(--danger)" } as const;
const ICONO_EQUIPO = { AMD: "💻", Intel: "💻", Apple: "🍎", Raspberry: "🍓", Otro: "🖥️" } as const;
const mbs = (n: number | null): string => (n === null ? "—" : n.toFixed(n >= 10 ? 0 : 1).replace(".", ","));

/**
 * Cajita de la barra superior (solo administrador) con el uso del equipo en vivo: procesador, memoria y lectura y escritura del disco
 * (la tarjeta SD, en una Raspberry). Se pone naranja o roja si algo se acerca al límite; al pulsarla se abre el detalle completo.
 */
export default function IndicadorRecursos() {
  const [r, setR] = useState<Recursos | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let vivo = true;
    const leer = async () => {
      try {
        const res = await fetch("/api/admin/recursos", { credentials: "same-origin", cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { data?: Recursos };
        if (vivo && j.data) setR(j.data);
      } catch {
        /* sin conexión un momento: se vuelve a intentar */
      }
    };
    void leer();
    // Sin consultar mientras la pestaña está oculta (no gasta nada de la Raspberry si nadie mira)
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void leer();
    }, 5000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className="indicador-recursos"
        onClick={() => setAbierto(true)}
        title={
          r
            ? `${r.equipo.nombre ? `${r.equipo.nombre} (${r.equipo.tipo})` : r.equipo.tipo}: uso ahora mismo. ${r.motivo ? `⚠️ ${r.motivo}. ` : ""}CPU ${r.cpu} % · memoria ${r.memoriaUsadaPct} % (${r.memoriaLibreMb} MB libres de ${r.memoriaTotalMb}) · disco: lee ${mbs(r.discoLeidoMBs)} MB/s, escribe ${mbs(r.discoEscritoMBs)} MB/s${r.tempC !== null ? ` · ${r.tempC} °C` : ""}. Pulsa para ver el detalle y por qué va lento.`
            : "Uso del equipo: pulsa para ver el detalle"
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "6px 12px",
          marginRight: "12px",
          borderRadius: "var(--radius-sm)",
          border: `1px solid ${r ? COLORES[r.nivel] : "var(--border-light)"}`,
          background: r?.nivel === "alto" ? "rgba(239, 68, 68, 0.08)" : r?.nivel === "aviso" ? "rgba(245, 158, 11, 0.08)" : "var(--bg-surface-tint)",
          color: "var(--text-primary)",
          fontSize: "0.78rem",
          cursor: "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <span aria-hidden="true">{r?.nivel === "alto" ? "🔴" : r?.nivel === "aviso" ? "🟠" : "🩺"}</span>
        {r && (
          <span title={`${r.equipo.nombre ? `${r.equipo.nombre} · ` : ""}${r.equipo.detalle}`} style={{ display: "flex", gap: "6px", alignItems: "baseline", paddingRight: "12px", borderRight: "1px solid var(--border-light)" }}>
            <b>
              {ICONO_EQUIPO[r.equipo.tipo]} {r.equipo.tipo}
            </b>
            {r.equipo.nombre && <span style={{ color: "var(--text-muted)", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis" }}>{r.equipo.nombre}</span>}
          </span>
        )}
        <span>
          CPU <b>{r ? `${r.cpu}%` : "…"}</b>
        </span>
        <span>
          RAM <b>{r ? `${r.memoriaUsadaPct}%` : "…"}</b>
        </span>
        <span className="indicador-disco">
          SD <b>{r ? `↓${mbs(r.discoLeidoMBs)} ↑${mbs(r.discoEscritoMBs)}` : "…"}</b> MB/s
        </span>
        {r?.tempC !== null && r?.tempC !== undefined && (
          <span className="indicador-temp">
            <b>{Math.round(r.tempC)}°C</b>
          </span>
        )}
      </button>
      {abierto && (
        <Modal
          titulo={`🩺 Rendimiento${r ? ` de ${r.equipo.nombre || r.equipo.tipo} (${r.equipo.tipo})` : " del equipo"}`}
          ancho="min(1100px, 96vw)"
          pie={
            <button type="button" className="btn btn-secondary" data-tecla="escape" onClick={() => setAbierto(false)}>
              Cerrar
            </button>
          }
        >
          <div style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: "6px" }}>
            <PanelRendimiento />
          </div>
        </Modal>
      )}
    </>
  );
}
