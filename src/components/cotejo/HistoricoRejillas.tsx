"use client";

import { useMemo, useState } from "react";
import CasillaAnulados, { useMostrarAnulados } from "@/components/CasillaAnulados";
import { useCarga } from "@/components/comisiones/useCarga";
import { esAnulado } from "@/lib/anulados";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { columnasVehiculo } from "@/components/etiquetas";
import { cotejarPagos, mesDeFila, mesesEsperados, type EstadoCotejo, type FilaCotejo } from "@/lib/cotejo-pagos";
import { formatDate } from "@/lib/date-utils";
import { nombreMes } from "@/lib/formato";
import type { DatosCotejo } from "@/lib/servicios/cotejo";

type Filtro = "todos" | "coinciden" | "no_figuran" | "dudosos" | "sin_rejilla" | "sin_expediente";

const COLOR: Record<EstadoCotejo, { fondo: string; borde: string; icono: string; texto: string }> = {
  pagado: { fondo: "rgba(34, 197, 94, 0.14)", borde: "#22c55e", icono: "🟢", texto: "Coincide" },
  dudoso: { fondo: "rgba(234, 179, 8, 0.18)", borde: "#eab308", icono: "🟡", texto: "Dudoso" },
  no_pagado: { fondo: "rgba(239, 68, 68, 0.16)", borde: "#ef4444", icono: "🔴", texto: "No figura en la rejilla" },
  sin_rejilla: { fondo: "rgba(148, 163, 184, 0.12)", borde: "#94a3b8", icono: "⚪", texto: "Aún sin rejilla de su mes" },
};
const SIN_EXPEDIENTE = { fondo: "rgba(168, 85, 247, 0.14)", borde: "#a855f7", icono: "🟣", texto: "En la rejilla, sin expediente" };

const aspecto = (f: FilaCotejo) => (!f.coche ? SIN_EXPEDIENTE : COLOR[f.estado]);
const categoria = (f: FilaCotejo): Exclude<Filtro, "todos"> => (!f.coche ? "sin_expediente" : f.estado === "pagado" ? "coinciden" : f.estado === "no_pagado" ? "no_figuran" : f.estado === "dudoso" ? "dudosos" : "sin_rejilla");
const fecha = (v: string | null) => formatDate(v) || "-";

/**
 * Histórico: todas las matrículas de los expedientes de la aplicación frente a todas las matrículas leídas de las rejillas guardadas, en una
 * sola tabla y con un color por fila. Se ve de un vistazo lo que coincide, los coches que no figuran en ninguna rejilla y las matrículas de
 * una rejilla que no tienen expediente. Las rejillas se guardan mes a mes desde «Mi mes», así que el histórico crece solo.
 */
