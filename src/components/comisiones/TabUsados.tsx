"use client";

import { BotonMini, InputCentesimas, InputEntero, Seccion } from "./campos";
import type { PropsPestana } from "./tipos";

export default function TabUsados({ plan, setPlan }: PropsPestana) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Seccion
        titulo="Cómo cuentan los usados"
        ayuda="Usado, KM0, Demo y Buyback son lo mismo: coches de ocasión (VO). Elige cuándo cuenta cada uno y si suma puntos al objetivo del vendedor. Qué estados son nuevos o usados se define en Configuración › Estados."
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Fecha que hace contar a un usado</label>
            <select className="form-input" value={plan.voFecha} onChange={(e) => setPlan((p) => ({ ...p, voFecha: e.target.value as "cobro" | "facturacion" }))} title="Un usado cuenta en el mes de esta fecha. Si el expediente se cobra en otra fecha, manda esa">
              <option value="facturacion">Fecha de facturación (cuando ya está facturado)</option>
              <option value="cobro">Fecha de cobro</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Puntos de los usados</label>
            <select className="form-input" value={plan.voPuntosModo} onChange={(e) => setPlan((p) => ({ ...p, voPuntosModo: e.target.value as "cuentan" | "no" }))} title="Si cada usado suma puntos al objetivo X del vendedor o solo da comisión">
              <option value="cuentan">Suman puntos al objetivo</option>
              <option value="no">No suman puntos (solo comisión)</option>
            </select>
          </div>
          {plan.voPuntosModo === "cuentan" && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Puntos por cada usado</label>
              <InputCentesimas valor={plan.voPuntos ?? 100} onChange={(v) => setPlan((p) => ({ ...p, voPuntos: v ?? 100 }))} />
            </div>
          )}
        </div>
      </Seccion>

      <Seccion
        titulo="Tarifas de Vehículos Usados (BB / KM0 / etc.)"
        ayuda="Para vendedores de VN que venden VO: cada subtipo tiene su propio contador. Primera unidad, resto y mínimo de unidades (0 = sin mínimo)."
        acciones={<BotonMini onClick={() => setPlan((p) => ({ ...p, usados: [...p.usados, { subtipo: "KM0", importePrimera: 0, importeResto: 0, minAplicar: 0, activo: true }] }))}>+ Añadir subtipo</BotonMini>}
      >
        <div className="table-container">
          <table className="table-premium">
            <thead>
              <tr>
                <th>Subtipo</th>
                <th>Primera unidad</th>
                <th>Resto</th>
                <th>Mínimo</th>
                <th>Activa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plan.usados.map((u, i) => {
                const set = (c: Partial<typeof u>) => setPlan((p) => ({ ...p, usados: p.usados.map((x, j) => (j === i ? { ...x, ...c } : x)) }));
                return (
                  <tr key={i}>
                    <td>
                      <input className="form-input" list="subtipos-vo" value={u.subtipo} onChange={(e) => set({ subtipo: e.target.value.toUpperCase() })} style={{ width: "140px" }} />
                    </td>
                    <td>
                      <InputCentesimas valor={u.importePrimera} onChange={(v) => set({ importePrimera: v ?? 0 })} sufijo="€" />
                    </td>
                    <td>
                      <InputCentesimas valor={u.importeResto} onChange={(v) => set({ importeResto: v ?? 0 })} sufijo="€" />
                    </td>
                    <td>
                      <InputEntero valor={u.minAplicar} min={0} onChange={(v) => set({ minAplicar: v })} />
                    </td>
                    <td>
                      <input type="checkbox" checked={u.activo} onChange={(e) => set({ activo: e.target.checked })} />
                    </td>
                    <td>
                      <BotonMini peligro onClick={() => setPlan((p) => ({ ...p, usados: p.usados.filter((_, j) => j !== i) }))}>
                        Quitar
                      </BotonMini>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="subtipos-vo">
            {["USADO", "KM0", "DEMO", "BUYBACK"].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </Seccion>

      <Seccion
        titulo="Patrones de Comisionamiento Progresivos VO"
        ayuda="Escala por número de unidad cobrada en el mes (unidad 1 → X €, 2 → Y €…). Pasado el último escalón se repite el último. Sin escala: 150,00 € por unidad. Se aplica a los vendedores de VO (o a los patrones marcados «aplica a VN»)."
        acciones={<BotonMini onClick={() => setPlan((p) => ({ ...p, patrones: [...p.patrones, { nombre: "Estándar VO", aplicaAVn: false, activo: true, tiers: [{ unidad: 1, importe: 15000 }] }] }))}>+ Nuevo patrón</BotonMini>}
      >
        {plan.patrones.map((pt, i) => {
          const set = (c: Partial<typeof pt>) => setPlan((p) => ({ ...p, patrones: p.patrones.map((x, j) => (j === i ? { ...x, ...c } : x)) }));
          return (
            <div key={i} className="glass-panel" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <input className="form-input" style={{ width: "220px" }} value={pt.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Nombre del patrón" />
                <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input type="checkbox" checked={pt.aplicaAVn} onChange={(e) => set({ aplicaAVn: e.target.checked })} /> Aplica a vendedores VN
                </label>
                <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input type="checkbox" checked={pt.activo} onChange={(e) => set({ activo: e.target.checked })} /> Activo
                </label>
                <BotonMini peligro onClick={() => setPlan((p) => ({ ...p, patrones: p.patrones.filter((_, j) => j !== i) }))}>
                  Quitar patrón
                </BotonMini>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                {pt.tiers.map((t, k) => (
                  <span key={k} style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                    <span style={{ color: "var(--text-muted)" }}>Unidad {t.unidad}</span>
                    <InputCentesimas valor={t.importe} onChange={(v) => set({ tiers: pt.tiers.map((y, j) => (j === k ? { ...y, importe: v ?? 0 } : y)) })} sufijo="€" />
                  </span>
                ))}
                <BotonMini onClick={() => set({ tiers: [...pt.tiers, { unidad: pt.tiers.length + 1, importe: pt.tiers.at(-1)?.importe ?? 15000 }] })}>+ Escalón</BotonMini>
                {pt.tiers.length > 1 && <BotonMini onClick={() => set({ tiers: pt.tiers.slice(0, -1) })}>− Escalón</BotonMini>}
              </div>
            </div>
          );
        })}
      </Seccion>
    </div>
  );
}
