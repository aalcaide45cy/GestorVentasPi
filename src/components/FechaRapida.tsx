"use client";

import { hoyIsoCliente } from "@/lib/date-utils";

interface Props {
  valor: string;
  alCambiar: (valor: string) => void;
  /** Para pruebas y accesibilidad. */
  nombre?: string;
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");
const diasDelMes = (anio: number, mes: number) => new Date(anio, mes, 0).getDate();

/** Parte una fecha ISO (AAAA-MM-DD); si está vacía o es inválida, parte de hoy. */
function partes(valor: string): { a: number; m: number; d: number } {
  const x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(hoyIsoCliente());
  return { a: Number(x?.[1]), m: Number(x?.[2]), d: Number(x?.[3]) };
}

/** Suma `delta` días, meses o años a la fecha respetando la longitud de cada mes y los cambios de año. */
export function moverFecha(valor: string, parte: "dia" | "mes" | "anio", delta: -1 | 1): string {
  const { a, m, d } = partes(valor);
  if (parte === "dia") {
    const f = new Date(a, m - 1, d + delta);
    return `${f.getFullYear()}-${dosDigitos(f.getMonth() + 1)}-${dosDigitos(f.getDate())}`;
  }
  const total = parte === "mes" ? a * 12 + (m - 1) + delta : (a + delta) * 12 + (m - 1);
  const na = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(d, diasDelMes(na, nm));
  return `${na}-${dosDigitos(nm)}-${dosDigitos(nd)}`;
}

/** Pone solo una parte (día, mes o año) al valor de hoy, sin tocar las otras y ajustando el día si el mes no llega. */
export function ponerParteActual(valor: string, parte: "dia" | "mes" | "anio", hoy: string = hoyIsoCliente()): string {
  const f = partes(valor);
  const h = partes(hoy);
  const a = parte === "anio" ? h.a : f.a;
  const m = parte === "mes" ? h.m : f.m;
  const d = Math.min(parte === "dia" ? h.d : f.d, diasDelMes(a, m));
  return `${a}-${dosDigitos(m)}-${dosDigitos(d)}`;
}

const estiloBoton = { padding: "0 6px", minHeight: "34px", fontSize: "0.82rem", lineHeight: 1.2, justifyContent: "center", whiteSpace: "nowrap" } as const;

/** Campo de fecha con tres grupos iguales en una fila: Día, Mes y Año, cada uno con [←] [Actual] [→]. Se puede escribir o usar el selector normal. */
export default function FechaRapida({ valor, alCambiar, nombre }: Props) {
  const grupo = (etiqueta: string, parte: "dia" | "mes" | "anio") => (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center" }}>{etiqueta}</span>
      <div style={{ display: "flex", gap: "4px" }}>
        <button type="button" className="btn btn-secondary" style={{ ...estiloBoton, flex: "0 0 32px" }} onClick={() => alCambiar(moverFecha(valor, parte, -1))} title={`${etiqueta} anterior`} aria-label={`${etiqueta} anterior`}>
          ←
        </button>
        <button type="button" className="btn btn-secondary" style={{ ...estiloBoton, flex: "1 1 auto" }} onClick={() => alCambiar(ponerParteActual(valor, parte))} title={`${etiqueta} actual (el de hoy)`}>
          Actual
        </button>
        <button type="button" className="btn btn-secondary" style={{ ...estiloBoton, flex: "0 0 32px" }} onClick={() => alCambiar(moverFecha(valor, parte, 1))} title={`${etiqueta} siguiente`} aria-label={`${etiqueta} siguiente`}>
          →
        </button>
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", gap: "8px" }}>
        <input type="date" className="form-input" name={nombre} value={valor} onChange={(e) => alCambiar(e.target.value)} style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary" style={{ ...estiloBoton, flex: "0 0 auto", padding: "0 16px" }} onClick={() => alCambiar(hoyIsoCliente())} title="Poner la fecha de hoy completa">
          Hoy
        </button>
      </div>
      <div className="rejilla-propia" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
        {grupo("Día", "dia")}
        {grupo("Mes", "mes")}
        {grupo("Año", "anio")}
      </div>
    </div>
  );
}
