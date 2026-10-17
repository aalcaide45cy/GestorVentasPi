"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { EstadoComisionado } from "@/lib/servicios/comisionado";
import { nombreMes } from "@/lib/formato";

const ETIQUETA = { pagado: "Comisionado", reclamado: "Reclamado a la empresa", pendiente: "Pendiente de comisionar" } as const;
const COLOR = { pagado: "var(--success)", reclamado: "var(--warning)", pendiente: "var(--text-muted)" } as const;

/**
 * Marca un expediente como comisionado (cobrado), reclamado o pendiente desde su propia ficha. Son las mismas marcas que el
 * Cotejo de pagos: lo que se ponga aquí se ve allí y en la columna «Comisionado» de la lista.
 */
export default function ComisionadoExpediente({ idExpediente }: { idExpediente: number }) {
  const { mostrar } = useToast();
  const [datos, setDatos] = useState<EstadoComisionado | null>(null);
  const [mes, setMes] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    llamar<EstadoComisionado>(`/api/expedientes/comisionado?id=${idExpediente}`)
      .then((r) => {
        if (!vivo) return;
        setDatos(r.data);
        setMes((m) => m || r.data.mesSugerido);
      })
      .catch(() => {
        /* sin permiso o sin vendedor: no se muestra */
      });
    return () => {
      vivo = false;
    };
  }, [idExpediente]);

  if (!datos) return null;

  const fijar = async (estado: "pagado" | "reclamado" | "pendiente" | "automatico") => {
    setOcupado(true);
    try {
      const r = await llamar<EstadoComisionado>("/api/expedientes/comisionado", { method: "POST", cuerpo: { idExpediente, mes, estado, nota: nota.trim() || null } });
      setDatos(r.data);
      mostrar(estado === "automatico" ? `✅ ${nombreMes(mes)}: vuelve a decidirlo el Cotejo de pagos.` : `✅ Marcado como «${ETIQUETA[estado].toLowerCase()}» en ${nombreMes(mes)}.`);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  const boton = { padding: "6px 12px", fontSize: "0.82rem" } as const;
  return (
    <div className="glass-panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <h4 style={{ margin: 0, fontSize: "1rem" }}>💰 Comisionado</h4>
        <span style={{ fontWeight: 800, color: COLOR[datos.estado], border: `1px solid ${COLOR[datos.estado]}`, borderRadius: "999px", padding: "2px 12px", fontSize: "0.85rem" }}>
          {ETIQUETA[datos.estado]}
          {datos.mes ? ` · ${nombreMes(datos.mes)}` : ""}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
        Indica si la empresa ya te ha pagado la comisión de este coche. Son las mismas marcas del Cotejo de pagos: se ven allí y en la columna «Comisionado» de la lista. Se guarda al pulsar, sin esperar a «Guardar».
      </p>
      <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "2px" }}>Mes de la comisión</div>
          <input className="form-input" type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ padding: "4px 8px" }} title="Mes de la liquidación a la que pertenece este coche (por defecto, el de su matriculación o facturación)" />
        </div>
        <div style={{ flex: 1, minWidth: "160px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "2px" }}>Nota (opcional)</div>
          <input className="form-input" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} style={{ padding: "4px 8px" }} />
        </div>
        <button type="button" className="btn btn-primary" style={boton} disabled={ocupado || !mes} onClick={() => void fijar("pagado")} title="Marca que la empresa ya ha pagado la comisión de este coche en ese mes">
          ✅ Comisionado
        </button>
        <button type="button" className="btn btn-secondary" style={boton} disabled={ocupado || !mes} onClick={() => void fijar("reclamado")} title="Marca que has reclamado a la empresa esta comisión y aún no te la han pagado">
          ⚠️ Reclamado
        </button>
        <button type="button" className="btn btn-secondary" style={boton} disabled={ocupado || !mes} onClick={() => void fijar("pendiente")} title="Marca que todavía no te han pagado esta comisión (aunque una hoja del Cotejo diga lo contrario)">
          ⏳ Pendiente
        </button>
        <button type="button" className="btn btn-secondary" style={boton} disabled={ocupado || !mes} onClick={() => void fijar("automatico")} title="Quita tu marca de ese mes y deja que lo decida el Cotejo de pagos (hojas de la empresa)">
          ↺ Automático
        </button>
      </div>
      {datos.meses.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.82rem" }}>
          {datos.meses.map((m) => (
            <div key={m.mes} style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <b style={{ minWidth: "130px" }}>{nombreMes(m.mes)}</b>
              <span style={{ color: COLOR[m.estado], fontWeight: 700 }}>{ETIQUETA[m.estado]}</span>
              <span style={{ color: "var(--text-muted)" }}>{m.origen === "manual" ? "marcado a mano" : "según el Cotejo de pagos"}</span>
              {m.nota && <span style={{ color: "var(--text-secondary)" }}>📝 {m.nota}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
