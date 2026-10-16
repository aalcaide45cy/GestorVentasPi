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
  { id: "resumen", titulo: "Resumen del Plan" },
  { id: "objetivo", titulo: "Cálculo del Objetivo X" },
  { id: "modelos", titulo: "Tarifas de Modelos VN por Tramo" },
  { id: "usados", titulo: "Usados / VO" },
  { id: "reglas", titulo: "Financiación / Reglas del Plan" },
  { id: "bonus", titulo: "Bonus de Campaña" },
  { id: "penalizaciones", titulo: "Penalizaciones" },
  { id: "liquidacion", titulo: "Liquidación Consolidada" },
  { id: "notas", titulo: "Notas y Pendientes" },
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button type="button" className="btn btn-secondary" onClick={() => (hayCambios ? setSaliendo(true) : onVolver())}>
            ← Planes
          </button>
          <h2 style={{ fontSize: "1.4rem" }}>{plan.idPlan === 0 ? "Nuevo plan" : plan.nombre}</h2>
        </div>
        <button type="button" className="btn btn-primary" disabled={guardando || !hayCambios} onClick={guardar}>
          {guardando ? "Guardando…" : hayCambios ? "Guardar plan" : "Sin cambios"}
        </button>
      </div>

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {PESTANAS.map((p) => (
          <button key={p.id} type="button" className={`btn ${pestana === p.id ? "btn-primary" : "btn-secondary"}`} style={{ padding: "8px 14px", fontSize: "0.85rem" }} onClick={() => setPestana(p.id)}>
            {p.titulo}
          </button>
        ))}
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
