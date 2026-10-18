"use client";

import { BotonMini, InputEntero } from "./campos";
import type { Plan, PropsPestana } from "./tipos";

type ClaveTasa = "tasaGlobal" | "tasaVo";

const FILAS: { clave: ClaveTasa; etiqueta: string }[] = [
  { clave: "tasaGlobal", etiqueta: "Global (todos los coches nuevos)" },
  { clave: "tasaVo", etiqueta: "Usados (VO)" },
];

const tipoDe = (p: Plan, c: ClaveTasa) => (c === "tasaGlobal" ? p.tasaGlobalTipo : p.tasaVoTipo);
const objetivoDe = (p: Plan, c: ClaveTasa) => (c === "tasaGlobal" ? p.tasaGlobalObjetivo : p.tasaVoObjetivo);

function cambiar(p: Plan, c: ClaveTasa, cambio: { tipo?: "porcentaje" | "unidades"; objetivo?: number | null }): Plan {
  const g = c === "tasaGlobal";
  return {
    ...p,
    ...(cambio.tipo !== undefined ? (g ? { tasaGlobalTipo: cambio.tipo } : { tasaVoTipo: cambio.tipo }) : {}),
    ...(cambio.objetivo !== undefined ? (g ? { tasaGlobalObjetivo: cambio.objetivo } : { tasaVoObjetivo: cambio.objetivo }) : {}),
  };
}

/**
 * Editor de la tasa de intervención financiera del plan. Se usa en varias pestañas para poder fijarla donde se está trabajando:
 * - `ambito="marca"` con `idMarca`: solo la tasa de esa marca (junto a sus tarifas de modelos).
 * - `ambito="global"`: la global, la de usados y si los usados financiados cuentan en las demás.
 * - `ambito="todas"`: todo lo anterior y todas las marcas.
 */
export default function EditorTasas({ plan, setPlan, cat, ambito, idMarca }: PropsPestana & { ambito: "marca" | "global" | "todas"; idMarca?: number }) {
  const marcasPlan = ambito === "marca" ? plan.tasas.filter((t) => t.idMarca === idMarca) : ambito === "todas" ? plan.tasas : [];
  const nombreMarca = (id: number) => cat.marcas.find((m) => m.id === id)?.nombre ?? `Marca ${id}`;
  const falta = ambito === "marca" && idMarca !== undefined && !plan.tasas.some((t) => t.idMarca === idMarca);
  const marcasLibres = ambito === "todas" ? cat.marcas.filter((m) => !plan.tasas.some((t) => t.idMarca === m.id)) : [];
  const nuevaMarca = (id: number) => setPlan((p) => ({ ...p, tasas: [...p.tasas, { idMarca: id, tipoTasa: "porcentaje", objetivo: 70, puntosDefecto: 100 }] }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div className="table-container">
        <table className="table-premium table-compact">
          <thead>
            <tr>
              <th>Tasa de intervención</th>
              <th title="Sin objetivo, la tasa se da siempre por cumplida">Con objetivo</th>
              <th>Tipo</th>
              <th>Objetivo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(ambito === "global" || ambito === "todas") &&
              FILAS.map((f) => {
                const objetivo = objetivoDe(plan, f.clave);
                return (
                  <tr key={f.clave}>
                    <td>{f.etiqueta}</td>
                    <td>
                      <input type="checkbox" checked={objetivo !== null} onChange={(e) => setPlan((p) => cambiar(p, f.clave, { objetivo: e.target.checked ? 70 : null }))} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
                    </td>
                    <td>
                      <select className="form-input" value={tipoDe(plan, f.clave)} disabled={objetivo === null} onChange={(e) => setPlan((p) => cambiar(p, f.clave, { tipo: e.target.value === "unidades" ? "unidades" : "porcentaje" }))}>
                        <option value="porcentaje">Porcentaje (%)</option>
                        <option value="unidades">Unidades</option>
                      </select>
                    </td>
                    <td>{objetivo === null ? <span style={{ color: "var(--text-muted)" }}>Sin objetivo (siempre cumplida)</span> : <InputEntero valor={objetivo} min={0} onChange={(n) => setPlan((p) => cambiar(p, f.clave, { objetivo: n }))} />}</td>
                    <td />
                  </tr>
                );
              })}
            {marcasPlan.map((t) => (
              <tr key={t.idMarca}>
                <td>Marca {nombreMarca(t.idMarca)}</td>
                <td>Sí</td>
                <td>
                  <select className="form-input" value={t.tipoTasa} onChange={(e) => setPlan((p) => ({ ...p, tasas: p.tasas.map((x) => (x.idMarca === t.idMarca ? { ...x, tipoTasa: e.target.value === "unidades" ? "unidades" : "porcentaje" } : x)) }))}>
                    <option value="porcentaje">Porcentaje (%)</option>
                    <option value="unidades">Unidades</option>
                  </select>
                </td>
                <td>
                  <InputEntero valor={t.objetivo} min={0} onChange={(n) => setPlan((p) => ({ ...p, tasas: p.tasas.map((x) => (x.idMarca === t.idMarca ? { ...x, objetivo: n } : x)) }))} />
                </td>
                <td>
                  <BotonMini peligro titulo="Quita la tasa de esta marca: sin tasa propia se da por cumplida" onClick={() => setPlan((p) => ({ ...p, tasas: p.tasas.filter((x) => x.idMarca !== t.idMarca) }))}>
                    Quitar
                  </BotonMini>
                </td>
              </tr>
            ))}
            {falta && idMarca !== undefined && (
              <tr>
                <td>Marca {nombreMarca(idMarca)}</td>
                <td colSpan={4}>
                  <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => nuevaMarca(idMarca)}>
                    + Fijar el objetivo de tasa de esta marca
                  </button>
                  <span style={{ marginLeft: "8px", color: "var(--text-muted)", fontSize: "0.8rem" }}>Sin una fila de marca, su tasa se da por cumplida.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(ambito === "global" || ambito === "todas") && (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem" }}>
          <input type="checkbox" checked={plan.tasaIncluyeVo} onChange={(e) => setPlan((p) => ({ ...p, tasaIncluyeVo: e.target.checked }))} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
          Los usados (VO) financiados cuentan también en la tasa global y en la de cada marca
        </label>
      )}
      {marcasLibres.length > 0 && (
        <select className="form-input" style={{ width: "auto" }} value="" onChange={(e) => e.target.value && nuevaMarca(Number(e.target.value))}>
          <option value="">+ Añadir marca…</option>
          {marcasLibres.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
