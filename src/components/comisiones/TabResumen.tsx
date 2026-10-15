"use client";

import { InputCentesimas, InputEntero, Campo, Seccion } from "./campos";
import type { PropsPestana } from "./tipos";

export default function TabResumen({ plan, setPlan, solapados }: PropsPestana & { solapados: string[] }) {
  const cambiar = <K extends keyof typeof plan>(k: K, v: (typeof plan)[K]) => setPlan((p) => ({ ...p, [k]: v }));
  return (
    <Seccion titulo="Resumen del Plan">
      {solapados.length > 0 && (
        <div style={{ padding: "10px 14px", borderLeft: "4px solid var(--warning)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)" }}>
          ⚠️ Plan ya existente: el rango de fechas se solapa con {solapados.map((s) => `«${s}»`).join(", ")}. Para cada mes se aplica el plan activo con la fecha de inicio más reciente.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        <Campo etiqueta="Nombre del plan">
          <input className="form-input" value={plan.nombre} onChange={(e) => cambiar("nombre", e.target.value)} />
        </Campo>
        <Campo etiqueta="Fecha de inicio">
          <input className="form-input" type="date" value={plan.fechaInicio} onChange={(e) => cambiar("fechaInicio", e.target.value)} />
        </Campo>
        <Campo etiqueta="Fecha de fin">
          <input className="form-input" type="date" value={plan.fechaFin} onChange={(e) => cambiar("fechaFin", e.target.value)} />
        </Campo>
        <Campo etiqueta="Estado">
          <select className="form-input" value={plan.estado} onChange={(e) => cambiar("estado", e.target.value as typeof plan.estado)}>
            <option value="borrador">Borrador</option>
            <option value="activo">Activo</option>
            <option value="cerrado">Cerrado</option>
          </select>
        </Campo>
        <Campo etiqueta="Tramo mínimo (respecto a X)" ayuda="Por defecto −4">
          <InputEntero valor={plan.tramoMin} min={-20} max={0} onChange={(v) => cambiar("tramoMin", v)} />
        </Campo>
        <Campo etiqueta="Tramo máximo (respecto a X)" ayuda="Por defecto +3">
          <InputEntero valor={plan.tramoMax} min={0} max={20} onChange={(v) => cambiar("tramoMax", v)} />
        </Campo>
        <Campo etiqueta="Puntos por pedido" ayuda="Se suman en el mes del pedido si el coche cuenta otro mes (0 = no da puntos).">
          <InputCentesimas valor={plan.puntosPorPedido} onChange={(v) => cambiar("puntosPorPedido", v ?? 0)} sufijo="puntos" />
        </Campo>
      </div>
    </Seccion>
  );
}
