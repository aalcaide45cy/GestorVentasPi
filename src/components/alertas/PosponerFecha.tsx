"use client";

import { useState } from "react";

const dosDigitos = (n: number) => String(n).padStart(2, "0");
/** `datetime-local` en hora de este equipo: «2026-10-30T14:30». */
const aLocal = (d: Date) =>
  `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}T${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;

/** «📅 Día y hora…»: posponer una alerta hasta el día y la hora que se elijan. */
export default function PosponerFecha({
  ocupado,
  alElegir,
  pequeno,
}: {
  ocupado: boolean;
  alElegir: (fechaIso: string) => void;
  pequeno?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState(() => {
    const d = new Date(Date.now() + 24 * 3_600_000);
    d.setHours(9, 0, 0, 0);
    return aLocal(d);
  });
  const fecha = new Date(valor);
  const valida =
    !Number.isNaN(fecha.getTime()) && fecha.getTime() > Date.now() + 60_000;
  const estilo = pequeno
    ? { padding: "3px 10px", fontSize: "0.78rem" }
    : { padding: "6px 12px" };
  if (!abierto)
    return (
      <button
        type="button"
        className="btn btn-secondary"
        disabled={ocupado}
        onClick={() => setAbierto(true)}
        style={estilo}
        title="Elige el día y la hora a la que quieres que vuelva a saltar"
      >
        📅 Día y hora…
      </button>
    );
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        flexWrap: "wrap",
      }}
    >
      <input
        type="datetime-local"
        className="form-input"
        aria-label="Día y hora a la que vuelve a saltar"
        value={valor}
        min={minimo}
        onChange={(e) => setValor(e.target.value)}
        style={{
          width: "auto",
          padding: pequeno ? "3px 8px" : "5px 8px",
          fontSize: pequeno ? "0.78rem" : "0.85rem",
        }}
      />
      <button
        type="button"
        className="btn btn-primary"
        disabled={ocupado || !valida}
        onClick={() => alElegir(fecha.toISOString())}
        style={estilo}
        title={
          valida
            ? "Pospone la alerta hasta ese día y hora"
            : "Elige un momento futuro"
        }
      >
        Posponer
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={ocupado}
        onClick={() => setAbierto(false)}
        style={estilo}
        aria-label="Cancelar"
        title="Cancelar"
      >
        ✖
      </button>
    </span>
  );
}
