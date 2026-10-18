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

/** Resumen corto de un reparto: «50,00 € Financiación + 75,00 € Preference». */
function resumenReparto(importe: number, reparto: Reparto, defecto: Defecto): string {
  const resto = importe - reparto.reduce((t, r) => t + r.importe, 0);
  return [...reparto.filter((r) => r.importe > 0).map((r) => `${euros(r.importe)} ${etiquetaConcepto(r.concepto)}`), ...(resto > 0 ? [`${euros(resto)} ${etiquetaConcepto(defecto)}`] : [])].join(" + ");
}

/**
 * Reparto de un importe entre conceptos. En la tabla solo hay un botón con el resumen; el reparto se edita en una ventana con una fila por
 * concepto. Las cifras se compensan solas (el total siempre cuadra): al subir una baja la otra. «Cancelar» descarta lo editado.
 */
export default function RepartoImporte({ importe, reparto, defecto, sugerencias, titulo, alCambiar }: { importe: number; reparto: Reparto; defecto: Defecto; sugerencias: string[]; titulo: string; alCambiar: (r: Reparto) => void }) {
  const [borrador, setBorrador] = useState<Reparto | null>(null);
  const otroPropio: Defecto = defecto === "preference" ? "financiacion" : "preference";

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setBorrador(reparto.map((r) => ({ ...r })))} style={{ padding: "3px 10px", fontSize: "0.75rem", alignSelf: "flex-start", textAlign: "left", whiteSpace: "normal" }} title="Reparte este importe entre varios conceptos (Financiación, Preference u otros que crees)">
        {reparto.length === 0 ? "✂ Repartir en conceptos" : `✂ ${resumenReparto(importe, reparto, defecto)}`}
      </button>
      {borrador && (
        <FormularioReparto
          importe={importe}
          inicial={borrador}
          defecto={defecto}
          otroPropio={otroPropio}
          sugerencias={sugerencias}
          titulo={titulo}
          alAceptar={(r) => {
            alCambiar(r);
            setBorrador(null);
          }}
          alCancelar={() => setBorrador(null)}
        />
      )}
    </>
  );
}

function FormularioReparto({ importe, inicial, defecto, otroPropio, sugerencias, titulo, alAceptar, alCancelar }: { importe: number; inicial: Reparto; defecto: Defecto; otroPropio: Defecto; sugerencias: string[]; titulo: string; alAceptar: (r: Reparto) => void; alCancelar: () => void }) {
  const [partes, setPartes] = useState<Reparto>(inicial);
  const suma = partes.reduce((t, r) => t + r.importe, 0);
  const resto = Math.max(0, importe - suma);
  const nombreVacio = partes.some((r) => r.concepto.replace(/^extra:/, "").trim() === "");

  /** Cambia una parte y compensa: lo que sube una lo baja el concepto habitual (el resto), que siempre cuadra con el total. */
  const fijarParte = (i: number, v: number) => {
    const otras = suma - partes[i].importe;
    const tope = Math.max(0, importe - otras);
    setPartes(partes.map((r, j) => (j === i ? { ...r, importe: Math.min(Math.max(0, v), tope) } : r)));
  };
  /** Cambia el concepto habitual (el resto): lo que sube se le quita a la última parte, y si no hay partes, se crea una. */
  const fijarResto = (v: number) => {
    const objetivo = Math.min(Math.max(0, v), importe);
    const aRepartir = importe - objetivo;
    if (partes.length === 0) {
      if (aRepartir > 0) setPartes([{ concepto: otroPropio, importe: aRepartir }]);
      return;
    }
    const ultima = partes.length - 1;
    const otras = suma - partes[ultima].importe;
    const nueva = Math.max(0, aRepartir - otras);
    setPartes(partes.map((r, j) => (j === ultima ? { ...r, importe: nueva } : r)));
  };

  return (
    <Modal
      titulo={`Repartir ${euros(importe)} · ${titulo}`}
      ancho="640px"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCancelar}>
            Cancelar
          </button>
          {inicial.length > 0 && (
            <button type="button" className="btn btn-secondary" onClick={() => alAceptar([])}>
              Quitar el reparto
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => alAceptar(partes.filter((r) => r.importe > 0))} disabled={nombreVacio}>
            Hecho
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
        Reparte el importe entre conceptos: al cambiar una cifra, la otra se ajusta sola para que el total no cambie. Cada concepto sale como una columna en las tablas de comisiones, y puedes crear los que quieras escribiendo su nombre.
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
          <tr style={{ background: "var(--bg-surface-tint)" }}>
            <td>
              <strong>{etiquetaConcepto(defecto)}</strong>
            </td>
            <td style={{ textAlign: "right" }}>
              <InputCentesimas valor={resto} ancho="100px" onChange={(v) => fijarResto(v ?? 0)} />
            </td>
            <td />
          </tr>
          {partes.map((r, i) => {
            const propio = PROPIOS.some((p) => p.v === r.concepto);
            return (
              <tr key={i}>
                <td>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <select className="form-input" style={{ minWidth: "130px" }} value={propio ? r.concepto : "otro"} onChange={(e) => setPartes(partes.map((x, j) => (j === i ? { ...x, concepto: e.target.value === "otro" ? "extra:" : e.target.value } : x)))}>
                      {PROPIOS.map((p) => (
                        <option key={p.v} value={p.v}>
                          {p.t}
                        </option>
                      ))}
                      <option value="otro">Otro concepto…</option>
                    </select>
                    {!propio && <input className="form-input" list={`conceptos-${defecto}`} placeholder="Nombre del concepto" maxLength={60} value={r.concepto.replace(/^extra:/, "")} onChange={(e) => setPartes(partes.map((x, j) => (j === i ? { ...x, concepto: `extra:${e.target.value}` } : x)))} style={{ width: "170px", borderColor: r.concepto.replace(/^extra:/, "").trim() === "" ? "var(--danger)" : undefined }} autoFocus />}
                  </div>
                </td>
                <td style={{ textAlign: "right" }}>
                  <InputCentesimas valor={r.importe} ancho="100px" onChange={(v) => fijarParte(i, v ?? 0)} />
                </td>
                <td style={{ textAlign: "right" }}>
                  <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => setPartes(partes.filter((_, j) => j !== i))}>
                    Quitar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ fontWeight: 700 }}>Total</td>
            <td style={{ textAlign: "right", fontWeight: 700, color: "var(--success)" }}>{euros(suma + resto)}</td>
            <td style={{ fontSize: "0.8rem", color: "var(--success)" }}>✓ Cuadra</td>
          </tr>
        </tfoot>
      </table>
      <div>
        <button type="button" className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: "0.85rem" }} onClick={() => setPartes([...partes, { concepto: partes.some((r) => r.concepto === otroPropio) ? "extra:" : otroPropio, importe: 0 }])}>
          + Añadir concepto
        </button>
      </div>
    </Modal>
  );
}
