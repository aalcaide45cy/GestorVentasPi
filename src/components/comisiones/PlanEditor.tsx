"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { eurosConSigno, nombreMes } from "@/lib/formato";
import { llamar, textoError } from "./api";
import TabLiquidacion from "./TabLiquidacion";
import TabModelos from "./TabModelos";
import TabNotas from "./TabNotas";
import TabObjetivo from "./TabObjetivo";
import { TabBonus, TabPenalizaciones, TabReglas } from "./TabReglas";
import TabResumen from "./TabResumen";
import TabUsados from "./TabUsados";
import type { CatalogosComisiones, Plan } from "./tipos";

const PESTANAS = [
  { id: "resumen", icono: "📋", titulo: "Resumen" },
  { id: "objetivo", icono: "🎯", titulo: "Objetivo" },
  { id: "modelos", icono: "🚙", titulo: "VN" },
  { id: "usados", icono: "🚐", titulo: "Usados / VO" },
  { id: "reglas", icono: "⚙️", titulo: "Financ/Reglas" },
  { id: "bonus", icono: "🎁", titulo: "Bonus" },
  { id: "penalizaciones", icono: "⚠️", titulo: "Penalizaciones" },
  { id: "liquidacion", icono: "💰", titulo: "Liquidación" },
  { id: "notas", icono: "📝", titulo: "Notas" },
] as const;

type IdPestana = (typeof PESTANAS)[number]["id"];

interface Props {
  inicial: Plan | null;
  cat: CatalogosComisiones;
  solapados: string[];
  onGuardado: (idPlan: number) => void;
  onVolver: () => void;
}

const PLAN_VACIO = (): Plan => {
  const hoy = new Date();
  const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return {
    idPlan: 0,
    nombre: `Plan ${mes}`,
    fechaInicio: `${mes}-01`,
    fechaFin: `${mes}-${String(ultimo).padStart(2, "0")}`,
    estado: "borrador",
    tramoMin: -4,
    tramoMax: 3,
    puntosPorPedido: 0,
    penalizacionImporte: 0,
    penalizacionTitulo: null,
    penalizacionDescripcion: null,
    notas: null,
    vendedores: [],
    promociones: [],
    puntosModelo: [],
    tasas: [],
    tarifasVN: [],
    usados: [],
    patrones: [],
    financiacion: [],
    preference: [],
    reglas: [],
    bonus: [],
    pendientes: [],
  };
};

