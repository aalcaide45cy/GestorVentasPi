"use client";

import { useEffect, useState } from "react";
import { InputCentesimas } from "@/components/comisiones/campos";
import { llamar } from "@/components/comisiones/api";
import { euros, etiquetaTramo, nombreMes, puntos } from "@/lib/formato";

export interface ConceptoForm {
  titulo: string;
  importe_centimos: number;
  descripcion: string;
  evento: "afectacion" | "matriculacion" | "cobro";
  cobrado: boolean;
}

export interface ComisionForm {
  puntos: number | null;
  id_promocion: number | null;
  comision_coche_manual: number | null;
  comision_financiacion_manual: number | null;
  conceptos: ConceptoForm[];
}

/** Datos del formulario que necesita el simulador (tal como están en pantalla, aunque no estén guardados). */
export interface ContextoSimulacion {
  id_expediente: number;
  id_usuario: number | null;
  id_modelo: number | null;
  id_tipo_de_venta: number | null;
  id_estado_vehiculo: number | null;
  fecha_expediente: string | null;
  fecha_afectacion: string | null;
  fecha_rci: string | null;
  fecha_matriculacion: string | null;
  /** En un VN cuenta la facturación (por defecto igual a la matriculación). */
  fecha_facturacion: string | null;
}

interface Promos {
  plan: { idPlan: number; nombre: string } | null;
  promociones: { id: number; nombre?: string; puntosEspeciales: number; minimoUnidades: number; puntosSiNoCumple: number }[];
}

interface Desglose {
  mes: string | null;
  aviso: string | null;
  hayPlan: boolean;
  idPlan?: number | null;
  nombrePlan?: string | null;
  tramo: number | null;
  puntosMes: number | null;
  objetivoX: number | null;
  linea: { importe: number; puntos: number; conceptos: { concepto: string; descripcion: string; importe: number; puntos: number; aviso?: string }[] } | null;
  avisos: string[];
}

/** Pestaña del plan donde se define cada tipo de línea del desglose. */
const PESTANA_DE_CONCEPTO: Record<string, string> = {
  coche_vn: "modelos",
  vo: "usados",
  financiacion: "reglas",
  preference: "reglas",
  regla: "bonus",
  puntos_coche: "modelos",
  puntos_pedido: "objetivo",
  puntos_regla: "bonus",
};

export const comisionInicial = (e: {
  puntos: number | null;
  id_promocion: number | null;
  comision_coche_manual: number | null;
  comision_financiacion_manual: number | null;
  conceptos_especiales: ConceptoForm[];
}): ComisionForm => ({
  puntos: e.puntos,
  id_promocion: e.id_promocion,
  comision_coche_manual: e.comision_coche_manual,
  comision_financiacion_manual: e.comision_financiacion_manual,
  conceptos: e.conceptos_especiales,
});

