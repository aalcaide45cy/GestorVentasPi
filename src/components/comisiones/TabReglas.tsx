"use client";

import EditorTasas from "./EditorTasas";
import SelectorConcepto, { conceptosPropiosDelPlan } from "./SelectorConcepto";
import EditorReglas from "./EditorReglas";
import SelectorVehiculo from "./SelectorVehiculo";
import { BotonMini, InputCentesimas, InputEntero, Seccion } from "./campos";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { reglaNueva, type Plan, type PropsPestana } from "./tipos";

const TIPOS = ["CREDITO", "PREFERENCE", "RENTING", "CONTADO"] as const;
const ETIQUETA: Record<(typeof TIPOS)[number], string> = { CREDITO: "Crédito", PREFERENCE: "Preference", RENTING: "Renting", CONTADO: "Contado" };

type CondicionTasa = "indiferente" | "cumplida" | "no_cumplida";
type AmbitoTasa = "marca" | "global" | "vo";

/**
 * Condición de una regla financiera sobre la tasa de intervención: «indiferente» (siempre se cobra), «cumplida» o «no cumplida», y
 * qué tasa se mira: la de la marca del coche, la global (todos los nuevos) o la de usados.
 */
function SelectorTasa({ condicion, ambito, umbral, alCambiar }: { condicion: CondicionTasa; ambito: AmbitoTasa; umbral: number | null; alCambiar: (c: { tasaIntervencion?: CondicionTasa; tasaAmbito?: AmbitoTasa; tasaUmbral?: number | null }) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "190px" }}>
      <select className="form-input" value={condicion} onChange={(e) => alCambiar({ tasaIntervencion: e.target.value as CondicionTasa })} title="Indiferente: se cobra siempre. Cumplida o no cumplida: solo se cobra en esa situación de la tasa del mes.">
        <option value="indiferente">Indiferente (siempre)</option>
        <option value="cumplida">Solo si está cumplida</option>
        <option value="no_cumplida">Solo si NO está cumplida</option>
      </select>
      {condicion !== "indiferente" && (
        <>
          <select className="form-input" value={ambito} onChange={(e) => alCambiar({ tasaAmbito: e.target.value as AmbitoTasa })} title="Qué tasa de intervención financiera se comprueba">
            <option value="marca">Tasa de la marca del coche</option>
            <option value="global">Tasa global (todos los nuevos)</option>
            <option value="vo">Tasa de usados (VO)</option>
          </select>
          <select className="form-input" value={umbral === null ? "plan" : "propio"} onChange={(e) => alCambiar({ tasaUmbral: e.target.value === "plan" ? null : 70 })} title="Con qué se compara la tasa real: el objetivo fijado en el plan o un porcentaje que escribes en esta línea">
            <option value="plan">Según el objetivo del plan</option>
            <option value="propio">Con un % propio…</option>
          </select>
          {umbral !== null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <InputEntero valor={umbral} min={0} max={100} onChange={(n) => alCambiar({ tasaUmbral: n })} />
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>% de tasa</span>
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** Financiación / Reglas del Plan. */
type FilaFin = { f: Plan["financiacion"][number]; i: number };
type FilaPref = { r: Plan["preference"][number]; i: number };

const TEXTO_TASA = { indiferente: "Siempre", cumplida: "Solo si cumplida", no_cumplida: "Solo si NO cumplida" } as const;
const TEXTO_AMBITO = { marca: "de la marca", global: "global", vo: "de usados" } as const;
const textoTasa = (c: CondicionTasa, a: AmbitoTasa, u: number | null): string => (c === "indiferente" ? TEXTO_TASA[c] : `${TEXTO_TASA[c]} (${TEXTO_AMBITO[a]}${u === null ? "" : `, ${u} %`})`);

export function TabReglas({ plan, setPlan, cat }: PropsPestana) {
  const nombreMarca = (id: number | null) => (id === null ? "Todas las marcas" : (cat.marcas.find((m) => m.id === id)?.nombre ?? ""));
  const sugerencias = conceptosPropiosDelPlan([...plan.financiacion, ...plan.preference]);
  const setFin = (i: number, c: Partial<Plan["financiacion"][number]>) => setPlan((p) => ({ ...p, financiacion: p.financiacion.map((x, j) => (j === i ? { ...x, ...c } : x)) }));
  const setPref = (i: number, c: Partial<Plan["preference"][number]>) => setPlan((p) => ({ ...p, preference: p.preference.map((x, j) => (j === i ? { ...x, ...c } : x)) }));
  const destinoTexto = (concepto: string, defecto: string) => (concepto === "" ? `${defecto} (por defecto)` : concepto === "financiacion" ? "Financiación" : concepto === "preference" ? "Preference" : concepto.replace(/^extra:/, ""));

  const columnasFin: ColumnaTabla<FilaFin>[] = [
    {
      clave: "marca",
      etiqueta: "Marca",
      valor: ({ f }) => nombreMarca(f.idMarca),
      celda: ({ f, i }) => (
        <select className="form-input" style={{ minWidth: "130px" }} value={f.idMarca} onChange={(e) => setFin(i, { idMarca: Number(e.target.value) })}>
          {cat.marcas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      ),
    },
    {
      clave: "disparador",
      etiqueta: "Disparador (tipo de financiación)",
      valor: ({ f }) => ETIQUETA[f.tipoFinanciacion],
      ayuda: "Tipo de pago del expediente que activa esta línea",
      celda: ({ f, i }) => (
        <select className="form-input" style={{ minWidth: "130px" }} value={f.tipoFinanciacion} onChange={(e) => setFin(i, { tipoFinanciacion: e.target.value as (typeof TIPOS)[number] })}>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA[t]}
            </option>
          ))}
        </select>
      ),
    },
    { clave: "aplicaA", etiqueta: "Se aplica a", valor: ({ f }) => f.aplicaA, ayuda: "A qué coches afecta esta línea: nuevos, usados o los dos", celda: ({ f, i }) => <SelectorVehiculo estilo="financiacion" valor={f.aplicaA} alCambiar={(v) => setFin(i, { aplicaA: v })} /> },
    { clave: "tasa", etiqueta: "Tasa de intervención", valor: ({ f }) => textoTasa(f.tasaIntervencion, f.tasaAmbito, f.tasaUmbral), ayuda: "Solo se cobra si la tasa está (o no) cumplida; elige qué tasa se mira y con qué se compara", celda: ({ f, i }) => <SelectorTasa condicion={f.tasaIntervencion} ambito={f.tasaAmbito} umbral={f.tasaUmbral} alCambiar={(c) => setFin(i, c)} /> },
    { clave: "destino", etiqueta: "Va a la columna", valor: ({ f }) => destinoTexto(f.concepto, f.tipoFinanciacion === "PREFERENCE" ? "Preference" : "Financiación"), ayuda: "Columna de las tablas de comisiones en la que se anota el importe", celda: ({ f, i }) => <SelectorConcepto valor={f.concepto} defecto={f.tipoFinanciacion === "PREFERENCE" ? "preference" : "financiacion"} sugerencias={sugerencias} alCambiar={(v) => setFin(i, { concepto: v })} /> },
    { clave: "importe", etiqueta: "Importe (€)", valor: ({ f }) => f.importe, celda: ({ f, i }) => <InputCentesimas valor={f.importe} onChange={(v) => setFin(i, { importe: v ?? 0 })} /> },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      valor: () => "",
      celda: ({ i }) => (
        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
          <BotonMini titulo="Crea una copia de esta línea justo debajo, para cambiar solo la marca, el tipo o la columna" onClick={() => setPlan((p) => ({ ...p, financiacion: [...p.financiacion.slice(0, i + 1), { ...p.financiacion[i] }, ...p.financiacion.slice(i + 1)] }))}>
            Duplicar
          </BotonMini>
          <BotonMini peligro onClick={() => setPlan((p) => ({ ...p, financiacion: p.financiacion.filter((_, j) => j !== i) }))}>
            Quitar
          </BotonMini>
        </div>
      ),
    },
  ];

  const columnasPref: ColumnaTabla<FilaPref>[] = [
    { clave: "nombre", etiqueta: "Nombre", valor: ({ r }) => r.nombre ?? "", celda: ({ r, i }) => <input className="form-input" style={{ minWidth: "160px" }} placeholder="Nombre" value={r.nombre ?? ""} onChange={(e) => setPref(i, { nombre: e.target.value || null })} /> },
    {
      clave: "marca",
      etiqueta: "Marca",
      valor: ({ r }) => nombreMarca(r.idMarca),
      celda: ({ r, i }) => (
        <select className="form-input" style={{ minWidth: "130px" }} value={r.idMarca ?? ""} onChange={(e) => setPref(i, { idMarca: e.target.value ? Number(e.target.value) : null, idModelo: null })}>
          <option value="">Todas las marcas</option>
          {cat.marcas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      ),
    },
    {
      clave: "modelo",
      etiqueta: "Modelo",
      valor: ({ r }) => (r.idModelo === null ? "Todos los modelos" : (cat.modelos.find((m) => m.id === r.idModelo)?.nombre ?? "")),
      celda: ({ r, i }) => (
        <select className="form-input" style={{ minWidth: "150px" }} value={r.idModelo ?? ""} onChange={(e) => setPref(i, { idModelo: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Todos los modelos</option>
          {cat.modelos
            .filter((m) => r.idMarca === null || m.marcaId === r.idMarca)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
        </select>
      ),
    },
    { clave: "aplicaA", etiqueta: "Se aplica a", valor: ({ r }) => r.aplicaA, ayuda: "A qué coches afecta esta regla: nuevos, usados o los dos", celda: ({ r, i }) => <SelectorVehiculo estilo="financiacion" valor={r.aplicaA} alCambiar={(v) => setPref(i, { aplicaA: v })} /> },
    { clave: "tasa", etiqueta: "Tasa de intervención", valor: ({ r }) => textoTasa(r.tasaIntervencion, r.tasaAmbito, r.tasaUmbral), celda: ({ r, i }) => <SelectorTasa condicion={r.tasaIntervencion} ambito={r.tasaAmbito} umbral={r.tasaUmbral} alCambiar={(c) => setPref(i, c)} /> },
    { clave: "destino", etiqueta: "Va a la columna", valor: ({ r }) => destinoTexto(r.concepto, "Preference"), celda: ({ r, i }) => <SelectorConcepto valor={r.concepto} defecto="preference" sugerencias={sugerencias} alCambiar={(v) => setPref(i, { concepto: v })} /> },
    { clave: "importe", etiqueta: "Importe (€)", valor: ({ r }) => r.importe, celda: ({ r, i }) => <InputCentesimas valor={r.importe} onChange={(v) => setPref(i, { importe: v ?? 0 })} /> },
    { clave: "activa", etiqueta: "Activa", valor: ({ r }) => (r.activa ? "Sí" : "No"), celda: ({ r, i }) => <input type="checkbox" checked={r.activa} onChange={(e) => setPref(i, { activa: e.target.checked })} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} /> },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      valor: () => "",
      celda: ({ i }) => (
        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
          <BotonMini titulo="Crea una copia de esta regla justo debajo" onClick={() => setPlan((p) => ({ ...p, preference: [...p.preference.slice(0, i + 1), { ...p.preference[i], nombre: p.preference[i].nombre ? `${p.preference[i].nombre} (copia)` : null }, ...p.preference.slice(i + 1)] }))}>
            Duplicar
          </BotonMini>
          <BotonMini peligro onClick={() => setPlan((p) => ({ ...p, preference: p.preference.filter((_, j) => j !== i) }))}>
            Quitar
          </BotonMini>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Seccion
        titulo="Incentivo de financiación por marca y tipo"
        ayuda="Se genera en el mes de la fecha RCI para ventas a Crédito, Preference o Renting. El Contado no genera incentivo. Cada línea tiene su disparador (el tipo de financiación), su condición de tasa y la columna a la que va el importe: para repartir 125 € entre Financiación y Preference, crea una línea de cada. Las líneas se pueden ordenar por cualquier columna y elegir qué columnas ver."
      >
        <h4 style={{ margin: 0, fontSize: "0.95rem" }}>Tasa de intervención financiera</h4>
        <EditorTasas plan={plan} setPlan={setPlan} cat={cat} ambito="todas" />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginTop: "6px" }}>
          <h4 style={{ margin: 0, fontSize: "0.95rem" }}>Líneas de incentivo ({plan.financiacion.length})</h4>
          <BotonMini
            titulo="Añade una línea de incentivo nueva (la verás en la tabla de abajo)"
            onClick={() => {
              const marca = cat.marcas[0];
              if (marca) setPlan((p) => ({ ...p, financiacion: [...p.financiacion, { idMarca: marca.id, tipoFinanciacion: "CREDITO", aplicaA: "VN", importe: 0, tasaIntervencion: "indiferente", tasaAmbito: "marca", concepto: "", tasaUmbral: null }] }));
            }}
          >
            + Añadir incentivo
          </BotonMini>
        </div>
        <TablaDatos<FilaFin>
          id="plan-incentivos"
          columnas={columnasFin}
          filas={plan.financiacion.map((f, i) => ({ f, i }))}
          clave={(x) => x.i}
          ordenInicial={{ clave: "marca", asc: true }}
          placeholder="Buscar por marca, disparador, columna…"
          vacio="Sin incentivos de financiación en el plan. Pulsa «+ Añadir incentivo»."
        />
      </Seccion>

      <Seccion titulo="Reglas Preference / BOX3" ayuda="Por cada columna de destino se aplica solo la regla más específica: marca + modelo, después modelo, después marca y por último la general. Se pueden ordenar por cualquier columna." acciones={<BotonMini onClick={() => setPlan((p) => ({ ...p, preference: [...p.preference, { nombre: "", idMarca: null, idModelo: null, tipoFinanciacion: null, aplicaA: "VN", importe: 0, activa: true, tasaIntervencion: "indiferente", tasaAmbito: "marca", concepto: "", tasaUmbral: null }] }))}>+ Nueva regla</BotonMini>}>
        <TablaDatos<FilaPref>
          id="plan-reglas-preference"
          columnas={columnasPref}
          filas={plan.preference.map((r, i) => ({ r, i }))}
          clave={(x) => x.i}
          ordenInicial={{ clave: "marca", asc: true }}
          estiloFila={(x) => (x.r.activa ? {} : { opacity: 0.6 })}
          placeholder="Buscar por nombre, marca, modelo…"
          vacio="Sin reglas de Preference / BOX3 en el plan."
        />
      </Seccion>

      <Seccion titulo="Reglas especiales" ayuda="Reglas adicionales del plan con evento, filtros y efecto (importe y/o puntos).">
        <EditorReglas fechasPlan={{ inicio: plan.fechaInicio, fin: plan.fechaFin }} reglas={plan.reglas} onChange={(reglas) => setPlan((p) => ({ ...p, reglas }))} cat={cat} visibles={() => true} nueva={() => reglaNueva(false)} etiquetaNueva="+ Nueva regla especial" />
      </Seccion>
    </div>
  );
}

/** Bonus de Campaña Dinámicos. */
export function TabBonus({ plan, setPlan, cat }: PropsPestana) {
  return (
    <Seccion titulo="Bonus de Campaña Dinámicos" ayuda="Cada bonus se genera en el mes de su propio evento y solo mira la fecha de ese evento.">
      <EditorReglas fechasPlan={{ inicio: plan.fechaInicio, fin: plan.fechaFin }} reglas={plan.bonus} onChange={(bonus) => setPlan((p) => ({ ...p, bonus }))} cat={cat} visibles={(r) => !r.esPenalizacion} nueva={() => reglaNueva(false)} etiquetaNueva="+ Nuevo bonus" />
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
        <EditorReglas fechasPlan={{ inicio: plan.fechaInicio, fin: plan.fechaFin }} reglas={plan.bonus} onChange={(bonus) => setPlan((p) => ({ ...p, bonus }))} cat={cat} visibles={(r) => r.esPenalizacion} nueva={() => reglaNueva(true)} etiquetaNueva="+ Nueva penalización" />
      </Seccion>
    </div>
  );
}
