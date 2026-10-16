"use client";

import { InputCentesimas, InputEntero, Campo, Seccion } from "./campos";
import type { PropsPestana } from "./tipos";

const tarjeta = (titulo: string, valor: string, destacado = false) => (
  <div key={titulo} style={{ padding: "16px 18px", borderRadius: "var(--radius-sm)", background: "var(--bg-surface-tint)", border: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: "6px" }}>
    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{titulo}</span>
    <strong style={{ fontSize: "1.9rem", lineHeight: 1.1, color: destacado ? "var(--primary)" : "var(--text-primary)" }}>{valor}</strong>
  </div>
);

const num = (n: number) => (n / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 });

export default function TabResumen({ plan, setPlan, cat, solapados }: PropsPestana & { solapados: string[] }) {
  const cambiar = <K extends keyof typeof plan>(k: K, v: (typeof plan)[K]) => setPlan((p) => ({ ...p, [k]: v }));
  const objetivoTotal = plan.vendedores.reduce((a, v) => a + v.objetivoBase + v.arrastre, 0);
  const modelosConfigurados = new Set(plan.tarifasVN.map((t) => t.idModelo)).size;
  const lineasEspeciales = plan.reglas.filter((r) => !r.esPenalizacion).length;
  const punto = (texto: string, valor: string | number) => (
    <li key={texto}>
      {texto}: <strong style={{ color: "var(--text-primary)" }}>{valor}</strong>
    </li>
  );
  return (
    <Seccion titulo="Resumen del Plan">
      {solapados.length > 0 && (
        <div style={{ padding: "10px 14px", borderLeft: "4px solid var(--warning)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)" }}>
          ⚠️ Plan ya existente: el rango de fechas se solapa con {solapados.map((s) => `«${s}»`).join(", ")}. Para cada mes se aplica el plan activo con la fecha de inicio más reciente.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          tarjeta("Vendedores en el plan", String(plan.vendedores.length)),
          tarjeta("Objetivo X total (puntos)", num(objetivoTotal), true),
          tarjeta("Marcas con tasa", String(plan.tasas.length)),
          tarjeta("Tramos", `X${plan.tramoMin} … X+${plan.tramoMax}`),
        ]}
      </div>
      <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "6px", color: "var(--text-secondary)" }}>
        {punto("Modelos VN configurados en el plan", `${modelosConfigurados} de ${cat.modelos.length} totales`)}
        {punto("Tarifas de usados configuradas", plan.usados.length)}
        {punto("Financiación por marca parametrizada", `${plan.financiacion.length} tarifas`)}
        {punto("Reglas de Preference/BOX3 configuradas", plan.preference.length)}
        {punto("Reglas especiales creadas", lineasEspeciales)}
        {punto("Bonus de campaña configurados", plan.bonus.length)}
        {punto("Patrones progresivos de VO", plan.patrones.length)}
        {punto("Promociones de puntos", plan.promociones.length)}
      </ul>

      <h4 style={{ margin: "10px 0 0", fontSize: "1rem" }}>Ajustes del plan</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", alignItems: "start" }}>
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
