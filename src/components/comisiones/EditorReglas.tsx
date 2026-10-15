"use client";

import { BotonMini, InputCentesimas } from "./campos";
import type { CatalogosComisiones, Regla } from "./tipos";

const EVENTOS: { v: Regla["evento"]; t: string }[] = [
  { v: "pedido", t: "Pedido" },
  { v: "afectacion", t: "Afectación" },
  { v: "matriculacion", t: "Matriculación (VO: cobro)" },
  { v: "cobro", t: "Cobro" },
  { v: "credito", t: "Crédito / financiación" },
  { v: "preference", t: "Preference" },
];

interface Props {
  reglas: Regla[];
  onChange: (r: Regla[]) => void;
  cat: CatalogosComisiones;
  /** Reglas visibles (índices en `reglas`); permite mostrar solo bonus o solo penalizaciones. */
  visibles: (r: Regla) => boolean;
  nueva: () => Regla;
  etiquetaNueva: string;
}

/** Lista editable de reglas / bonus / penalizaciones con evento, filtros y efecto (1.7). */
export default function EditorReglas({ reglas, onChange, cat, visibles, nueva, etiquetaNueva }: Props) {
  const set = (i: number, c: Partial<Regla>) => onChange(reglas.map((r, j) => (j === i ? { ...r, ...c } : r)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {reglas.map((r, i) =>
        !visibles(r) ? null : (
          <div key={i} className="glass-panel" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px", opacity: r.activa ? 1 : 0.6 }}>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "end" }}>
              <div style={{ flex: "1 1 220px" }}>
                <label className="form-label">Nombre</label>
                <input className="form-input" value={r.nombre} onChange={(e) => set(i, { nombre: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Evento</label>
                <select className="form-input" value={r.evento} onChange={(e) => set(i, { evento: e.target.value as Regla["evento"], ligarACredito: e.target.value === "preference" ? r.ligarACredito : false })}>
                  {EVENTOS.map((ev) => (
                    <option key={ev.v} value={ev.v}>
                      {ev.t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Vehículo</label>
                <select className="form-input" value={r.tipoVehiculo} onChange={(e) => set(i, { tipoVehiculo: e.target.value as Regla["tipoVehiculo"] })}>
                  <option value="cualquiera">Cualquiera</option>
                  <option value="nuevo">Nuevo (VN)</option>
                  <option value="usado">Usado (VO)</option>
                </select>
              </div>
              <div>
                <label className="form-label">Tasa de intervención</label>
                <select className="form-input" value={r.tasaIntervencion} onChange={(e) => set(i, { tasaIntervencion: e.target.value as Regla["tasaIntervencion"] })}>
                  <option value="indiferente">Indiferente</option>
                  <option value="cumplida">Cumplida</option>
                  <option value="no_cumplida">No cumplida</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "end" }}>
              <div>
                <label className="form-label">Válida desde</label>
                <input className="form-input" type="date" value={r.fechaInicio ?? ""} onChange={(e) => set(i, { fechaInicio: e.target.value || null })} />
              </div>
              <div>
                <label className="form-label">Válida hasta</label>
                <input className="form-input" type="date" value={r.fechaFin ?? ""} onChange={(e) => set(i, { fechaFin: e.target.value || null })} />
              </div>
              <div>
                <label className="form-label">Marca</label>
                <select className="form-input" value={r.idMarca ?? ""} onChange={(e) => set(i, { idMarca: e.target.value ? Number(e.target.value) : null, idModelo: null })}>
                  <option value="">Todas</option>
                  {cat.marcas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Modelo</label>
                <select className="form-input" value={r.idModelo ?? ""} onChange={(e) => set(i, { idModelo: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Todos</option>
                  {cat.modelos
                    .filter((m) => r.idMarca === null || m.marcaId === r.idMarca)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="form-label">{r.esPenalizacion ? "Importe que resta" : "Importe que suma"}</label>
                <InputCentesimas valor={r.importe} onChange={(v) => set(i, { importe: Math.abs(v ?? 0) })} sufijo="€" />
              </div>
              <div>
                <label className="form-label">Puntos al objetivo</label>
                <InputCentesimas valor={r.puntos} onChange={(v) => set(i, { puntos: v ?? 0 })} />
              </div>
              {r.evento === "preference" && (
                <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input type="checkbox" checked={r.ligarACredito} onChange={(e) => set(i, { ligarACredito: e.target.checked })} /> Ligar a crédito
                </label>
              )}
              <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input type="checkbox" checked={r.activa} onChange={(e) => set(i, { activa: e.target.checked })} /> Activa
              </label>
              <BotonMini peligro onClick={() => onChange(reglas.filter((_, j) => j !== i))}>
                Quitar
              </BotonMini>
            </div>
          </div>
        ),
      )}
      <div>
        <BotonMini onClick={() => onChange([...reglas, nueva()])}>{etiquetaNueva}</BotonMini>
      </div>
    </div>
  );
}
