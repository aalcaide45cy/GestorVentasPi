"use client";

import Link from "next/link";
import type {
  AlertaCalendarioDto,
  FechaExpedienteDto,
  OcurrenciaDto,
} from "@/lib/calendario";

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const TIPO_FECHA: Record<FechaExpedienteDto["tipo"], string> = {
  entrega: "🚚 Entrega",
  matriculacion: "📋 Matriculación",
  rci: "💳 RCI",
  afectacion: "🔗 Afectación",
};
const ALTO_HORA = 46;

const nombreDia = (iso: string): string => {
  const [a, m, d] = iso.split("-").map(Number);
  return DIAS_SEMANA[(new Date(a, m - 1, d).getDay() + 6) % 7];
};

export interface DatosHoras {
  eventos: OcurrenciaDto[];
  fechasExpedientes: FechaExpedienteDto[];
  alertas: AlertaCalendarioDto[];
}

/**
 * Las vistas de Semana y de Día: una columna por día, con una fila «Todo el día» arriba y una fila por cada hora. Pulsar una hora vacía añade una nota a esa hora;
 * pulsar la cabecera de un día lo abre en la vista de Día.
 */
export default function VistaHoras({
  dias,
  hoy,
  datos,
  alAnadir,
  alEditar,
  alAbrirAlertas,
  alIrDia,
}: {
  dias: string[];
  hoy: string;
  datos: DatosHoras;
  alAnadir: (dia: string, hora: string | null) => void;
  alEditar: (e: OcurrenciaDto) => void;
  alAbrirAlertas: () => void;
  alIrDia: (dia: string) => void;
}) {
  const horaDe = (h: string | null): number | null =>
    h === null ? null : Number(h.slice(0, 2));
  const usadas = [
    ...datos.eventos.map((e) => horaDe(e.hora)),
    ...datos.alertas.map((a) => horaDe(a.hora)),
  ].filter((h): h is number => h !== null);
  const desde = Math.min(7, ...usadas);
  const hasta = Math.max(21, ...usadas);
  const horas = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  const columnas = `54px repeat(${dias.length}, minmax(${dias.length === 1 ? 260 : 110}px, 1fr))`;

  const chipEvento = (e: OcurrenciaDto) => (
    <button
      key={`e${e.id}-${e.dia}`}
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        alEditar(e);
      }}
      title={`${e.titulo}${e.hora ? ` · ${e.hora}` : ""}${e.autor && !e.mio ? ` (compartida por ${e.autor})` : ""}${e.notas ? `\n${e.notas}` : ""}`}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "2px 6px",
        fontSize: "0.76rem",
        border: "none",
        borderRadius: "4px",
        background: `${e.color}33`,
        borderLeft: `3px solid ${e.color}`,
        color: "var(--text-primary)",
        cursor: "pointer",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textDecoration: e.hecho ? "line-through" : "none",
        opacity: e.hecho ? 0.6 : 1,
      }}
    >
      {e.hora ? `${e.hora} ` : ""}
      {e.compartido && !e.mio ? "👥 " : ""}
      {e.titulo}
    </button>
  );
  const chipAlerta = (a: AlertaCalendarioDto) => (
    <button
      key={`a${a.id}`}
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        alAbrirAlertas();
      }}
      title={`${a.estado === "pospuesta" ? "Alerta pospuesta" : "Alerta pendiente"}${a.hora ? ` · vuelve a las ${a.hora}` : ""}\n${a.mensaje}`}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "2px 6px",
        fontSize: "0.76rem",
        border: "1px solid var(--danger)",
        borderRadius: "4px",
        background: "rgba(239, 68, 68, 0.12)",
        color: "var(--text-primary)",
        cursor: "pointer",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {a.estado === "pospuesta" ? "⏰" : "❗"} {a.hora ? `${a.hora} ` : ""}
      {a.mensaje}
    </button>
  );
  const chipExpediente = (x: FechaExpedienteDto) => (
    <Link
      key={`x${x.id_expediente}-${x.tipo}`}
      href={`/dashboard/expedientes/editar/${x.id_expediente}`}
      onClick={(ev) => ev.stopPropagation()}
      title={`${TIPO_FECHA[x.tipo]}: ${x.cliente ?? "Sin cliente"}${x.matricula ? ` · ${x.matricula}` : ""}`}
      style={{
        display: "block",
        padding: "2px 6px",
        fontSize: "0.74rem",
        borderRadius: "4px",
        border: "1px dashed var(--border-light)",
        color: "var(--text-secondary)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {TIPO_FECHA[x.tipo].split(" ")[0]} {x.cliente ?? "Sin cliente"}
    </Link>
  );

  const celda = {
    background: "var(--bg-card)",
    padding: "2px 3px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  } as const;
  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: columnas,
          gap: "1px",
          background: "var(--border-light)",
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
          minWidth: dias.length === 1 ? undefined : "820px",
        }}
      >
        <div style={{ background: "var(--bg-card)" }} />
        {dias.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => alIrDia(d)}
            title="Abrir este día"
            style={{
              background: "var(--bg-card)",
              border: "none",
              cursor: "pointer",
              padding: "6px 4px",
              fontSize: "0.8rem",
              fontWeight: d === hoy ? 800 : 600,
              color: d === hoy ? "var(--primary)" : "var(--text-secondary)",
              textAlign: "center",
            }}
          >
            {nombreDia(d)} {Number(d.slice(8, 10))}
          </button>
        ))}

        <div
          style={{
            ...celda,
            fontSize: "0.68rem",
            color: "var(--text-muted)",
            justifyContent: "center",
            textAlign: "right",
            padding: "2px 6px",
          }}
        >
          Todo el día
        </div>
        {dias.map((d) => (
          <div
            key={d}
            onClick={() => alAnadir(d, null)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") alAnadir(d, null);
            }}
            title="Añadir una nota de todo el día"
            style={{
              ...celda,
              minHeight: "34px",
              cursor: "pointer",
              outline: d === hoy ? "2px solid var(--primary)" : "none",
              outlineOffset: "-2px",
            }}
          >
            {datos.alertas
              .filter((a) => a.dia === d && a.hora === null)
              .map(chipAlerta)}
            {datos.eventos
              .filter((e) => e.dia === d && e.hora === null)
              .map(chipEvento)}
            {datos.fechasExpedientes
              .filter((x) => x.dia === d)
              .map(chipExpediente)}
          </div>
        ))}

        {horas.map((h) => {
          const etiqueta = `${String(h).padStart(2, "0")}:00`;
          return [
            <div
              key={`h${h}`}
              style={{
                ...celda,
                height: `${ALTO_HORA}px`,
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                textAlign: "right",
                padding: "2px 6px",
              }}
            >
              {etiqueta}
            </div>,
            ...dias.map((d) => (
              <div
                key={`${d}-${h}`}
                onClick={() => alAnadir(d, etiqueta)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") alAnadir(d, etiqueta);
                }}
                title={`Añadir una nota a las ${etiqueta}`}
                style={{
                  ...celda,
                  minHeight: `${ALTO_HORA}px`,
                  cursor: "pointer",
                }}
              >
                {datos.alertas
                  .filter((a) => a.dia === d && horaDe(a.hora) === h)
                  .map(chipAlerta)}
                {datos.eventos
                  .filter((e) => e.dia === d && horaDe(e.hora) === h)
                  .map(chipEvento)}
              </div>
            )),
          ];
        })}
      </div>
    </div>
  );
}
