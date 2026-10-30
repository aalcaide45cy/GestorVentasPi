"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { useCarga } from "@/components/comisiones/useCarga";
import {
  RECORDATORIOS,
  REPETICIONES,
  sumarDias,
  type EntradaEvento,
  type FechaExpedienteDto,
  type OcurrenciaDto,
} from "@/lib/calendario";
import { usePreferencia } from "@/lib/preferencias";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const COLORES = [
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#a855f7",
  "#ec4899",
  "#6b7280",
];
const TIPO_FECHA: Record<FechaExpedienteDto["tipo"], string> = {
  entrega: "🚚 Entrega",
  matriculacion: "📋 Matriculación",
  rci: "💳 RCI",
  afectacion: "🔗 Afectación",
};

interface Datos {
  eventos: OcurrenciaDto[];
  fechasExpedientes: FechaExpedienteDto[];
}

const dos = (n: number) => String(n).padStart(2, "0");
const aIso = (d: Date) =>
  `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const diaMes = (iso: string) => Number(iso.slice(8, 10));
const fechaCorta = (iso: string) => iso.split("-").reverse().join("/");

interface Borrador {
  id: number | null;
  titulo: string;
  notas: string;
  fecha: string;
  todoElDia: boolean;
  hora: string;
  color: string;
  expediente: string;
  compartido: boolean;
  repeticion: EntradaEvento["repeticion"];
  repetirHasta: string;
  recordatorios: number[];
  hecho: boolean;
  /** Solo lectura (nota compartida de otra persona). */
  soloLectura: boolean;
  autor: string | null;
}

const nuevoBorrador = (fecha: string): Borrador => ({
  id: null,
  titulo: "",
  notas: "",
  fecha,
  todoElDia: true,
  hora: "09:00",
  color: COLORES[0],
  expediente: "",
  compartido: false,
  repeticion: "ninguna",
  repetirHasta: "",
  recordatorios: [],
  hecho: false,
  soloLectura: false,
  autor: null,
});
const deEvento = (e: OcurrenciaDto): Borrador => ({
  id: e.id,
  titulo: e.titulo,
  notas: e.notas,
  fecha: e.fecha,
  todoElDia: e.hora === null,
  hora: e.hora ?? "09:00",
  color: e.color,
  expediente: e.id_expediente ? String(e.id_expediente) : "",
  compartido: e.compartido,
  repeticion: e.repeticion,
  repetirHasta: e.repetir_hasta ?? "",
  recordatorios: e.recordatorios,
  hecho: e.hecho,
  soloLectura: !e.mio,
  autor: e.autor,
});

/** «Calendario»: mis notas y eventos (con repetición, recordatorios que salen como alertas y opción de compartir) y, si se quiere, las fechas de mis expedientes. */
export default function CalendarioClient() {
  const { mostrar, confirmar } = useToast();
  const hoy = aIso(new Date());
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [mes, setMes] = useState(() => new Date().getMonth());
  const [verExp, fijarVerExp] = usePreferencia("exp-calendario-expedientes");
  const conExpedientes = verExp === "true";
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // La cuadrícula: seis semanas que empiezan en lunes
  const inicio = useMemo(() => {
    const primero = new Date(anio, mes, 1);
    return aIso(new Date(anio, mes, 1 - ((primero.getDay() + 6) % 7)));
  }, [anio, mes]);
  const fin = sumarDias(inicio, 41);
  const { datos, recargar } = useCarga<Datos>(
    `/api/calendario?desde=${inicio}&hasta=${fin}${conExpedientes ? "&expedientes=1" : ""}`,
    { eventos: [], fechasExpedientes: [] },
  );
  const { datos: proximos } = useCarga<Datos>(
    `/api/calendario?desde=${hoy}&hasta=${sumarDias(hoy, 14)}${conExpedientes ? "&expedientes=1" : ""}`,
    { eventos: [], fechasExpedientes: [] },
  );

  const celdas = Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
  const porDia = (d: string) => datos.eventos.filter((e) => e.dia === d);
  const expPorDia = (d: string) =>
    datos.fechasExpedientes.filter((e) => e.dia === d);
  const moverMes = (n: number) => {
    const d = new Date(anio, mes + n, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
  };

  const guardar = async () => {
    if (!borrador) return;
    const b = borrador;
    const cuerpo: Partial<EntradaEvento> = {
      titulo: b.titulo,
      notas: b.notas,
      fecha: b.fecha,
      hora: b.todoElDia ? null : b.hora,
      color: b.color,
      id_expediente:
        b.expediente.trim() === ""
          ? null
          : Number(b.expediente.replace(/\D/g, "")) || null,
      compartido: b.compartido,
      repeticion: b.repeticion,
      repetir_hasta:
        b.repeticion === "ninguna" || b.repetirHasta === ""
          ? null
          : b.repetirHasta,
      recordatorios: b.recordatorios,
      hecho: b.hecho,
    };
    setOcupado(true);
    try {
      await llamar(
        b.id === null ? "/api/calendario" : `/api/calendario?id=${b.id}`,
        { method: b.id === null ? "POST" : "PUT", cuerpo },
      );
      mostrar(b.id === null ? "Nota añadida al calendario." : "Nota guardada.");
      setBorrador(null);
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };
  const eliminar = async () => {
    if (!borrador || borrador.id === null) return;
    if (
      !(await confirmar({
        titulo: "Quitar la nota",
        texto: `¿Quitar «${borrador.titulo}» del calendario?${borrador.repeticion !== "ninguna" ? " Se quitan todas sus repeticiones." : ""}`,
        aceptar: "Quitar",
        peligro: true,
      }))
    )
      return;
    setOcupado(true);
    try {
      await llamar(`/api/calendario?id=${borrador.id}`, { method: "DELETE" });
      mostrar("Nota quitada.");
      setBorrador(null);
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };
  const poner = (c: Partial<Borrador>) =>
    setBorrador((b) => (b ? { ...b, ...c } : b));

  const chip = (e: OcurrenciaDto, pequeno = true) => (
    <button
      key={`${e.id}-${e.dia}`}
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        setBorrador({ ...deEvento(e), fecha: e.fecha });
      }}
      title={`${e.titulo}${e.hora ? ` · ${e.hora}` : ""}${e.autor && !e.mio ? ` (compartida por ${e.autor})` : ""}${e.notas ? `\n${e.notas}` : ""}`}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: pequeno ? "1px 5px" : "4px 8px",
        fontSize: pequeno ? "0.7rem" : "0.82rem",
        border: "none",
        borderRadius: "4px",
        background: `${e.color}33`,
        borderLeft: `3px solid ${e.color}`,
        color: "var(--text-primary)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        textDecoration: e.hecho ? "line-through" : "none",
        opacity: e.hecho ? 0.6 : 1,
      }}
    >
      {e.hora ? `${e.hora} ` : ""}
      {e.compartido && !e.mio ? "👥 " : ""}
      {e.titulo}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <h2 style={{ margin: 0, fontSize: "1.5rem" }}>📅 Calendario</h2>
        <p
          style={{
            margin: "4px 0 0",
            color: "var(--text-secondary)",
            fontSize: "0.9rem",
          }}
        >
          Tus notas y eventos, con avisos que salen como alertas (el botón ❗ de
          arriba). Pulsa un día para añadir una nota.
        </p>
      </div>

      <div
        className="glass-panel"
        style={{
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => moverMes(-1)}
            aria-label="Mes anterior"
            style={{ padding: "4px 10px" }}
          >
            ◀
          </button>
          <strong
            style={{
              minWidth: "150px",
              textAlign: "center",
              fontSize: "1.1rem",
            }}
          >
            {MESES[mes]} {anio}
          </strong>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => moverMes(1)}
            aria-label="Mes siguiente"
            style={{ padding: "4px 10px" }}
          >
            ▶
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const d = new Date();
              setAnio(d.getFullYear());
              setMes(d.getMonth());
            }}
            style={{ padding: "4px 12px", fontSize: "0.85rem" }}
          >
            Hoy
          </button>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.85rem",
              marginLeft: "auto",
            }}
            title="Enseña en el calendario las fechas de entrega, matriculación, RCI y afectación de tus expedientes"
          >
            <input
              type="checkbox"
              checked={conExpedientes}
              onChange={(e) => fijarVerExp(e.target.checked ? "true" : "false")}
            />
            Fechas de mis expedientes
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setBorrador(nuevoBorrador(hoy))}
            style={{ padding: "5px 14px", fontSize: "0.85rem" }}
          >
            + Nueva nota
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(92px, 1fr))",
              gap: "1px",
              background: "var(--border-light)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
              minWidth: "660px",
            }}
          >
            {DIAS_SEMANA.map((d) => (
              <div
                key={d}
                style={{
                  background: "var(--bg-card)",
                  padding: "4px 6px",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  textAlign: "center",
                }}
              >
                {d}
              </div>
            ))}
            {celdas.map((d) => {
              const delMes = Number(d.slice(5, 7)) - 1 === mes;
              const evs = porDia(d);
              const exps = expPorDia(d);
              const todos = [
                ...evs.map((e) => ({ k: "e" as const, e })),
                ...exps.map((x) => ({ k: "x" as const, x })),
              ];
              return (
                <div
                  key={d}
                  onClick={() => setBorrador(nuevoBorrador(d))}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setBorrador(nuevoBorrador(d));
                  }}
                  title="Añadir una nota en este día"
                  style={{
                    background: "var(--bg-card)",
                    minHeight: "92px",
                    padding: "3px 4px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    cursor: "pointer",
                    opacity: delMes ? 1 : 0.5,
                    outline: d === hoy ? "2px solid var(--primary)" : "none",
                    outlineOffset: "-2px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: d === hoy ? 800 : 600,
                      color:
                        d === hoy ? "var(--primary)" : "var(--text-secondary)",
                    }}
                  >
                    {diaMes(d)}
                  </span>
                  {todos.slice(0, 4).map((t) =>
                    t.k === "e" ? (
                      chip(t.e)
                    ) : (
                      <Link
                        key={`${t.x.id_expediente}-${t.x.tipo}`}
                        href={`/dashboard/expedientes/editar/${t.x.id_expediente}`}
                        onClick={(ev) => ev.stopPropagation()}
                        title={`${TIPO_FECHA[t.x.tipo]}: ${t.x.cliente ?? "Sin cliente"}${t.x.matricula ? ` · ${t.x.matricula}` : ""}`}
                        style={{
                          display: "block",
                          padding: "1px 5px",
                          fontSize: "0.68rem",
                          borderRadius: "4px",
                          border: "1px dashed var(--border-light)",
                          color: "var(--text-secondary)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {TIPO_FECHA[t.x.tipo].split(" ")[0]}{" "}
                        {t.x.cliente ?? "Sin cliente"}
                      </Link>
                    ),
                  )}
                  {todos.length > 4 && (
                    <span
                      style={{
                        fontSize: "0.68rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      +{todos.length - 4} más
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className="glass-panel"
        style={{
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <h4 style={{ margin: 0, fontSize: "1rem" }}>🔜 Próximos 15 días</h4>
        {proximos.eventos.length === 0 &&
          proximos.fechasExpedientes.length === 0 && (
            <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              No hay nada apuntado en los próximos días.
            </span>
          )}
        {proximos.eventos.map((e) => (
          <div
            key={`${e.id}-${e.dia}`}
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              flexWrap: "wrap",
              fontSize: "0.88rem",
            }}
          >
            <span
              style={{
                minWidth: "92px",
                color:
                  e.dia === hoy ? "var(--primary)" : "var(--text-secondary)",
                fontWeight: e.dia === hoy ? 700 : 500,
              }}
            >
              {e.dia === hoy ? "Hoy" : fechaCorta(e.dia)}
              {e.hora ? ` · ${e.hora}` : ""}
            </span>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: e.color,
                flex: "0 0 auto",
              }}
            />
            <button
              type="button"
              onClick={() => setBorrador({ ...deEvento(e), fecha: e.fecha })}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--text-primary)",
                textAlign: "left",
                textDecoration: e.hecho ? "line-through" : "none",
              }}
            >
              {e.titulo}
            </button>
            {!e.mio && e.autor && (
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                👥 {e.autor}
              </span>
            )}
            {e.recordatorios.length > 0 && (
              <span title="Tiene recordatorios" style={{ fontSize: "0.75rem" }}>
                🔔
              </span>
            )}
          </div>
        ))}
        {proximos.fechasExpedientes.map((x) => (
          <div
            key={`${x.id_expediente}-${x.tipo}`}
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              flexWrap: "wrap",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
            }}
          >
            <span style={{ minWidth: "92px" }}>
              {x.dia === hoy ? "Hoy" : fechaCorta(x.dia)}
            </span>
            <span>{TIPO_FECHA[x.tipo]}</span>
            <Link href={`/dashboard/expedientes/editar/${x.id_expediente}`}>
              {x.cliente ?? "Sin cliente"}
              {x.matricula ? ` · ${x.matricula}` : ""}
            </Link>
          </div>
        ))}
      </div>

      {borrador && (
        <Modal
          titulo={
            borrador.id === null
              ? "Nueva nota"
              : borrador.soloLectura
                ? `Nota de ${borrador.autor ?? "otra persona"}`
                : "Editar nota"
          }
          ancho="560px"
          pie={
            <>
              {borrador.id !== null && !borrador.soloLectura && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={ocupado}
                  onClick={() => void eliminar()}
                  style={{ marginRight: "auto" }}
                >
                  🗑 Quitar
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={ocupado}
                onClick={() => setBorrador(null)}
              >
                {borrador.soloLectura ? "Cerrar" : "Cancelar"}
              </button>
              {!borrador.soloLectura && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={ocupado || borrador.titulo.trim() === ""}
                  onClick={() => void guardar()}
                >
                  Guardar
                </button>
              )}
            </>
          }
        >
          <fieldset
            disabled={borrador.soloLectura || ocupado}
            style={{
              border: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              minWidth: 0,
            }}
          >
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                fontSize: "0.85rem",
              }}
            >
              Título
              <input
                className="form-input"
                maxLength={120}
                value={borrador.titulo}
                onChange={(e) => poner({ titulo: e.target.value })}
                placeholder="Ej. Llamar al banco"
                autoFocus
              />
            </label>
            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                alignItems: "flex-end",
              }}
            >
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  fontSize: "0.85rem",
                }}
              >
                Día
                <input
                  type="date"
                  className="form-input"
                  value={borrador.fecha}
                  onChange={(e) => poner({ fecha: e.target.value })}
                  style={{ width: "auto" }}
                />
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  paddingBottom: "8px",
                }}
              >
                <input
                  type="checkbox"
                  checked={borrador.todoElDia}
                  onChange={(e) => poner({ todoElDia: e.target.checked })}
                />{" "}
                Todo el día
              </label>
              {!borrador.todoElDia && (
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    fontSize: "0.85rem",
                  }}
                >
                  Hora
                  <input
                    type="time"
                    className="form-input"
                    value={borrador.hora}
                    onChange={(e) => poner({ hora: e.target.value })}
                    style={{ width: "auto" }}
                  />
                </label>
              )}
            </div>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                fontSize: "0.85rem",
              }}
            >
              Notas
              <textarea
                className="form-input"
                rows={3}
                maxLength={4000}
                value={borrador.notas}
                onChange={(e) => poner({ notas: e.target.value })}
                style={{ resize: "vertical" }}
              />
            </label>
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                flexWrap: "wrap",
                fontSize: "0.85rem",
              }}
            >
              Color
              {COLORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={borrador.color === c}
                  onClick={() => poner({ color: c })}
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    cursor: "pointer",
                    background: c,
                    border: `3px solid ${borrador.color === c ? "var(--text-primary)" : "var(--border-light)"}`,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                alignItems: "flex-end",
              }}
            >
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  fontSize: "0.85rem",
                }}
              >
                Repetir
                <select
                  className="form-input"
                  value={borrador.repeticion}
                  onChange={(e) =>
                    poner({
                      repeticion: e.target.value as Borrador["repeticion"],
                    })
                  }
                  style={{ width: "auto" }}
                >
                  {REPETICIONES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              {borrador.repeticion !== "ninguna" && (
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    fontSize: "0.85rem",
                  }}
                >
                  Hasta (opcional)
                  <input
                    type="date"
                    className="form-input"
                    value={borrador.repetirHasta}
                    onChange={(e) => poner({ repetirHasta: e.target.value })}
                    style={{ width: "auto" }}
                  />
                </label>
              )}
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  fontSize: "0.85rem",
                }}
              >
                Expediente (opcional)
                <input
                  className="form-input"
                  inputMode="numeric"
                  value={borrador.expediente}
                  onChange={(e) => poner({ expediente: e.target.value })}
                  placeholder="Nº, por ejemplo 12"
                  style={{ width: "150px" }}
                />
              </label>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                fontSize: "0.85rem",
              }}
            >
              <span>
                Avisarme (sale en el botón ❗ de las alertas)
                {borrador.todoElDia
                  ? " · las de todo el día cuentan a las 9:00"
                  : ""}
              </span>
              <div
                style={{ display: "flex", gap: "6px 14px", flexWrap: "wrap" }}
              >
                {RECORDATORIOS.map((r) => (
                  <label
                    key={r.min}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={borrador.recordatorios.includes(r.min)}
                      onChange={(e) =>
                        poner({
                          recordatorios: e.target.checked
                            ? [...borrador.recordatorios, r.min].sort(
                                (a, b) => a - b,
                              )
                            : borrador.recordatorios.filter((m) => m !== r.min),
                        })
                      }
                    />
                    {r.etiqueta}
                  </label>
                ))}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: "20px",
                flexWrap: "wrap",
                fontSize: "0.85rem",
              }}
            >
              <label
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
                title="El resto del equipo la ve en su calendario (solo para leerla). Los avisos te salen solo a ti."
              >
                <input
                  type="checkbox"
                  checked={borrador.compartido}
                  onChange={(e) => poner({ compartido: e.target.checked })}
                />{" "}
                👥 Compartir con el equipo
              </label>
              <label
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
                title="Una nota hecha deja de avisar"
              >
                <input
                  type="checkbox"
                  checked={borrador.hecho}
                  onChange={(e) => poner({ hecho: e.target.checked })}
                />{" "}
                ✔ Hecha
              </label>
            </div>
          </fieldset>
        </Modal>
      )}
    </div>
  );
}