export default function HistoricoRejillas({ vendedores, idUsuarioActual, esAdministrador }: { vendedores: { id: number; nombre: string }[]; idUsuarioActual: number; esAdministrador: boolean }) {
  const [idVendedor, setIdVendedor] = useState(idUsuarioActual);
  const { datos } = useCarga<DatosCotejo | null>(`/api/cotejo?usuario=${idVendedor}`, null);
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const resultado = useMemo(() => (datos ? cotejarPagos(datos.coches, datos.pagos) : null), [datos]);
  // Los expedientes anulados en el listado de la intranet no son ventas: sus filas salen ocultas salvo que se active la casilla. Se comparan igualmente
  // (así una matrícula de una rejilla que es de un anulado no sale como «sin expediente»).
  const [mostrarAnulados, fijarMostrarAnulados] = useMostrarAnulados("historico-rejillas");
  const todasLasFilas = useMemo(() => resultado?.filas ?? [], [resultado]);
  const nAnuladas = useMemo(() => todasLasFilas.filter((f) => f.coche && esAnulado(f.coche.estado)).length, [todasLasFilas]);
  const filas = useMemo(() => (mostrarAnulados ? todasLasFilas : todasLasFilas.filter((f) => !(f.coche && esAnulado(f.coche.estado)))), [todasLasFilas, mostrarAnulados]);
  const cuentas = useMemo(() => {
    const c: Record<Exclude<Filtro, "todos">, number> = { coinciden: 0, no_figuran: 0, dudosos: 0, sin_rejilla: 0, sin_expediente: 0 };
    for (const f of filas) c[categoria(f)]++;
    return c;
  }, [filas]);
  const visibles = filtro === "todos" ? filas : filas.filter((f) => categoria(f) === filtro);
  const matriculasRejillas = new Set(datos?.pagos.map((p) => p.matricula) ?? []).size;

  const columnas: ColumnaTabla<FilaCotejo>[] = [
    {
      clave: "resultado",
      etiqueta: "Resultado",
      valor: (f) => aspecto(f).texto,
      celda: (f) => (
        <div style={{ minWidth: "170px", whiteSpace: "normal" }}>
          <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
            {aspecto(f).icono} {aspecto(f).texto}
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: "0.76rem", marginTop: "2px" }}>{f.motivo}</div>
        </div>
      ),
    },
    { clave: "matricula", etiqueta: "Matrícula", valor: (f) => f.matricula, celda: (f) => <b>{f.matricula}</b>, ayuda: "Matrícula del expediente o, si no hay expediente, la leída de la rejilla" },
    { clave: "cliente", etiqueta: "Cliente (expediente)", valor: (f) => f.coche?.cliente ?? "", celda: (f) => f.coche?.cliente || <span style={{ color: "var(--text-muted)" }}>(sin expediente)</span> },
    ...columnasVehiculo<FilaCotejo>((f) => ({ clase: f.coche ? (f.coche.usado ? "VO" : "VN") : null, marca: f.coche?.marca, modelo: f.coche?.modelo, estado: f.coche?.estado, tipoPago: f.coche?.tipo_pago }), { vacio: <span style={{ color: "var(--text-muted)" }}>—</span> }),
    { clave: "fechaClave", etiqueta: "F. matric. / afect.", valor: (f) => (f.coche?.usado ? f.coche.f_afectacion : f.coche?.f_matriculacion) ?? "", celda: (f) => (f.coche ? fecha((f.coche.usado ? f.coche.f_afectacion : f.coche.f_matriculacion) ?? null) : "-"), ayuda: "Fecha de afectación en los usados y de matriculación en los nuevos" },
    { clave: "mesEsperado", etiqueta: "Mes que le toca", valor: (f) => mesDeFila(f) ?? "", celda: (f) => (f.coche ? mesesEsperados(f.coche).map(nombreMes).join(" / ") || "-" : "-"), ayuda: "Mes en que debería cobrarse el coche" },
    { clave: "rejilla", etiqueta: "Figura en la rejilla de", valor: (f) => f.mesRejilla ?? "", celda: (f) => (f.mesRejilla ? <b>{nombreMes(f.mesRejilla)}</b> : <span style={{ color: "var(--text-muted)" }}>No figura</span>) },
  ];

  const filtros: { id: Filtro; texto: string; n: number; color: string; icono: string }[] = [
    { id: "todos", texto: "Todo", n: filas.length, color: "var(--primary)", icono: "📚" },
    { id: "coinciden", texto: "Coinciden", n: cuentas.coinciden, color: COLOR.pagado.borde, icono: COLOR.pagado.icono },
    { id: "no_figuran", texto: "No figuran en rejilla", n: cuentas.no_figuran, color: COLOR.no_pagado.borde, icono: COLOR.no_pagado.icono },
    { id: "dudosos", texto: "Dudosos", n: cuentas.dudosos, color: COLOR.dudoso.borde, icono: COLOR.dudoso.icono },
    { id: "sin_expediente", texto: "En rejilla, sin expediente", n: cuentas.sin_expediente, color: SIN_EXPEDIENTE.borde, icono: SIN_EXPEDIENTE.icono },
    { id: "sin_rejilla", texto: "Aún sin rejilla", n: cuentas.sin_rejilla, color: COLOR.sin_rejilla.borde, icono: COLOR.sin_rejilla.icono },
  ];

  return (
    <section className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>📚 Histórico: expedientes frente a rejillas</h2>
          <p style={{ margin: "2px 0 0 0", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            {datos ? (
              <>
                {datos.coches.filter((c) => c.matricula.trim()).length} expedientes con matrícula · {matriculasRejillas} matrículas leídas en {datos.rejillas.length} rejilla{datos.rejillas.length === 1 ? "" : "s"} guardada{datos.rejillas.length === 1 ? "" : "s"}
              </>
            ) : (
              "Cargando…"
            )}
          </p>
        </div>
        {esAdministrador && vendedores.length > 1 && (
          <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.85rem" }}>
            Vendedor
            <select className="form-input" value={idVendedor} onChange={(e) => setIdVendedor(Number(e.target.value))}>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {datos && datos.rejillas.length === 0 && (
        <p style={{ margin: 0, color: "var(--text-secondary)" }}>Todavía no hay ninguna rejilla guardada. Súbela en la pestaña «Mi mes» y sus matrículas quedarán aquí, comparadas con tus expedientes.</p>
      )}

      <div style={{ display: "flex" }}>
        <CasillaAnulados activa={mostrarAnulados} alCambiar={fijarMostrarAnulados} anulados={nAnuladas} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
        {filtros.map((f) => (
          <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)} className={filtro === f.id ? "btn btn-primary" : "btn btn-secondary"} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", padding: "8px 12px", borderLeft: `4px solid ${f.color}`, opacity: f.n === 0 && filtro !== f.id ? 0.55 : 1 }}>
            <span style={{ fontSize: "1.3rem", fontWeight: 800, lineHeight: 1.1 }}>{f.n}</span>
            <span style={{ fontSize: "0.78rem", textAlign: "left" }}>
              {f.icono} {f.texto}
            </span>
          </button>
        ))}
      </div>

      <TablaDatos<FilaCotejo>
        id="cotejo-historico"
        columnas={columnas}
        filas={visibles}
        clave={(f) => `${f.matricula}-${f.estado}-${f.mesRejilla ?? ""}-${f.coche?.id_expediente ?? ""}`}
        placeholder="Buscar por matrícula, cliente, marca, modelo, mes…"
        vacio={filas.length === 0 ? "Todavía no hay matrículas que comparar." : "No hay nada en esta categoría."}
        estiloFila={(f) => ({ background: aspecto(f).fondo, boxShadow: `inset 4px 0 0 ${aspecto(f).borde}` })}
        textoExtra={(f) => `${f.motivo} ${f.mesRejilla ? nombreMes(f.mesRejilla) : ""}`}
        pie={(fs) => ({ resultado: `${fs.length} fila${fs.length === 1 ? "" : "s"}` })}
      />
      {resultado && resultado.sinMatricula.length > 0 && <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.82rem" }}>Hay {resultado.sinMatricula.length} coche(s) sin matrícula que no se pueden comparar (anulados o sin matricular).</p>}
    </section>
  );
}
