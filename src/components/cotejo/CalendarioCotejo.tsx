"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { filasPorDia, type EstadoCotejo, type FilaCotejo, type ResumenMes } from "@/lib/cotejo-pagos";
import { formatDate } from "@/lib/date-utils";
import { hoyIsoCliente } from "@/lib/date-utils";
import { mesActual, nombreMes, sumarMeses } from "@/lib/formato";

const COLOR: Record<EstadoCotejo, { punto: string; texto: string }> = {
  no_pagado: { punto: "#ef4444", texto: "Sin pagar" },
  dudoso: { punto: "#eab308", texto: "Dudoso" },
  sin_rejilla: { punto: "#9ca3af", texto: "Sin rejilla" },
  pagado: { punto: "#22c55e", texto: "Pagado" },
};
const ORDEN: EstadoCotejo[] = ["no_pagado", "dudoso", "sin_rejilla", "pagado"];
const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

interface Props {
  filas: FilaCotejo[];
  /** Mes que se está cotejando. */
  mes: string;
  /** Día que se está filtrando (si hay). */
  dia: string | null;
  resumenes: Map<string, ResumenMes>;
  mesesGuardados: Set<string>;
  mesesEnBorrador: Set<string>;
  /** Elige un mes (y un día, o todo el mes) para verlo en el cotejo. */
  alAplicar: (mes: string, dia: string | null) => void;
  alCerrar: () => void;
}

const Punto = ({ estado, tamano = 10 }: { estado: EstadoCotejo; tamano?: number }) => <span title={COLOR[estado].texto} style={{ width: tamano, height: tamano, borderRadius: "50%", background: COLOR[estado].punto, display: "inline-block", flexShrink: 0 }} />;