/** Editor de un plan con las 9 pestañas del original. */
export default function PlanEditor({ inicial, cat, solapados, onGuardado, onVolver }: Props) {
  const { mostrar } = useToast();
  const [plan, setPlanEstado] = useState<Plan>(inicial ?? PLAN_VACIO());
  const [guardado, setGuardado] = useState(JSON.stringify(inicial && inicial.idPlan !== 0 ? inicial : null));
  const [pestana, setPestana] = useState<IdPestana>("resumen");
  const [guardando, setGuardando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  const hayCambios = useMemo(() => JSON.stringify(plan) !== guardado, [plan, guardado]);
  const setPlan = (cambio: (p: Plan) => Plan) => setPlanEstado((p) => cambio(p));

  const guardar = async () => {
    setGuardando(true);
    try {
      const nuevo = plan.idPlan === 0;
      const { data, extra } = await llamar<Plan>(nuevo ? "/api/comisiones/planes" : `/api/comisiones/planes?id=${plan.idPlan}`, { method: nuevo ? "POST" : "PUT", cuerpo: plan });
      setPlanEstado(data);
      setGuardado(JSON.stringify(data));
      const impactos = (extra.impactos ?? []) as { mes: string; diferencia: number }[];
      mostrar(impactos.length ? `Plan guardado. Meses cerrados modificados: ${impactos.map((i) => `${nombreMes(i.mes)} ${eurosConSigno(i.diferencia)}`).join(", ")}` : "Plan guardado correctamente", "exito");
      if (nuevo) onGuardado(data.idPlan);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setGuardando(false);
    }
  };

  const props = { plan, setPlan, cat };
  const campoCabecera = { display: "flex", alignItems: "center", gap: "12px" } as const;
  const etiquetaCabecera = { color: "var(--text-secondary)", fontSize: "0.95rem", minWidth: "72px" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <button type="button" className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "0.85rem" }} onClick={() => (hayCambios ? setSaliendo(true) : onVolver())}>
              ← Volver a Planes
            </button>
          </div>
          <div style={campoCabecera}>
            <label style={etiquetaCabecera}>Nombre:</label>
            <input className="form-input" style={{ width: "min(420px, 80vw)", fontSize: "1.05rem", fontWeight: 600 }} value={plan.nombre} onChange={(e) => setPlan((p) => ({ ...p, nombre: e.target.value }))} />
          </div>
          <div style={{ ...campoCabecera, flexWrap: "wrap", gap: "12px 20px" }}>
            <span style={campoCabecera}>
              <label style={etiquetaCabecera}>F. Inicio:</label>
              <input className="form-input" type="date" style={{ width: "165px" }} value={plan.fechaInicio} onChange={(e) => setPlan((p) => ({ ...p, fechaInicio: e.target.value }))} />
            </span>
            <span style={campoCabecera}>
              <label style={{ ...etiquetaCabecera, minWidth: 0 }}>F. Fin:</label>
              <input className="form-input" type="date" style={{ width: "165px" }} value={plan.fechaFin} onChange={(e) => setPlan((p) => ({ ...p, fechaFin: e.target.value }))} />
            </span>
          </div>
        </div>
        <button type="button" className="btn btn-primary" disabled={guardando || !hayCambios} onClick={guardar}>
          {guardando ? "Guardando…" : hayCambios ? "💾 Guardar Cambios" : "Sin cambios"}
        </button>
      </div>

      <div role="tablist" style={{ display: "flex", gap: "4px", flexWrap: "wrap", borderBottom: "1px solid var(--border-light)" }}>
        {PESTANAS.map((p) => {
          const activa = pestana === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setPestana(p.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 16px",
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${activa ? "var(--primary)" : "transparent"}`,
                marginBottom: "-1px",
                color: activa ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: activa ? 700 : 600,
                fontSize: "0.95rem",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "var(--transition)",
              }}
            >
              <span aria-hidden="true">{p.icono}</span>
              {p.titulo}
            </button>
          );
        })}
      </div>

      {pestana === "resumen" && <TabResumen {...props} solapados={solapados} />}
      {pestana === "objetivo" && <TabObjetivo {...props} />}
      {pestana === "modelos" && <TabModelos {...props} />}
      {pestana === "usados" && <TabUsados {...props} />}
      {pestana === "reglas" && <TabReglas {...props} />}
      {pestana === "bonus" && <TabBonus {...props} />}
      {pestana === "penalizaciones" && <TabPenalizaciones {...props} />}
      {pestana === "liquidacion" && (plan.idPlan === 0 ? <p>Guarda el plan para poder calcular liquidaciones.</p> : <TabLiquidacion {...props} hayCambios={hayCambios} />)}
      {pestana === "notas" && <TabNotas {...props} />}

      {saliendo && (
        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "var(--bg-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: "20px" }}>
          <div className="glass-panel" style={{ padding: "32px", maxWidth: "420px", display: "flex", flexDirection: "column", gap: "16px", borderLeft: "4px solid var(--warning)" }}>
            <h3>⚠️ Cambios sin guardar</h3>
            <p style={{ color: "var(--text-secondary)" }}>Hay cambios en el plan que no se han guardado. ¿Quieres salir y descartarlos?</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setSaliendo(false)}>
                Seguir editando
              </button>
              <button type="button" className="btn btn-primary" onClick={onVolver}>
                Descartar y salir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
