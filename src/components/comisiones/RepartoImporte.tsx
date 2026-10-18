"use client";

import { useState } from "react";
import { InputCentesimas } from "./campos";
import { euros } from "@/lib/formato";

type Reparto = { concepto: string; importe: number }[];
type Defecto = "financiacion" | "preference";

const PROPIOS: { v: string; t: string }[] = [
  { v: "financiacion", t: "Financiación" },
  { v: "preference", t: "Preference" },
];

/** Nombre legible de un concepto: «financiacion», «preference» o el nombre propio tras «extra:». */
export function etiquetaConcepto(c: string): string {
  if (c === "financiacion") return "Financiación";
  if (c === "preference") return "Preference";
  return c.replace(/^extra:/, "");
}

/** Nombres de los conceptos propios que ya usa el plan (para sugerirlos al crear otros repartos). */
export function conceptosPropiosDelPlan(lineas: { reparto: Reparto }[]): string[] {
  const nombres = new Set<string>();
  for (const l of lineas) for (const r of l.reparto) if (r.concepto.startsWith("extra:") && r.concepto.length > 6) nombres.add(r.concepto.slice(6));
  return [...nombres].sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * Reparto de un importe entre conceptos: «de estos 125 €, 50 van a Financiación y el resto a Preference».
 * Lo que no se reparte va al concepto habitual de la línea; se pueden crear conceptos propios con cualquier nombre.
 */
export default function RepartoImporte({ importe, reparto, defecto, sugerencias, alCambiar }: { importe: number; reparto: Reparto; defecto: Defecto; sugerencias: string[]; alCambiar: (r: Reparto) => void }) {
  const [abierto, setAbierto] = useState(false);
  const suma = reparto.reduce((t, r) => t + r.importe, 0);
  const resto = importe - suma;
  const pasado = resto < 0;
  const lista = `lista-conceptos-${defecto}`;
  const cambiar = (i: number, c: Partial<{ concepto: string; importe: number }>) => alCambiar(reparto.map((r, j) => (j === i ? { ...r, ...c } : r)));
  const resumen = reparto.length === 0 ? null : [...reparto.map((r) => `${euros(r.importe)} → ${etiquetaConcepto(r.concepto)}`), ...(resto > 0 ? [`${euros(resto)} → ${etiquetaConcepto(defecto)}`] : [])].join(" · ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "150px" }}>
      <button type="button" className="btn btn-secondary" onClick={() => setAbierto(!abierto)} style={{ padding: "2px 8px", fontSize: "0.72rem", alignSelf: "flex-start" }} title="Reparte este importe entre varios conceptos (Financiación, Preference u otros que crees)">
        {abierto ? "▾ Reparto" : reparto.length === 0 ? "✂ Repartir en conceptos" : "✂ Reparto"}
      </button>
      {!abierto && resumen && <span style={{ fontSize: "0.72rem", color: pasado ? "var(--danger)" : "var(--text-secondary)" }}>{resumen}</span>}
      {abierto && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "8px", border: "1px dashed var(--border-light)", borderRadius: "var(--radius-sm)" }}>
          <datalist id={lista}>
            {sugerencias.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {reparto.map((r, i) => {
            const propio = PROPIOS.some((p) => p.v === r.concepto);
            return (
              <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <select className="form-input" style={{ minWidth: "120px" }} value={propio ? r.concepto : "otro"} onChange={(e) => cambiar(i, { concepto: e.target.value === "otro" ? "extra:" : e.target.value })}>
                  {PROPIOS.map((p) => (
                    <option key={p.v} value={p.v}>
                      {p.t}
                    </option>
                  ))}
                  <option value="otro">Otro concepto…</option>
                </select>
                {!propio && <input className="form-input" list={lista} placeholder="Nombre del concepto" maxLength={60} value={r.concepto.replace(/^extra:/, "")} onChange={(e) => cambiar(i, { concepto: `extra:${e.target.value}` })} style={{ width: "150px", borderColor: r.concepto.replace(/^extra:/, "").trim() === "" ? "var(--danger)" : undefined }} />}
                <InputCentesimas valor={r.importe} ancho="90px" onChange={(v) => cambiar(i, { importe: v ?? 0 })} sufijo="€" />
                <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.72rem" }} onClick={() => alCambiar(reparto.filter((_, j) => j !== i))}>
                  Quitar
                </button>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.72rem" }} onClick={() => alCambiar([...reparto, { concepto: defecto === "preference" ? "financiacion" : "preference", importe: Math.max(0, resto) }])}>
              + Añadir parte
            </button>
            <span style={{ fontSize: "0.75rem", color: pasado ? "var(--danger)" : "var(--text-secondary)" }}>
              {pasado ? `Las partes suman ${euros(suma)}, más que el importe (${euros(importe)})` : `Resto: ${euros(resto)} → ${etiquetaConcepto(defecto)}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