/** Calendario amplio del cotejo: un botón por día con una bolita de color por coche, con filtros por resultado, tipo y texto. */
export default function CalendarioCotejo({ filas, mes, dia, resumenes, mesesGuardados, mesesEnBorrador, alAplicar, alCerrar }: Props) {
  const [mesCal, setMesCal] = useState(mes);
  const [elegido, setElegido] = useState<string | null>(dia);
  const [estados, setEstados] = useState<Set<EstadoCotejo>>(new Set(ORDEN));
  const [tipo, setTipo] = useState<"todos" | "VN" | "VO">("todos");
  const [texto, setTexto] = useState("");
  const hoy = hoyIsoCliente();

  const pasa = (f: FilaCotejo): boolean => {
    if (!estados.has(f.estado)) return false;
    if (tipo !== "todos" && f.coche && (f.coche.usado ? "VO" : "VN") !== tipo) return false;
    const t = texto.trim().toLowerCase();
    if (!t) return true;
    return [f.matricula, f.coche?.cliente, f.coche?.marca, f.coche?.modelo].some((x) => (x ?? "").toLowerCase().includes(t));
  };
  const { dias, sinDia } = useMemo(() => filasPorDia(filas, mesCal), [filas, mesCal]);
  const delMes = useMemo(() => [...dias.values()].flat().concat(sinDia), [dias, sinDia]);
  const cuenta = (e: EstadoCotejo) => delMes.filter((f) => f.estado === e).length;

  const [anio, m] = mesCal.split("-").map(Number);
  const primero = (new Date(Date.UTC(anio, m - 1, 1)).getUTCDay() + 6) % 7;
  const numDias = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  const celdas: (string | null)[] = [...Array<null>(primero).fill(null), ...Array.from({ length: numDias }, (_, i) => `${mesCal}-${String(i + 1).padStart(2, "0")}`)];

  const listado = (elegido ? (dias.get(elegido) ?? []) : delMes).filter(pasa);
  const alternar = (e: EstadoCotejo) =>
    setEstados((prev) => {
      const n = new Set(prev);
      if (n.has(e)) n.delete(e);
      else n.add(e);
      return n;
    });

  const botonNav = { padding: "6px 12px" } as const;

  return (
    <Modal
      titulo="📆 Calendario del cotejo"
      ancho="1180px"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCerrar}>
            Cerrar
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => alAplicar(mesCal, null)} title={`Ver en el cotejo todos los coches de ${nombreMes(mesCal)}`}>
            Ver todo {nombreMes(mesCal)}
          </button>
          <button type="button" className="btn btn-primary" disabled={!elegido} onClick={() => elegido && alAplicar(mesCal, elegido)} title="Ver en el cotejo solo los coches de este día">
            {elegido ? `Ver el ${formatDate(elegido)} en el cotejo` : "Elige un día"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.9rem" }}>
        {/* Los doce meses del año: cada uno con lo más urgente que tiene */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: "6px" }}>
          {Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`).map((mm) => {
            const r = resumenes.get(mm);
            const actual = mm === mesCal;
            const urgente: EstadoCotejo | null = !r ? null : r.noPagados ? "no_pagado" : r.dudosos ? "dudoso" : r.sinRejilla ? "sin_rejilla" : r.total > 0 ? "pagado" : null;
            return (
              <button
                key={mm}
                type="button"
                className={actual ? "btn btn-primary" : "btn btn-secondary"}
                onClick={() => { setMesCal(mm); setElegido(null); }}
                title={`${nombreMes(mm)}: ${r ? `${r.total} coche(s)` : "sin coches"} · ${mesesEnBorrador.has(mm) ? "rejilla leída sin guardar" : mesesGuardados.has(mm) ? "con rejilla guardada" : "sin rejilla"}`}
                style={{ padding: "6px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", fontSize: "0.8rem" }}
              >
                <b>{MESES_CORTOS[Number(mm.slice(5, 7)) - 1]}</b>
                <span style={{ display: "flex", gap: "4px", alignItems: "center", fontSize: "0.7rem" }}>
                  {mesesEnBorrador.has(mm) ? "📝" : mesesGuardados.has(mm) ? "📄" : "▫️"}
                  {urgente && <Punto estado={urgente} tamano={9} />}
                  {r ? r.total : ""}
                </span>
              </button>
            );
          })}
        </div>

        {/* Navegación y filtros */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-secondary" style={botonNav} onClick={() => { setMesCal(sumarMeses(mesCal, -12)); setElegido(null); }} title="Año anterior">
            «
          </button>
          <button type="button" className="btn btn-secondary" style={botonNav} onClick={() => { setMesCal(sumarMeses(mesCal, -1)); setElegido(null); }} title="Mes anterior">
            ◀
          </button>
          <h3 style={{ margin: 0, minWidth: "150px", textAlign: "center", fontSize: "1.1rem" }}>{nombreMes(mesCal)}</h3>
          <button type="button" className="btn btn-secondary" style={botonNav} onClick={() => { setMesCal(sumarMeses(mesCal, 1)); setElegido(null); }} title="Mes siguiente">
            ▶
          </button>
          <button type="button" className="btn btn-secondary" style={botonNav} onClick={() => { setMesCal(sumarMeses(mesCal, 12)); setElegido(null); }} title="Año siguiente">
            »
          </button>
          <button type="button" className="btn btn-secondary" style={botonNav} onClick={() => { setMesCal(mesActual()); setElegido(null); }} disabled={mesCal === mesActual()}>
            Mes actual
          </button>
          <span style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <select className="form-input" value={tipo} onChange={(e) => setTipo(e.target.value as "todos" | "VN" | "VO")} style={{ width: "auto", padding: "6px 10px" }} aria-label="Tipo de coche">
              <option value="todos">Nuevos y usados</option>
              <option value="VN">Solo nuevos (VN)</option>
              <option value="VO">Solo usados (VO)</option>
            </select>
            <input className="form-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="🔎 Matrícula, cliente, modelo…" style={{ width: "230px", padding: "6px 10px" }} />
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {ORDEN.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => alternar(e)}
              aria-pressed={estados.has(e)}
              title={estados.has(e) ? `Ocultar «${COLOR[e].texto}»` : `Mostrar «${COLOR[e].texto}»`}
              className="btn btn-secondary"
              style={{ padding: "4px 12px", display: "inline-flex", gap: "6px", alignItems: "center", opacity: estados.has(e) ? 1 : 0.45, borderColor: estados.has(e) ? COLOR[e].punto : undefined }}
            >
              <Punto estado={e} /> {COLOR[e].texto} <b>{cuenta(e)}</b>
            </button>
          ))}
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Cada bolita es un coche; el día es su matriculación (nuevos) o su afectación (usados).</span>
        </div>

        {/* Calendario */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px" }}>
          {DIAS_SEMANA.map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              {d}
            </div>
          ))}
          {celdas.map((d, i) => {
            if (!d) return <div key={`v${i}`} />;
            const delDia = (dias.get(d) ?? []).filter(pasa);
            const total = (dias.get(d) ?? []).length;
            const activo = elegido === d;
            const finde = [5, 6].includes((primero + Number(d.slice(8, 10)) - 1) % 7);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setElegido(activo ? null : d)}
                onDoubleClick={() => total > 0 && alAplicar(mesCal, d)}
                title={total > 0 ? `${formatDate(d)}: ${total} coche(s). Doble clic para verlos en el cotejo` : `${formatDate(d)}: sin coches`}
                aria-pressed={activo}
                style={{
                  minHeight: "74px",
                  padding: "6px",
                  borderRadius: "var(--radius-sm)",
                  border: `1px solid ${activo ? "var(--primary)" : d === hoy ? "var(--primary)" : "var(--border-light)"}`,
                  boxShadow: activo ? "0 0 0 2px rgba(var(--primary-rgb), 0.35)" : undefined,
                  background: activo ? "rgba(var(--primary-rgb), 0.14)" : finde ? "rgba(255, 255, 255, 0.015)" : "rgba(255, 255, 255, 0.04)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "4px",
                  textAlign: "left",
                  fontFamily: "inherit",
                  opacity: total === 0 ? 0.55 : 1,
                }}
              >
                <span style={{ fontWeight: d === hoy ? 800 : 600, fontSize: "0.85rem", color: d === hoy ? "var(--primary)" : undefined }}>{Number(d.slice(8, 10))}</span>
                <span style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                  {delDia.slice(0, 10).map((f, k) => (
                    <Punto key={k} estado={f.estado} />
                  ))}
                  {delDia.length > 10 && <span style={{ fontSize: "0.7rem" }}>+{delDia.length - 10}</span>}
                </span>
              </button>
            );
          })}
        </div>
        {sinDia.length > 0 && <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Además hay {sinDia.length} matrícula(s) de la rejilla de este mes sin coche, que no tienen día.</div>}

        {/* Lo que hay en el día elegido (o en todo el mes) */}
        <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <b>{elegido ? `Coches del ${formatDate(elegido)}` : `Todos los coches de ${nombreMes(mesCal)}`} ({listado.length})</b>
          {listado.length === 0 ? (
            <span style={{ color: "var(--text-muted)" }}>No hay coches con estos filtros.</span>
          ) : (
            <div style={{ maxHeight: "220px", overflow: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
              {listado.slice(0, 200).map((f, k) => (
                <div key={`${f.matricula}-${k}`} style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "0.85rem" }}>
                  <Punto estado={f.estado} />
                  <b style={{ minWidth: "82px" }}>{f.matricula}</b>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.coche?.cliente ?? "(sin coche)"}</span>
                  <span style={{ color: "var(--text-secondary)" }}>{[f.coche?.marca, f.coche?.modelo].filter(Boolean).join(" ")}</span>
                  <span style={{ color: "var(--text-muted)", minWidth: "78px", textAlign: "right" }}>{COLOR[f.estado].texto}</span>
                </div>
              ))}
              {listado.length > 200 && <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Se enseñan 200 de {listado.length}.</span>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
