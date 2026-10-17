"use client";

import { useEffect, useState } from "react";
import { BotonMini, InputCentesimas, InputEntero, Seccion } from "./campos";
import type { PropsPestana } from "./tipos";

export default function TabUsados({ plan, setPlan }: PropsPestana) {
  // Subtipos que se gestionan en Configuración › Estados
  const [subtipos, setSubtipos] = useState<string[]>(["USADO", "KM0", "DEMO", "BUYBACK"]);
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/admin/subtipos-vo");
        if (r.ok) setSubtipos(((await r.json()) as { data: { nombre: string }[] }).data.map((s) => s.nombre));
      } catch {
        /* se usan los habituales */
      }
    })();
  }, []);
  const patronesVn = plan.patrones.filter((p) => p.activo && p.aplicaAVn);
  const tarifasActivas = plan.usados.filter((u) => u.activo);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Seccion titulo="¿Cuánto cobra un usado? Así se decide" ayuda="La aplicación mira estas reglas por orden y usa la primera que encuentra. Un usado cuenta en el mes de su fecha de facturación.">
        <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "0.88rem", lineHeight: 1.7 }}>
          <li>
            <b>Comisión a mano</b> en el expediente (casilla «Comisión del coche a mano»): si está rellena, manda siempre.
          </li>
          <li>
            <b>Patrón progresivo</b> (tabla de abajo): para vendedores de VO, o de VN si el patrón tiene marcado «Aplica a vendedores VN» y es el que tiene asignado el vendedor (campo «Patrón VO» del usuario). Se cobra según el número de usado del mes: el 1.º una cantidad, el 2.º otra, etc.
          </li>
          <li>
            <b>Tarifa por subtipo</b> (tabla del medio): para vendedores de VN cuando no hay patrón. Cada subtipo (USADO, KM0, DEMO, BUYBACK…) tiene su importe de primera unidad y de las siguientes. Si el subtipo no está en la tabla, el usado cobra 0 €.
          </li>
        </ol>
        {patronesVn.length === 0 && tarifasActivas.length === 0 && (
          <div style={{ color: "var(--warning)", fontSize: "0.85rem" }}>⚠️ Ahora mismo no hay ni patrón para vendedores VN ni tarifas activas: los usados de un vendedor VN cobrarán 0 €.</div>
        )}
      </Seccion>

      <Seccion
        titulo="Cómo cuentan los usados"
        ayuda="Usado, KM0, Demo y Buyback son lo mismo: coches de ocasión (VO). Elige cuándo cuenta cada uno y si suma puntos al objetivo del vendedor. Qué estados son nuevos o usados se define en Configuración › Estados."
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
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
        ayuda="Para vendedores de VN que venden VO (si no se aplica un patrón): cada subtipo tiene su propio contador. Primera unidad, resto y mínimo de unidades del mes para empezar a pagar (0 = sin mínimo). Los subtipos se crean en Configuración › Estados."
        acciones={<BotonMini onClick={() => setPlan((p) => ({ ...p, usados: [...p.usados, { subtipo: subtipos.find((s) => !p.usados.some((x) => x.subtipo === s)) ?? "KM0", importePrimera: 0, importeResto: 0, minAplicar: 0, activo: true }] }))}>+ Añadir subtipo</BotonMini>}
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
                      <input className="form-input" list="subtipos-vo" value={u.subtipo} onChange={(e) => set({ subtipo: e.target.value.toUpperCase() })} style={{ width: "140px" }} title="Elige uno de los subtipos de Configuración › Estados" />
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
            {subtipos.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </Seccion>

      <Seccion
        titulo="Patrones de Comisionamiento Progresivos VO"
        ayuda="Escala por número de usado del mes, ordenados por fecha de facturación (usado 1 → X €, 2 → Y €…). Pasado el último escalón se repite el último; con «Rotativo» se vuelve a empezar por el primero (150 / 200 / 250 → el 4.º cobra 150 €). Sin escalones se pagan 150,00 € por unidad. Se aplica a los vendedores de VO y, a los de VN, solo si el patrón marca «Aplica a vendedores VN» y es el asignado al usuario."
        acciones={<BotonMini onClick={() => setPlan((p) => ({ ...p, patrones: [...p.patrones, { nombre: "Estándar VO", aplicaAVn: false, rotativo: false, activo: true, tiers: [{ unidad: 1, importe: 15000 }] }] }))}>+ Nuevo patrón</BotonMini>}
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
                <label style={{ display: "flex", gap: "6px", alignItems: "center" }} title="Con «rotativo», tras el último escalón se vuelve a empezar: con 150 / 200 / 250 €, el 4.º usado del mes cobra 150 €, el 5.º 200 €… Sin rotativo, del 4.º en adelante se sigue cobrando el último (250 €).">
                  <input type="checkbox" checked={pt.rotativo} onChange={(e) => set({ rotativo: e.target.checked })} /> Rotativo
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
