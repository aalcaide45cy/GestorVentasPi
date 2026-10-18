"use client";

import { useState } from "react";
import { formatDate } from "@/lib/date-utils";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import type { ExpedienteApp, FilaListado, ResultadoContraste } from "@/lib/contraste-listado";

interface Props {
  nombreArchivo: string;
  resultado: ResultadoContraste;
  alCerrar: () => void;
}

type Pestana = "difieren" | "soloExcel" | "soloApp" | "duplicados" | "coinciden";

interface FilaDif {
  clave: string;
  cliente: string;
  bastidor: string;
  expediente: number;
  campo: string;
  excel: string;
  app: string;
}
interface FilaDup {
  clave: string;
  donde: string;
  bastidor: string;
  detalle: string;
}

const fechaOTexto = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(v) : v);

const colDif: ColumnaTabla<FilaDif>[] = [
  { clave: "cliente", etiqueta: "Cliente", valor: (f) => f.cliente },
  { clave: "bastidor", etiqueta: "Bastidor", valor: (f) => f.bastidor, celda: (f) => f.bastidor || "-" },
  { clave: "exp", etiqueta: "Exp.", valor: (f) => f.expediente, celda: (f) => `#${f.expediente}` },
  { clave: "campo", etiqueta: "Campo", valor: (f) => f.campo },
  { clave: "excel", etiqueta: "Excel", valor: (f) => f.excel, celda: (f) => fechaOTexto(f.excel) },
  { clave: "app", etiqueta: "App", valor: (f) => f.app, celda: (f) => (f.app ? fechaOTexto(f.app) : <span style={{ color: "var(--text-muted)" }}>(vacío)</span>) },
];
const colListado: ColumnaTabla<FilaListado>[] = [
  { clave: "cliente", etiqueta: "Cliente", valor: (f) => f.cliente },
  { clave: "tipo", etiqueta: "VN / VO", valor: (f) => (f.usado ? "VO" : "VN"), alinear: "center" },
  { clave: "marca", etiqueta: "Marca", valor: (f) => f.marca },
  { clave: "modelo", etiqueta: "Modelo", valor: (f) => f.modelo },
  { clave: "bastidor", etiqueta: "Bastidor", valor: (f) => f.bastidor, celda: (f) => f.bastidor || "-" },
  { clave: "matricula", etiqueta: "Matrícula", valor: (f) => f.matricula, celda: (f) => f.matricula || "-" },
  { clave: "estado", etiqueta: "Estado", valor: (f) => f.estado },
];
const colApp: ColumnaTabla<ExpedienteApp>[] = [
  { clave: "exp", etiqueta: "Exp.", valor: (e) => e.id_expediente, celda: (e) => `#${e.id_expediente}` },
  { clave: "cliente", etiqueta: "Cliente", valor: (e) => e.cliente },
  { clave: "marca", etiqueta: "Marca", valor: (e) => e.marca },
  { clave: "modelo", etiqueta: "Modelo", valor: (e) => e.modelo },
  { clave: "bastidor", etiqueta: "Bastidor", valor: (e) => e.bastidor, celda: (e) => e.bastidor || "-" },
  { clave: "matricula", etiqueta: "Matrícula", valor: (e) => e.matricula, celda: (e) => e.matricula || "-" },
  { clave: "fecha", etiqueta: "Fecha", valor: (e) => e.f_expediente ?? "", celda: (e) => formatDate(e.f_expediente) || "-" },
];
const colDup: ColumnaTabla<FilaDup>[] = [
  { clave: "donde", etiqueta: "Dónde", valor: (d) => d.donde },
  { clave: "bastidor", etiqueta: "Bastidor", valor: (d) => d.bastidor },
  { clave: "detalle", etiqueta: "Detalle", valor: (d) => d.detalle },
];
const colCoinciden: ColumnaTabla<ResultadoContraste["coinciden"][number]>[] = [
  { clave: "exp", etiqueta: "Exp.", valor: (c) => c.id_expediente, celda: (c) => `#${c.id_expediente}` },
  { clave: "cliente", etiqueta: "Cliente", valor: (c) => c.fila.cliente },
  { clave: "tipo", etiqueta: "VN / VO", valor: (c) => (c.fila.usado ? "VO" : "VN"), alinear: "center" },
  { clave: "marca", etiqueta: "Marca", valor: (c) => c.fila.marca },
  { clave: "modelo", etiqueta: "Modelo", valor: (c) => c.fila.modelo },
  { clave: "bastidor", etiqueta: "Bastidor", valor: (c) => c.fila.bastidor, celda: (c) => c.fila.bastidor || "-" },
  { clave: "matricula", etiqueta: "Matrícula", valor: (c) => c.fila.matricula, celda: (c) => c.fila.matricula || "-" },
  { clave: "estado", etiqueta: "Estado", valor: (c) => c.fila.estado },
];

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
  const filasDif: FilaDif[] = r.difieren.flatMap((d) => d.diferencias.map((x) => ({ clave: `${d.fila.fila}-${x.campo}`, cliente: d.fila.cliente, bastidor: d.fila.bastidor, expediente: d.id_expediente, campo: x.campo, excel: x.excel, app: x.app })));
  const filasDup: FilaDup[] = [
    ...r.duplicadosApp.map((d) => ({ clave: `a-${d.clave}`, donde: "App", bastidor: d.clave, detalle: d.expedientes.map((e) => `#${e.id_expediente} ${e.cliente}`).join(" · ") })),
    ...r.duplicadosExcel.map((d) => ({ clave: `e-${d.clave}`, donde: "Excel", bastidor: d.clave, detalle: d.filas.map((f) => `fila ${f.fila} ${f.cliente}`).join(" · ") })),
  ];

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

        {pestana === "difieren" && (r.difieren.length === 0 ? vacio : <TablaDatos<FilaDif> id="contraste-difieren" columnas={colDif} filas={filasDif} clave={(f) => f.clave} placeholder="Buscar por cliente, bastidor, campo…" />)}
        {pestana === "soloExcel" && (r.soloExcel.length === 0 ? vacio : <TablaDatos<FilaListado> id="contraste-solo-excel" columnas={colListado} filas={r.soloExcel} clave={(f) => f.fila} placeholder="Buscar por cliente, modelo, bastidor, matrícula…" />)}
        {pestana === "soloApp" && (r.soloApp.length === 0 ? vacio : <TablaDatos<ExpedienteApp> id="contraste-solo-app" columnas={colApp} filas={r.soloApp} clave={(e) => e.id_expediente} placeholder="Buscar por cliente, modelo, bastidor, matrícula…" />)}
        {pestana === "duplicados" && (duplicados === 0 ? vacio : <TablaDatos<FilaDup> id="contraste-duplicados" columnas={colDup} filas={filasDup} clave={(d) => d.clave} placeholder="Buscar por bastidor o cliente…" />)}
        {pestana === "coinciden" && (r.coinciden.length === 0 ? vacio : <TablaDatos<(typeof r.coinciden)[number]> id="contraste-coinciden" columnas={colCoinciden} filas={r.coinciden} clave={(c) => c.fila.fila} placeholder="Buscar por cliente, modelo, bastidor, matrícula…" />)}
      </div>
    </div>
  );
}
