"use client";

interface Props {
  /** Hora en formato HH:MM, o vacío si no hay. */
  valor: string;
  alCambiar: (valor: string) => void;
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");
/** Las horas habituales de entrega, a un solo clic. */
const HORAS_RAPIDAS = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "16:00",
  "17:00",
  "18:00",
];

function partes(valor: string): { h: number; m: number } | null {
  const x = /^(\d{2}):(\d{2})$/.exec(valor);
  return x ? { h: Number(x[1]), m: Number(x[2]) } : null;
}

/** Mueve la hora `delta` horas (de 1 en 1) o minutos (de 15 en 15), dando la vuelta a las 24 h; sin hora, parte de las 09:00. */
export function moverHora(
  valor: string,
  parte: "hora" | "min",
  delta: -1 | 1,
): string {
  const p = partes(valor) ?? { h: 9, m: 0 };
  if (parte === "hora")
    return `${dosDigitos((p.h + delta + 24) % 24)}:${dosDigitos(p.m)}`;
  const total = Math.floor(p.m / 15) * 15 + delta * 15;
  const m = ((total % 60) + 60) % 60;
  return `${dosDigitos(p.h)}:${dosDigitos(m)}`;
}

const estiloBoton = {
  padding: "0 6px",
  minHeight: "34px",
  fontSize: "0.82rem",
  lineHeight: 1.2,
  justifyContent: "center",
  whiteSpace: "nowrap",
} as const;

/** Hora con botones rápidos de las horas habituales, flechas para subir o bajar la hora y los minutos, y «Sin hora». También se puede escribir. */
export default function SelectorHora({ valor, alCambiar }: Props) {
  const p = partes(valor);
  const grupo = (etiqueta: string, parte: "hora" | "min", texto: string) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          textAlign: "center",
        }}
      >
        {etiqueta}
      </span>
      <div style={{ display: "flex", gap: "4px" }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ ...estiloBoton, flex: "0 0 32px" }}
          onClick={() => alCambiar(moverHora(valor, parte, -1))}
          title={parte === "hora" ? "Una hora menos" : "15 minutos menos"}
          aria-label={`${etiqueta} anterior`}
        >
          ←
        </button>
        <span
          className="form-input"
          style={{
            ...estiloBoton,
            flex: "1 1 auto",
            display: "flex",
            alignItems: "center",
            fontWeight: 700,
            color: p ? "var(--text-primary)" : "var(--text-muted)",
          }}
          aria-live="polite"
        >
          {texto}
        </span>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ ...estiloBoton, flex: "0 0 32px" }}
          onClick={() => alCambiar(moverHora(valor, parte, 1))}
          title={parte === "hora" ? "Una hora más" : "15 minutos más"}
          aria-label={`${etiqueta} siguiente`}
        >
          →
        </button>
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {HORAS_RAPIDAS.map((h) => (
          <button
            key={h}
            type="button"
            className={valor === h ? "btn btn-primary" : "btn btn-secondary"}
            style={{ ...estiloBoton, padding: "0 12px" }}
            onClick={() => alCambiar(h)}
          >
            {h}
          </button>
        ))}
        <button
          type="button"
          className={!valor ? "btn btn-primary" : "btn btn-secondary"}
          style={{ ...estiloBoton, padding: "0 12px" }}
          onClick={() => alCambiar("")}
          title="Quitar la hora: la entrega queda solo con fecha"
        >
          Sin hora
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr)) auto",
          gap: "8px",
          alignItems: "end",
        }}
      >
        {grupo("Hora", "hora", p ? dosDigitos(p.h) : "--")}
        {grupo("Minutos", "min", p ? dosDigitos(p.m) : "--")}
        <input
          type="time"
          className="form-input"
          value={valor}
          onChange={(e) => alCambiar(e.target.value)}
          aria-label="Escribir la hora"
          title="Escribir la hora"
          style={{ width: "130px" }}
        />
      </div>
    </div>
  );
}
