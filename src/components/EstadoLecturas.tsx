"use client";

import { useState, useSyncExternalStore } from "react";
import { accionSobreLecturas, cancelarLecturas, leerResumenLecturas, listarNoPedidos, suscribirResumenLecturas } from "@/lib/lecturas-pedidos-cliente";
import type { LecturaDto } from "@/lib/servicios/lecturas-pedidos";

/**
 * Qué ha pasado con los documentos subidos para leer: cuántos faltan, cuántos no eran pedidos y cuántos dieron error (con
 * «Reintentar»). Así ningún documento desaparece sin que se sepa.
 */
export default function EstadoLecturas() {
  const r = useSyncExternalStore(suscribirResumenLecturas, leerResumenLecturas, () => null);
  const [lista, setLista] = useState<LecturaDto[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  if (!r || r.pendientes + r.leyendo + r.descartados + r.errores === 0) return null;

  const ejecutar = async (f: () => Promise<void>) => {
    setOcupado(true);
    try {
      await f();
      if (lista) setLista(await listarNoPedidos());
    } finally {
      setOcupado(false);
    }
  };
  const abrirLista = () => void ejecutar(async () => setLista(lista ? null : await listarNoPedidos()));

  return (
    <div className="glass-panel" style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.85rem" }}>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        {r.pendientes + r.leyendo > 0 && (
          <span style={{ color: "var(--primary)", fontWeight: 600 }}>
            ⏳ {r.leyendo} leyéndose y {r.pendientes} en espera ({r.lectores} lecturas a la vez, hasta {r.maximo} si el equipo aguanta)
          </span>
        )}
        {r.descartados > 0 && <span>🗑️ {r.descartados} no eran pedidos o estaban repetidos (ignorados)</span>}
        {r.errores > 0 && <span style={{ color: "var(--danger)" }}>⚠️ {r.errores} con error</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {r.pendientes > 0 && (
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px" }} disabled={ocupado} onClick={() => void ejecutar(cancelarLecturas)}>
              ✖ Cancelar lo pendiente
            </button>
          )}
          {r.errores > 0 && (
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px" }} disabled={ocupado} onClick={() => void ejecutar(() => accionSobreLecturas("reintentar"))}>
              🔁 Reintentar los errores
            </button>
          )}
          {r.descartados + r.errores > 0 && (
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px" }} disabled={ocupado} onClick={abrirLista}>
              {lista ? "Ocultar detalle" : "Ver cuáles"}
            </button>
          )}
          {r.descartados > 0 && (
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px" }} disabled={ocupado} onClick={() => void ejecutar(() => accionSobreLecturas("limpiar"))} title="Quita de la lista los ignorados">
              Limpiar ignorados
            </button>
          )}
        </span>
      </div>
      {lista && (
        <div style={{ maxHeight: "180px", overflowY: "auto", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "6px 8px" }}>
          {lista.length === 0 && <span style={{ color: "var(--text-muted)" }}>Nada que mostrar.</span>}
          {lista.map((l) => (
            <div key={l.id} style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
              <span>
                {l.estado === "error" ? "⚠️" : l.estado === "cancelado" ? "✖" : "🗑️"} {l.nombre}
              </span>
              <span style={{ color: l.estado === "error" ? "var(--danger)" : "var(--text-muted)" }}>{l.estado === "cancelado" ? "cancelado" : (l.error ?? "")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
