"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
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
 * Reparto de un importe entre conceptos. En la tabla solo se ve un resumen («50 € Financiación + 75 € Preference») y un botón; el reparto
 * se edita en una ventana con una fila por concepto, el resto calculado solo y el total comprobado.
 */
export default function RepartoImporte({ importe, reparto, defecto, sugerencias, titulo, alCambiar }: { importe: number; reparto: Reparto; defecto: Defecto; sugerencias: string[]; titulo: string; alCambiar: (r: Reparto) => void }) {
  const [abierto, setAbierto] = useState(false);
  const suma = reparto.reduce((t, r) => t + r.importe, 0);
  const resto = importe - suma;
  const pasado = resto < 0;
  const otroPropio: Defecto = defecto === "preference" ? "financiacion" : "preference";
  const cambiar = (i: number, c: Partial<{ concepto: string; importe: number }>) => alCambiar(reparto.map((r, j) => (j === i ? { ...r, ...c } : r)));
  const partesResumen = [...reparto.filter((r) => r.importe > 0).map((r) => `${euros(r.importe)} ${etiquetaConcepto(r.concepto)}`), ...(resto > 0 ? [`${euros(resto)} ${etiquetaConcepto(defecto)}`] : [])];

  return (
    <>
      {reparto.length === 0 ? (
        <button type="button" className="btn btn-secondary" onClick={() => setAbierto(true)} style={{ padding: "2px 8px", fontSize: "0.72rem", alignSelf: "flex-start" }} title="Reparte este importe entre varios conceptos (Financiación, Preference u otros que crees)">
          ✂ Repartir en conceptos
        </button>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} title="Editar el reparto de este importe" style={{ all: "unset", cursor: "pointer", fontSize: "0.75rem", color: pasado ? "var(--danger)" : "var(--primary)", lineHeight: 1.3, textDecoration: "underline dotted" }}>
          ✂ {partesResumen.join(" + ")}
        </button>
      )}
      {abierto && (
        <Modal
          titulo={`Repartir ${euros(importe)} · ${titulo}`}
          ancho="640px"
          pie={
            <>
              {reparto.length > 0 && (
                <button type="button" className="btn btn-secondary" onClick={() => alCambiar([])}>
                  Quitar el reparto
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={() => setAbierto(false)} disabled={pasado}>
                Hecho
              </button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            Elige a qué conceptos va cada parte del importe. Lo que no repartas va a <strong>{etiquetaConcepto(defecto)}</strong>. Cada concepto sale como una columna en las tablas de comisiones, y puedes crear los que quieras escribiendo su nombre.
          </p>
          <datalist id={`conceptos-${defecto}`}>
            {sugerencias.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <table className="table-premium table-compact" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Concepto</th>
                <th style={{ textAlign: "right" }}>Importe (€)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reparto.map((r, i) => {
                const propio = PROPIOS.some((p) => p.v === r.concepto);
                return (
                  <tr key={i}>
                    <td>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <select className="form-input" style={{ minWidth: "130px" }} value={propio ? r.concepto : "otro"} onChange={(e) => cambiar(i, { concepto: e.target.value === "otro" ? "extra:" : e.target.value })}>
                          {PROPIOS.map((p) => (
                            <option key={p.v} value={p.v}>
                              {p.t}
                            </option>
                          ))}
                          <option value="otro">Otro concepto…</option>
                        </select>
                        {!propio && <input className="form-input" list={`conceptos-${defecto}`} placeholder="Nombre del concepto" maxLength={60} value={r.concepto.replace(/^extra:/, "")} onChange={(e) => cambiar(i, { concepto: `extra:${e.target.value}` })} style={{ width: "170px", borderColor: r.concepto.replace(/^extra:/, "").trim() === "" ? "var(--danger)" : undefined }} autoFocus />}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <InputCentesimas valor={r.importe} ancho="100px" onChange={(v) => cambiar(i, { importe: v ?? 0 })} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => alCambiar(reparto.filter((_, j) => j !== i))}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: "var(--bg-surface-tint)" }}>
                <td>
                  <strong>{etiquetaConcepto(defecto)}</strong> <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>(el resto)</span>
                </td>
                <td style={{ textAlign: "right", fontWeight: 700, color: pasado ? "var(--danger)" : undefined }}>{euros(Math.max(0, resto))}</td>
                <td />
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td style={{ fontWeight: 700 }}>Total</td>
                <td style={{ textAlign: "right", fontWeight: 700, color: pasado ? "var(--danger)" : "var(--success)" }}>{euros(Math.max(suma, 0) + Math.max(0, resto))}</td>
                <td style={{ fontSize: "0.8rem", color: pasado ? "var(--danger)" : "var(--success)" }}>{pasado ? `Pasa ${euros(-resto)}` : "✓ Cuadra"}</td>
              </tr>
            </tfoot>
          </table>
          <div>
            <button type="button" className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: "0.85rem" }} onClick={() => alCambiar([...reparto, { concepto: reparto.some((r) => r.concepto === otroPropio) ? "extra:" : otroPropio, importe: 0 }])}>
              + Añadir concepto
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
