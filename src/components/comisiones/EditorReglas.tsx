"use client";

import FechaConAtajos from "./FechaConAtajos";
import SelectorVehiculo from "./SelectorVehiculo";
import { BotonMini, InputCentesimas } from "./campos";
import { nuevaClave, type CatalogosComisiones, type Regla } from "./tipos";

const EVENTOS: { v: Regla["evento"]; t: string }[] = [
  { v: "pedido", t: "Pedido" },
  { v: "afectacion", t: "Afectación" },
  { v: "matriculacion", t: "Matriculación (VO: cobro)" },
  { v: "cobro", t: "Cobro" },
  { v: "credito", t: "Crédito / financiación" },
  { v: "preference", t: "Preference" },
  { v: "manual", t: "Manual (se elige en cada expediente)" },
];

interface Props {
  reglas: Regla[];
  onChange: (r: Regla[]) => void;
  cat: CatalogosComisiones;
  /** Reglas visibles (índices en `reglas`); permite mostrar solo bonus o solo penalizaciones. */
  visibles: (r: Regla) => boolean;
  nueva: () => Regla;
  etiquetaNueva: string;
  /** Inicio y fin del plan: los botones «Plan» de las fechas los ponen. */
  fechasPlan: { inicio: string; fin: string };
}

/** Lista editable de reglas / bonus / penalizaciones con evento, filtros y efecto (1.7): una fila por regla, con cada campo bajo su cabecera. */
export default function EditorReglas({ reglas, onChange, cat, visibles, nueva, etiquetaNueva, fechasPlan }: Props) {
  const set = (i: number, c: Partial<Regla>) => onChange(reglas.map((r, j) => (j === i ? { ...r, ...c } : r)));
  const hay = reglas.some((r) => visibles(r));
  const esPenalizacion = nueva().esPenalizacion;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div className="table-container">
        <table className="table-premium table-compact">
          <thead>
            <tr>
              <th title="Nombre de la regla; sale así en el desglose de comisiones y en la lista de bonus manuales de los expedientes">Nombre</th>
              <th title="Cuándo se genera: en el mes de su evento (pedido, afectación, matriculación, cobro, crédito o Preference). «Manual»: solo en los expedientes en los que lo elijas a mano, en el mes en que cuenta el coche">Evento</th>
              <th title="A qué coches afecta: nuevos, usados o un subtipo de usado">Vehículo</th>
              <th title="Solo se aplica si la tasa de intervención financiera de la marca del coche está cumplida o no (indiferente = siempre)">Tasa intervención</th>
              <th title="La regla solo vale si la fecha de su evento es posterior a esta (vacío = sin límite)">Válida desde</th>
              <th title="La regla solo vale si la fecha de su evento es anterior a esta (vacío = sin límite)">Válida hasta</th>
              <th title="Solo para coches de esta marca (todas = sin filtro)">Marca</th>
              <th title="Solo para este modelo (todos = sin filtro)">Modelo</th>
              <th title={esPenalizacion ? "Importe que se resta de la comisión del mes por cada coche que cumpla la regla" : "Importe que se suma a la comisión del mes por cada coche que cumpla la regla"}>{esPenalizacion ? "Importe que resta (€)" : "Importe que suma (€)"}</th>
              <th title="Puntos que se suman al objetivo del mes por cada coche que cumpla la regla (pueden ser 0)">Puntos al objetivo</th>
              <th title="Solo para el evento «Preference»: la regla solo cuenta si el expediente tiene también financiación a crédito (con Preference sola no se cobra)">Ligar a crédito</th>
              <th title="Si la desmarcas, la regla se ignora al calcular comisiones">Activa</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reglas.map((r, i) =>
              !visibles(r) ? null : (
                <tr key={i} style={{ opacity: r.activa ? 1 : 0.6 }}>
                  <td>
                    <input className="form-input" style={{ minWidth: "150px" }} value={r.nombre} onChange={(e) => set(i, { nombre: e.target.value })} />
                  </td>
                  <td>
                    <select className="form-input" style={{ minWidth: "150px" }} value={r.evento} onChange={(e) => set(i, { evento: e.target.value as Regla["evento"], ligarACredito: e.target.value === "preference" ? r.ligarACredito : false })}>
                      {EVENTOS.map((ev) => (
                        <option key={ev.v} value={ev.v}>
                          {ev.t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <SelectorVehiculo estilo="regla" ancho="150px" valor={r.tipoVehiculo} alCambiar={(v) => set(i, { tipoVehiculo: v })} />
                  </td>
                  <td>
                    <select className="form-input" style={{ minWidth: "115px" }} value={r.tasaIntervencion} onChange={(e) => set(i, { tasaIntervencion: e.target.value as Regla["tasaIntervencion"] })}>
                      <option value="indiferente">Indiferente</option>
                      <option value="cumplida">Cumplida</option>
                      <option value="no_cumplida">No cumplida</option>
                    </select>
                  </td>
                  <td>
                    <FechaConAtajos valor={r.fechaInicio} alCambiar={(v) => set(i, { fechaInicio: v })} fechaPlan={fechasPlan.inicio} cualDelPlan="inicio" />
                  </td>
                  <td>
                    <FechaConAtajos valor={r.fechaFin} alCambiar={(v) => set(i, { fechaFin: v })} fechaPlan={fechasPlan.fin} cualDelPlan="fin" />
                  </td>
                  <td>
                    <select className="form-input" style={{ minWidth: "105px" }} value={r.idMarca ?? ""} onChange={(e) => set(i, { idMarca: e.target.value ? Number(e.target.value) : null, idModelo: null })}>
                      <option value="">Todas</option>
                      {cat.marcas.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select className="form-input" style={{ minWidth: "120px" }} value={r.idModelo ?? ""} onChange={(e) => set(i, { idModelo: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">Todos</option>
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
                    <InputCentesimas valor={r.importe} onChange={(v) => set(i, { importe: Math.abs(v ?? 0) })} />
                  </td>
                  <td>
                    <InputCentesimas valor={r.puntos} onChange={(v) => set(i, { puntos: v ?? 0 })} />
                  </td>
                  <td>
                    {r.evento === "preference" ? <input type="checkbox" checked={r.ligarACredito} onChange={(e) => set(i, { ligarACredito: e.target.checked })} title="Solo cuenta si el expediente tiene también financiación" style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} /> : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td>
                    <input type="checkbox" checked={r.activa} onChange={(e) => set(i, { activa: e.target.checked })} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <BotonMini titulo="Crea una copia de esta línea justo debajo, para cambiar solo lo que haga falta" onClick={() => onChange([...reglas.slice(0, i + 1), { ...r, clave: nuevaClave(), nombre: r.nombre ? `${r.nombre} (copia)` : r.nombre }, ...reglas.slice(i + 1)])}>
                        Duplicar
                      </BotonMini>
                      <BotonMini peligro onClick={() => onChange(reglas.filter((_, j) => j !== i))}>
                        Quitar
                      </BotonMini>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {!hay && (
              <tr>
                <td colSpan={13} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  Todavía no hay ninguna. Usa el botón de abajo para añadirla.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div>
        <BotonMini onClick={() => onChange([...reglas, nueva()])}>{etiquetaNueva}</BotonMini>
      </div>
    </div>
  );
}
