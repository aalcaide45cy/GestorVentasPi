"use client";

import EditorTasas from "./EditorTasas";
import RepartoImporte, { conceptosPropiosDelPlan } from "./RepartoImporte";
import EditorReglas from "./EditorReglas";
import SelectorVehiculo from "./SelectorVehiculo";
import { BotonMini, InputCentesimas, Seccion } from "./campos";
import { reglaNueva, type PropsPestana } from "./tipos";

const TIPOS = ["CREDITO", "PREFERENCE", "RENTING", "CONTADO"] as const;
const ETIQUETA: Record<(typeof TIPOS)[number], string> = { CREDITO: "Crédito", PREFERENCE: "Preference", RENTING: "Renting", CONTADO: "Contado" };

type CondicionTasa = "indiferente" | "cumplida" | "no_cumplida";
type AmbitoTasa = "marca" | "global" | "vo";

/**
 * Condición de una regla financiera sobre la tasa de intervención: «indiferente» (siempre se cobra), «cumplida» o «no cumplida», y
 * qué tasa se mira: la de la marca del coche, la global (todos los nuevos) o la de usados.
 */
function SelectorTasa({ condicion, ambito, alCambiar }: { condicion: CondicionTasa; ambito: AmbitoTasa; alCambiar: (c: { tasaIntervencion?: CondicionTasa; tasaAmbito?: AmbitoTasa }) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "190px" }}>
      <select className="form-input" value={condicion} onChange={(e) => alCambiar({ tasaIntervencion: e.target.value as CondicionTasa })} title="Indiferente: se cobra siempre. Cumplida o no cumplida: solo se cobra en esa situación de la tasa del mes.">
        <option value="indiferente">Indiferente (siempre)</option>
        <option value="cumplida">Solo si está cumplida</option>
        <option value="no_cumplida">Solo si NO está cumplida</option>
      </select>
      {condicion !== "indiferente" && (
        <select className="form-input" value={ambito} onChange={(e) => alCambiar({ tasaAmbito: e.target.value as AmbitoTasa })} title="Qué tasa de intervención financiera se comprueba">
          <option value="marca">Tasa de la marca del coche</option>
          <option value="global">Tasa global (todos los nuevos)</option>
          <option value="vo">Tasa de usados (VO)</option>
        </select>
      )}
    </div>
  );
}

