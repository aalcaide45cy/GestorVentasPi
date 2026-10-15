"use client";

import EditorReglas from "./EditorReglas";
import { BotonMini, InputCentesimas, Seccion } from "./campos";
import { reglaNueva, type PropsPestana } from "./tipos";

const TIPOS = ["CREDITO", "PREFERENCE", "RENTING", "CONTADO"] as const;
const ETIQUETA: Record<(typeof TIPOS)[number], string> = { CREDITO: "Crédito", PREFERENCE: "Preference", RENTING: "Renting", CONTADO: "Contado" };

/** Financiación / Reglas del Plan. */
export function TabReglas({ plan, setPlan, cat }: PropsPestana) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Seccion
        titulo="Incentivo de financiación por marca y tipo"
        ayuda="Se genera en el mes de la fecha RCI para ventas a Crédito, Preference o Renting. El Contado no genera incentivo."
        acciones={
          <BotonMini
            onClick={() => {
              const marca = cat.marcas[0];
              if (marca) setPlan((p) => ({ ...p, financiacion: [...p.financiacion, { idMarca: marca.id, tipoFinanciacion: "CREDITO", importe: 0 }] }));
            }}
          >
            + Añadir incentivo
          </BotonMini>
        }
      >
        {plan.financiacion.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <select className="form-input" style={{ width: "auto" }} value={f.idMarca} onChange={(e) => setPlan((p) => ({ ...p, financiacion: p.financiacion.map((x, j) => (j === i ? { ...x, idMarca: Number(e.target.value) } : x)) }))}>
              {cat.marcas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
            <select className="form-input" style={{ width: "auto" }} value={f.tipoFinanciacion} onChange={(e) => setPlan((p) => ({ ...p, financiacion: p.financiacion.map((x, j) => (j === i ? { ...x, tipoFinanciacion: e.target.value as typeof f.tipoFinanciacion } : x)) }))}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA[t]}
                </option>
              ))}
            </select>
            <InputCentesimas valor={f.importe} sufijo="€" onChange={(v) => setPlan((p) => ({ ...p, financiacion: p.financiacion.map((x, j) => (j === i ? { ...x, importe: v ?? 0 } : x)) }))} />
            <BotonMini peligro onClick={() => setPlan((p) => ({ ...p, financiacion: p.financiacion.filter((_, j) => j !== i) }))}>
              Quitar
            </BotonMini>
          </div>
        ))}
      </Seccion>

      <Seccion
        titulo="Reglas Preference / BOX3"
        ayuda="Se aplica solo la regla más específica: marca + modelo, después modelo, después marca y por último la general."
        acciones={<BotonMini onClick={() => setPlan((p) => ({ ...p, preference: [...p.preference, { nombre: "", idMarca: null, idModelo: null, tipoFinanciacion: null, importe: 0, activa: true }] }))}>+ Nueva regla</BotonMini>}
      >
        {plan.preference.map((r, i) => {
          const set = (c: Partial<typeof r>) => setPlan((p) => ({ ...p, preference: p.preference.map((x, j) => (j === i ? { ...x, ...c } : x)) }));
          return (
            <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", opacity: r.activa ? 1 : 0.6 }}>
              <input className="form-input" style={{ width: "180px" }} placeholder="Nombre" value={r.nombre ?? ""} onChange={(e) => set({ nombre: e.target.value || null })} />
              <select className="form-input" style={{ width: "auto" }} value={r.idMarca ?? ""} onChange={(e) => set({ idMarca: e.target.value ? Number(e.target.value) : null, idModelo: null })}>
                <option value="">Todas las marcas</option>
                {cat.marcas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <select className="form-input" style={{ width: "auto" }} value={r.idModelo ?? ""} onChange={(e) => set({ idModelo: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Todos los modelos</option>
                {cat.modelos
                  .filter((m) => r.idMarca === null || m.marcaId === r.idMarca)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
              </select>
              <InputCentesimas valor={r.importe} sufijo="€" onChange={(v) => set({ importe: v ?? 0 })} />
              <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input type="checkbox" checked={r.activa} onChange={(e) => set({ activa: e.target.checked })} /> Activa
              </label>
              <BotonMini peligro onClick={() => setPlan((p) => ({ ...p, preference: p.preference.filter((_, j) => j !== i) }))}>
                Quitar
              </BotonMini>
            </div>
          );
        })}
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
