"use client";

import { sumarMesesIso } from "@/lib/comisiones/ajustar-fechas";

const hoyIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const boton = { padding: "1px 7px", fontSize: "0.72rem", lineHeight: 1.4 } as const;

interface Props {
  valor: string | null;
  alCambiar: (nuevo: string | null) => void;
  /** Fecha del plan que pone el botón «Plan»: el inicio en «Válida desde», el fin en «Válida hasta». */
  fechaPlan: string;
  /** Qué fecha del plan es (para la ayuda del botón). */
  cualDelPlan: "inicio" | "fin";
}

/** Fecha con atajos: ◀ ▶ (un mes antes o después), «Actual» (hoy), «Plan» (inicio o fin del plan de comisionamiento) y ✕ para vaciarla. */
export default function FechaConAtajos({ valor, alCambiar, fechaPlan, cualDelPlan }: Props) {
  const base = valor || fechaPlan || hoyIso();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "150px" }}>
      <input className="form-input" type="date" value={valor ?? ""} onChange={(e) => alCambiar(e.target.value || null)} />
      <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" style={boton} onClick={() => alCambiar(sumarMesesIso(base, -1))} title="Un mes antes">
          ◀
        </button>
        <button type="button" className="btn btn-secondary" style={boton} onClick={() => alCambiar(hoyIso())} title="La fecha de hoy">
          Actual
        </button>
        <button type="button" className="btn btn-secondary" style={boton} onClick={() => alCambiar(sumarMesesIso(base, 1))} title="Un mes después">
          ▶
        </button>
        <button type="button" className="btn btn-secondary" style={boton} onClick={() => alCambiar(fechaPlan)} disabled={!fechaPlan} title={cualDelPlan === "inicio" ? "Poner la fecha de inicio del plan de comisionamiento" : "Poner la fecha de fin del plan de comisionamiento"}>
          Plan
        </button>
        {valor && (
          <button type="button" className="btn btn-secondary" style={boton} onClick={() => alCambiar(null)} title="Vaciar la fecha (sin límite)">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