/** Bloque «Comisionamiento» del expediente + «Desglose Estimado de Comisión» (mismo motor que la liquidación). */
export default function BloqueComisionamiento({ valor, onChange, contexto, mesCierre }: { valor: ComisionForm; onChange: (v: ComisionForm) => void; contexto: ContextoSimulacion; mesCierre: string | null }) {
  const [promos, setPromos] = useState<Promos>({ plan: null, promociones: [] });
  const [desglose, setDesglose] = useState<Desglose | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fechaCuenta = contexto.fecha_facturacion ?? contexto.fecha_matriculacion;
  const mes = fechaCuenta ? fechaCuenta.slice(0, 7) : mesCierre;

  useEffect(() => {
    if (!mes) return;
    let vivo = true;
    llamar<Promos>(`/api/comisiones/promociones?mes=${mes}`)
      .then((r) => vivo && setPromos(r.data))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [mes]);

  const clave = JSON.stringify([valor, contexto]);
  useEffect(() => {
    if (!contexto.id_usuario) return;
    let vivo = true;
    const t = setTimeout(() => {
      llamar<Desglose>("/api/expedientes/simular-comision", {
        method: "POST",
        cuerpo: {
          id_expediente: contexto.id_expediente,
          id_usuario: contexto.id_usuario,
          id_modelo: contexto.id_modelo,
          id_tipo_de_venta: contexto.id_tipo_de_venta,
          id_estado_vehiculo: contexto.id_estado_vehiculo,
          fecha_expediente: contexto.fecha_expediente,
          fecha_afectacion: contexto.fecha_afectacion,
          fecha_rci: contexto.fecha_rci,
          fecha_matriculacion: contexto.fecha_matriculacion,
          fecha_facturacion: contexto.fecha_facturacion,
          puntos: valor.puntos,
          id_promocion: valor.id_promocion,
          comision_coche_manual: valor.comision_coche_manual,
          comision_financiacion_manual: valor.comision_financiacion_manual,
          conceptos_especiales: valor.conceptos.map((c) => ({ titulo: c.titulo, importe_centimos: c.importe_centimos, evento: c.evento })),
        },
      })
        .then((r) => {
          if (!vivo) return;
          setDesglose(r.data);
          setError(null);
        })
        .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudo calcular"));
    }, 400);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const set = (c: Partial<ComisionForm>) => onChange({ ...valor, ...c });

  return (
    <div className="glass-panel" style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "20px" }}>
      <h2 style={{ fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "10px" }}>💶 Comisionamiento</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
        Deja en blanco los campos que quieras que se calculen solos. El 0 es un valor válido (el coche suma 0 puntos pero sigue siendo una unidad comisionable).
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px" }}>
        <div className="form-group">
          <label className="form-label">Puntos del coche</label>
          <InputCentesimas valor={valor.puntos} vacioEsNulo placeholder="por defecto" onChange={(v) => set({ puntos: v })} sufijo="puntos" />
        </div>
        <div className="form-group">
          <label className="form-label">Promoción de puntos</label>
          <select className="form-input" value={valor.id_promocion ?? ""} onChange={(e) => set({ id_promocion: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Sin promoción</option>
            {promos.promociones.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre ?? `Promoción ${p.id}`} ({puntos(p.puntosEspeciales)} pts si ≥ {p.minimoUnidades})
              </option>
            ))}
            {valor.id_promocion !== null && !promos.promociones.some((p) => p.id === valor.id_promocion) && <option value={valor.id_promocion}>Promoción {valor.id_promocion}</option>}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Comisión del coche a mano</label>
          <InputCentesimas valor={valor.comision_coche_manual} vacioEsNulo placeholder="automática" onChange={(v) => set({ comision_coche_manual: v })} sufijo="€" />
        </div>
        <div className="form-group">
          <label className="form-label">Comisión de financiación a mano</label>
          <InputCentesimas valor={valor.comision_financiacion_manual} vacioEsNulo placeholder="automática" onChange={(v) => set({ comision_financiacion_manual: v })} sufijo="€" />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "1rem" }}>Conceptos especiales</h3>
          <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => set({ conceptos: [...valor.conceptos, { titulo: "", importe_centimos: 0, descripcion: "", evento: "matriculacion", cobrado: false }] })}>
            + Añadir concepto
          </button>
        </div>
        {valor.conceptos.map((c, i) => {
          const cambiar = (x: Partial<ConceptoForm>) => set({ conceptos: valor.conceptos.map((y, j) => (j === i ? { ...y, ...x } : y)) });
          return (
            <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <input className="form-input" style={{ flex: "1 1 200px" }} placeholder="Título (p. ej. Bonus Rappel)" value={c.titulo} onChange={(e) => cambiar({ titulo: e.target.value })} />
              <InputCentesimas valor={c.importe_centimos} sufijo="€" onChange={(v) => cambiar({ importe_centimos: v ?? 0 })} />
              <select className="form-input" style={{ width: "auto" }} value={c.evento} onChange={(e) => cambiar({ evento: e.target.value as ConceptoForm["evento"] })}>
                <option value="matriculacion">Evento principal (facturación / matriculación)</option>
                <option value="afectacion">Afectación</option>
              </select>
              <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem", color: "var(--danger)" }} onClick={() => set({ conceptos: valor.conceptos.filter((_, j) => j !== i) })}>
                Quitar
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <h3 style={{ fontSize: "1rem" }}>Desglose Estimado de Comisión</h3>
        {error && <div style={{ color: "var(--danger)" }}>{error}</div>}
        {desglose?.aviso && <div style={{ color: "var(--text-muted)" }}>{desglose.aviso}</div>}
        {desglose && !desglose.aviso && !desglose.hayPlan && <div style={{ color: "var(--warning)" }}>No hay plan de comisionamiento para {nombreMes(desglose.mes)}.</div>}
        {desglose?.linea && (
          <>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              {nombreMes(desglose.mes)} · puntos del mes {puntos(desglose.puntosMes)} / objetivo {puntos(desglose.objetivoX)} → tramo <b>{desglose.tramo !== null ? etiquetaTramo(desglose.tramo) : ""}</b>
            </div>
            <table className="table-premium table-compact">
              <tbody>
                {desglose.linea.conceptos.map((c, i) => (
                  <tr key={i}>
                    <td>
                      {c.descripcion}
                      {desglose.idPlan && PESTANA_DE_CONCEPTO[c.concepto] && (
                        <a
                          href={`/dashboard/comisiones?plan=${desglose.idPlan}&tab=${PESTANA_DE_CONCEPTO[c.concepto]}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ marginLeft: "8px", fontSize: "0.78rem", color: "var(--primary)" }}
                          title={`Abre el plan «${desglose.nombrePlan ?? ""}» en la pestaña donde se define esta regla (en otra pestaña, sin perder lo que estás editando)`}
                        >
                          Ver regla ↗
                        </a>
                      )}
                      {c.aviso && <div style={{ color: "var(--warning)", fontSize: "0.8rem" }}>⚠️ {c.aviso}</div>}
                    </td>
                    <td style={{ textAlign: "right" }}>{c.puntos ? `${puntos(c.puntos)} pts` : ""}</td>
                    <td style={{ textAlign: "right" }}>{c.importe ? euros(c.importe) : ""}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 700 }}>Total estimado de este expediente</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{puntos(desglose.linea.puntos)} pts</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{euros(desglose.linea.importe)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