/** Financiación / Reglas del Plan. */
export function TabReglas({ plan, setPlan, cat }: PropsPestana) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Seccion
        titulo="Incentivo de financiación por marca y tipo"
        ayuda="Se genera en el mes de la fecha RCI para ventas a Crédito, Preference o Renting. El Contado no genera incentivo. Cada línea puede cobrarse solo si la tasa de intervención financiera está cumplida o no (la de la marca del coche, la global de nuevos o la de usados): así puedes poner dos líneas para la misma marca con importes distintos según la tasa. Los objetivos de la tasa se pueden fijar aquí mismo, y también en Objetivo, Modelos VN y Resumen."
        acciones={
          <BotonMini
            onClick={() => {
              const marca = cat.marcas[0];
              if (marca) setPlan((p) => ({ ...p, financiacion: [...p.financiacion, { idMarca: marca.id, tipoFinanciacion: "CREDITO", aplicaA: "VN", importe: 0, tasaIntervencion: "indiferente", tasaAmbito: "marca", reparto: [] }] }));
            }}
          >
            + Añadir incentivo
          </BotonMini>
        }
      >
        <EditorTasas plan={plan} setPlan={setPlan} cat={cat} ambito="todas" />
        <div className="table-container">
          <table className="table-premium table-compact">
            <thead>
              <tr>
                <th>Marca</th>
                <th>Tipo de financiación</th>
                <th title="A qué coches afecta esta regla: nuevos, usados o los dos">Se aplica a</th>
                <th title="Solo se cobra si la tasa de intervención financiera está (o no) cumplida. Elige también qué tasa se mira.">Tasa de intervención</th>
                <th>Importe (€)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plan.financiacion.map((f, i) => (
                <tr key={i}>
                  <td>
                    <select className="form-input" style={{ minWidth: "150px" }} value={f.idMarca} onChange={(e) => setPlan((p) => ({ ...p, financiacion: p.financiacion.map((x, j) => (j === i ? { ...x, idMarca: Number(e.target.value) } : x)) }))}>
                      {cat.marcas.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select className="form-input" style={{ minWidth: "150px" }} value={f.tipoFinanciacion} onChange={(e) => setPlan((p) => ({ ...p, financiacion: p.financiacion.map((x, j) => (j === i ? { ...x, tipoFinanciacion: e.target.value as typeof f.tipoFinanciacion } : x)) }))}>
                      {TIPOS.map((t) => (
                        <option key={t} value={t}>
                          {ETIQUETA[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <SelectorVehiculo estilo="financiacion" valor={f.aplicaA} alCambiar={(v) => setPlan((p) => ({ ...p, financiacion: p.financiacion.map((x, j) => (j === i ? { ...x, aplicaA: v } : x)) }))} />
                  </td>
                  <td>
                    <SelectorTasa condicion={f.tasaIntervencion} ambito={f.tasaAmbito} alCambiar={(c) => setPlan((p) => ({ ...p, financiacion: p.financiacion.map((x, j) => (j === i ? { ...x, ...c } : x)) }))} />
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <InputCentesimas valor={f.importe} onChange={(v) => setPlan((p) => ({ ...p, financiacion: p.financiacion.map((x, j) => (j === i ? { ...x, importe: v ?? 0 } : x)) }))} />
                      <RepartoImporte importe={f.importe} reparto={f.reparto} defecto={f.tipoFinanciacion === "PREFERENCE" ? "preference" : "financiacion"} sugerencias={conceptosPropiosDelPlan([...plan.financiacion, ...plan.preference])} alCambiar={(r) => setPlan((p) => ({ ...p, financiacion: p.financiacion.map((x, j) => (j === i ? { ...x, reparto: r } : x)) }))} />
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <BotonMini titulo="Crea una copia de esta línea justo debajo, para cambiar solo la marca o el tipo" onClick={() => setPlan((p) => ({ ...p, financiacion: [...p.financiacion.slice(0, i + 1), { ...p.financiacion[i] }, ...p.financiacion.slice(i + 1)] }))}>
                        Duplicar
                      </BotonMini>
                      <BotonMini peligro onClick={() => setPlan((p) => ({ ...p, financiacion: p.financiacion.filter((_, j) => j !== i) }))}>
                        Quitar
                      </BotonMini>
                    </div>
                  </td>
                </tr>
              ))}
              {plan.financiacion.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    Sin incentivos de financiación en el plan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Seccion>

      <Seccion
        titulo="Reglas Preference / BOX3"
        ayuda="Se aplica solo la regla más específica: marca + modelo, después modelo, después marca y por último la general."
        acciones={<BotonMini onClick={() => setPlan((p) => ({ ...p, preference: [...p.preference, { nombre: "", idMarca: null, idModelo: null, tipoFinanciacion: null, aplicaA: "VN", importe: 0, activa: true, tasaIntervencion: "indiferente", tasaAmbito: "marca", reparto: [] }] }))}>+ Nueva regla</BotonMini>}
      >
        <div className="table-container">
          <table className="table-premium table-compact">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Marca</th>
                <th>Modelo</th>
                <th title="A qué coches afecta esta regla: nuevos, usados o los dos">Se aplica a</th>
                <th title="Solo se cobra si la tasa de intervención financiera está (o no) cumplida. Elige también qué tasa se mira.">Tasa de intervención</th>
                <th>Importe (€)</th>
                <th>Activa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plan.preference.map((r, i) => {
                const set = (c: Partial<typeof r>) => setPlan((p) => ({ ...p, preference: p.preference.map((x, j) => (j === i ? { ...x, ...c } : x)) }));
                return (
                  <tr key={i} style={{ opacity: r.activa ? 1 : 0.6 }}>
                    <td>
                      <input className="form-input" style={{ minWidth: "180px" }} placeholder="Nombre" value={r.nombre ?? ""} onChange={(e) => set({ nombre: e.target.value || null })} />
                    </td>
                    <td>
                      <select className="form-input" style={{ minWidth: "150px" }} value={r.idMarca ?? ""} onChange={(e) => set({ idMarca: e.target.value ? Number(e.target.value) : null, idModelo: null })}>
                        <option value="">Todas las marcas</option>
                        {cat.marcas.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select className="form-input" style={{ minWidth: "170px" }} value={r.idModelo ?? ""} onChange={(e) => set({ idModelo: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">Todos los modelos</option>
                        {cat.modelos
                          .filter((m) => r.idMarca === null || m.marcaId === r.idMarca)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nombre}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <SelectorVehiculo estilo="financiacion" valor={r.aplicaA} alCambiar={(v) => set({ aplicaA: v })} />
                    </td>
                    <td>
                      <SelectorTasa condicion={r.tasaIntervencion} ambito={r.tasaAmbito} alCambiar={(c) => set(c)} />
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <InputCentesimas valor={r.importe} onChange={(v) => set({ importe: v ?? 0 })} />
                        <RepartoImporte importe={r.importe} reparto={r.reparto} defecto="preference" sugerencias={conceptosPropiosDelPlan([...plan.financiacion, ...plan.preference])} alCambiar={(rep) => set({ reparto: rep })} />
                      </div>
                    </td>
                    <td>
                      <input type="checkbox" checked={r.activa} onChange={(e) => set({ activa: e.target.checked })} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <BotonMini titulo="Crea una copia de esta regla justo debajo" onClick={() => setPlan((p) => ({ ...p, preference: [...p.preference.slice(0, i + 1), { ...p.preference[i], nombre: p.preference[i].nombre ? `${p.preference[i].nombre} (copia)` : null }, ...p.preference.slice(i + 1)] }))}>
                          Duplicar
                        </BotonMini>
                        <BotonMini peligro onClick={() => setPlan((p) => ({ ...p, preference: p.preference.filter((_, j) => j !== i) }))}>
                          Quitar
                        </BotonMini>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {plan.preference.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    Sin reglas de Preference / BOX3 en el plan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Seccion>

      <Seccion titulo="Reglas especiales" ayuda="Reglas adicionales del plan con evento, filtros y efecto (importe y/o puntos).">
        <EditorReglas reglas={plan.reglas} onChange={(reglas) => setPlan((p) => ({ ...p, reglas }))} cat={cat} visibles={() => true} nueva={() => reglaNueva(false)} etiquetaNueva="+ Nueva regla especial" />
      </Seccion>
    </div>
  );
}

/** Bonus de Campaña Dinámicos. */
export function TabBonus({ plan, setPlan, cat }: PropsPestana) {
  return (
    <Seccion titulo="Bonus de Campaña Dinámicos" ayuda="Cada bonus se genera en el mes de su propio evento y solo mira la fecha de ese evento.">
      <EditorReglas reglas={plan.bonus} onChange={(bonus) => setPlan((p) => ({ ...p, bonus }))} cat={cat} visibles={(r) => !r.esPenalizacion} nueva={() => reglaNueva(false)} etiquetaNueva="+ Nuevo bonus" />
    </Seccion>
  );
}

/** Penalización única global + reglas de penalización dinámicas. */
export function TabPenalizaciones({ plan, setPlan, cat }: PropsPestana) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Seccion titulo="⚠️ Penalización Única Global" ayuda="Importe fijo que se resta del total del mes (la comisión neta nunca baja de 0).">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          <div>
            <label className="form-label">Importe</label>
            <InputCentesimas valor={plan.penalizacionImporte} sufijo="€" onChange={(v) => setPlan((p) => ({ ...p, penalizacionImporte: Math.max(0, v ?? 0) }))} />
          </div>
          <div>
            <label className="form-label">Título</label>
            <input className="form-input" value={plan.penalizacionTitulo ?? ""} onChange={(e) => setPlan((p) => ({ ...p, penalizacionTitulo: e.target.value || null }))} />
          </div>
          <div>
            <label className="form-label">Descripción</label>
            <input className="form-input" value={plan.penalizacionDescripcion ?? ""} onChange={(e) => setPlan((p) => ({ ...p, penalizacionDescripcion: e.target.value || null }))} />
          </div>
        </div>
      </Seccion>
      <Seccion titulo="Reglas de Penalización Dinámicas" ayuda="Restan su importe en el mes de su evento si el expediente cumple los filtros.">
        <EditorReglas reglas={plan.bonus} onChange={(bonus) => setPlan((p) => ({ ...p, bonus }))} cat={cat} visibles={(r) => r.esPenalizacion} nueva={() => reglaNueva(true)} etiquetaNueva="+ Nueva penalización" />
      </Seccion>
    </div>
  );
}
