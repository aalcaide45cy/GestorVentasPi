"use client";

import { useState } from "react";
import { formatDate } from "@/lib/date-utils";
import type { FilaListado, ResultadoContraste } from "@/lib/contraste-listado";

interface Props {
  nombreArchivo: string;
  resultado: ResultadoContraste;
  alCerrar: () => void;
}

type Pestana = "difieren" | "soloExcel" | "soloApp" | "duplicados" | "coinciden";

const th = { textAlign: "left", whiteSpace: "nowrap" } as const;

const resumenFila = (f: FilaListado) => (
  <>
    <td>{f.cliente}</td>
    <td>{f.marca} {f.modelo}</td>
    <td>{f.bastidor || "-"}</td>
    <td>{f.matricula || "-"}</td>
    <td>{f.estado}</td>
  </>
);

/** Resultado del contraste de un listado de ventas (Excel) con los expedientes. Solo informa: no cambia nada. */
export default function ModalContrasteListado({ nombreArchivo, resultado: r, alCerrar }: Props) {
  const [pestana, setPestana] = useState<Pestana>("difieren");
  const duplicados = r.duplicadosApp.length + r.duplicadosExcel.length;
  const pestanas: { id: Pestana; texto: string; n: number }[] = [
    { id: "difieren", texto: "Difieren", n: r.difieren.length },
    { id: "soloExcel", texto: "Solo en el Excel", n: r.soloExcel.length },
    { id: "soloApp", texto: "Solo en la app", n: r.soloApp.length },
    { id: "duplicados", texto: "Duplicados", n: duplicados },
    { id: "coinciden", texto: "Coinciden", n: r.coinciden.length },
  ];
  const vacio = <p style={{ color: "var(--text-secondary)", margin: "12px 0" }}>Nada que mostrar aquí.</p>;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-overlay"
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999, padding: "20px" }}
    >
      <div
        className="modal-content glass-panel"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "24px", width: "100%", maxWidth: "1100px", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "1.25rem" }}>🔎 Contraste con el listado</h3>
          <button type="button" onClick={alCerrar} aria-label="Cerrar" style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "1.2rem" }}>
            ✕
          </button>
        </div>
        <p style={{ margin: "0 0 8px", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          <strong>{nombreArchivo}</strong>: {r.totales.filasExcel} filas ({r.totales.anuladas} anuladas, que no se comparan) frente a {r.totales.expedientesApp} expedientes de la app.
          Solo se muestra la comparación; no se ha cambiado nada.
          {r.rango && <> Para «Solo en la app» se miran los expedientes del {formatDate(r.rango.desde)} al {formatDate(r.rango.hasta)}.</>}
        </p>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "12px 0" }}>
          {pestanas.map((p) => (
            <button key={p.id} type="button" className={pestana === p.id ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "6px 12px", fontSize: "0.85rem" }} onClick={() => setPestana(p.id)}>
              {p.texto} ({p.n})
            </button>
          ))}
        </div>

        <div className="table-container" style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", overflowX: "auto" }}>
          {pestana === "difieren" &&
            (r.difieren.length === 0 ? vacio : (
              <table className="table-premium" style={{ fontSize: "0.85rem", width: "100%" }}>
                <thead><tr><th style={th}>Cliente</th><th style={th}>Bastidor</th><th style={th}>Exp.</th><th style={th}>Campo</th><th style={th}>Excel</th><th style={th}>App</th></tr></thead>
                <tbody>
                  {r.difieren.flatMap((d) =>
                    d.diferencias.map((x, i) => (
                      <tr key={`${d.fila.fila}-${x.campo}`}>
                        <td>{i === 0 ? d.fila.cliente : ""}</td>
                        <td>{i === 0 ? d.fila.bastidor || "-" : ""}</td>
                        <td>{i === 0 ? `#${d.id_expediente}` : ""}</td>
                        <td>{x.campo}</td>
                        <td>{/^\d{4}-\d{2}-\d{2}$/.test(x.excel) ? formatDate(x.excel) : x.excel}</td>
                        <td>{x.app ? (/^\d{4}-\d{2}-\d{2}$/.test(x.app) ? formatDate(x.app) : x.app) : <span style={{ color: "var(--text-muted)" }}>(vacío)</span>}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            ))}

          {pestana === "soloExcel" &&
            (r.soloExcel.length === 0 ? vacio : (
              <table className="table-premium" style={{ fontSize: "0.85rem", width: "100%" }}>
                <thead><tr><th style={th}>Cliente</th><th style={th}>Marca / modelo</th><th style={th}>Bastidor</th><th style={th}>Matrícula</th><th style={th}>Estado</th></tr></thead>
                <tbody>{r.soloExcel.map((f) => <tr key={f.fila}>{resumenFila(f)}</tr>)}</tbody>
              </table>
            ))}

          {pestana === "soloApp" &&
            (r.soloApp.length === 0 ? vacio : (
              <table className="table-premium" style={{ fontSize: "0.85rem", width: "100%" }}>
                <thead><tr><th style={th}>Exp.</th><th style={th}>Cliente</th><th style={th}>Marca / modelo</th><th style={th}>Bastidor</th><th style={th}>Matrícula</th><th style={th}>Fecha</th></tr></thead>
                <tbody>
                  {r.soloApp.map((e) => (
                    <tr key={e.id_expediente}>
                      <td>#{e.id_expediente}</td><td>{e.cliente}</td><td>{e.marca} {e.modelo}</td><td>{e.bastidor || "-"}</td><td>{e.matricula || "-"}</td><td>{formatDate(e.f_expediente) || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {pestana === "duplicados" &&
            (duplicados === 0 ? vacio : (
              <table className="table-premium" style={{ fontSize: "0.85rem", width: "100%" }}>
                <thead><tr><th style={th}>Dónde</th><th style={th}>Bastidor</th><th style={th}>Detalle</th></tr></thead>
                <tbody>
                  {r.duplicadosApp.map((d) => (
                    <tr key={`a-${d.clave}`}><td>App</td><td>{d.clave}</td><td>{d.expedientes.map((e) => `#${e.id_expediente} ${e.cliente}`).join(" · ")}</td></tr>
                  ))}
                  {r.duplicadosExcel.map((d) => (
                    <tr key={`e-${d.clave}`}><td>Excel</td><td>{d.clave}</td><td>{d.filas.map((f) => `fila ${f.fila} ${f.cliente}`).join(" · ")}</td></tr>
                  ))}
                </tbody>
              </table>
            ))}

          {pestana === "coinciden" &&
            (r.coinciden.length === 0 ? vacio : (
              <table className="table-premium" style={{ fontSize: "0.85rem", width: "100%" }}>
                <thead><tr><th style={th}>Exp.</th><th style={th}>Cliente</th><th style={th}>Marca / modelo</th><th style={th}>Bastidor</th><th style={th}>Matrícula</th><th style={th}>Estado</th></tr></thead>
                <tbody>{r.coinciden.map((c) => <tr key={c.fila.fila}><td>#{c.id_expediente}</td>{resumenFila(c.fila)}</tr>)}</tbody>
              </table>
            ))}
        </div>
      </div>
    </div>
  );
}
