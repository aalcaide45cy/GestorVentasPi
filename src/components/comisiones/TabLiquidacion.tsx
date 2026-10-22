"use client";

import Link from "next/link";
import { useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { codigoExpediente } from "@/lib/date-utils";
import { euros, eurosConSigno, etiquetaTramo, nombreMes, puntos } from "@/lib/formato";
import type { Comparacion, LiquidacionResumen, PrevisionMes } from "@/lib/servicios/comisiones-gestion";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { llamar, textoError } from "./api";
import { BotonMini, Seccion } from "./campos";
import type { PropsPestana } from "./tipos";
import { useCarga } from "./useCarga";

interface Detalle {
  liquidacion: { idLiquidation: number; mes: string; estado: string; version: number; neto: number; bruto: number; penalizacion: number; puntosMes: number; objetivoX: number; tramo: number; avisos: string[]; tasaIntervencion: { idMarca: number; numerador: number; denominador: number; porcentaje: number | null; cumplida: boolean }[] };
  lineas: { idLine: number; idExpediente: number | null; clase: string; puntos: number; importe: number; cuenta: boolean; conceptos: { idItem: number; concepto: string; descripcion: string; importe: number; puntos: number; aviso: string | null; mesEvento: string | null }[] }[];
  versiones: { id: number; version: number; motivo: string; creadaEn: string; netoAnterior: number; netoNuevo: number; diferencia: number }[];
}

interface Apunte {
  id: number;
  idExpediente: number | null;
  evento: string;
  fecha: string;
  puntos: number;
  regla: string | null;
  creadoEn: string;
}

const COLOR_ESTADO: Record<string, string> = { borrador: "var(--text-muted)", calculada: "var(--info)", revisada: "var(--warning)", cerrada: "var(--success)" };

export default function TabLiquidacion({ plan, cat, hayCambios }: PropsPestana & { hayCambios: boolean }) {
  const { mostrar: mostrarToast } = useToast();
  const [mes, setMes] = useState(plan.fechaInicio.slice(0, 7));
  const [vendedor, setVendedor] = useState<number | "">("");
  const [trabajando, setTrabajando] = useState(false);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [prevision, setPrevision] = useState<PrevisionMes[]>([]);
  const [libro, setLibro] = useState<Apunte[] | null>(null);
  const [comparacion, setComparacion] = useState<Comparacion | null>(null);
  const nombreV = (id: number) => cat.vendedores.find((v) => v.id === id)?.nombre ?? `Usuario ${id}`;

  const { datos: liqs, recargar: cargar } = useCarga<LiquidacionResumen[]>(`/api/comisiones/liquidaciones?plan=${plan.idPlan}`, []);

  const calcular = async () => {
    if (hayCambios) return mostrarToast("Guarda el plan antes de calcular la liquidación", "error");
    setTrabajando(true);
    try {
      await llamar("/api/comisiones/liquidar", { method: "POST", cuerpo: { idPlan: plan.idPlan, mes, idVendedor: vendedor === "" ? undefined : vendedor } });
      mostrarToast("Liquidación calculada", "exito");
      cargar();
    } catch (e) {
      mostrarToast(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const abrir = async (id: number) => {
    try {
      setDetalle((await llamar<Detalle>(`/api/comisiones/liquidaciones?id=${id}`)).data);
    } catch (e) {
      mostrarToast(textoError(e), "error");
    }
  };

  const cambiarEstado = async (id: number, estado: string) => {
    try {
      await llamar("/api/comisiones/liquidaciones", { method: "PATCH", cuerpo: { id, estado } });
      cargar();
    } catch (e) {
      mostrarToast(textoError(e), "error");
    }
  };

  const comparar = async (id: number) => {
    try {
      setComparacion((await llamar<Comparacion>(`/api/comisiones/comparar?id=${id}`)).data);
    } catch (e) {
      mostrarToast(textoError(e), "error");
    }
  };

  const verPrevision = async (idUsuario: number) => {
    try {
      setPrevision((await llamar<PrevisionMes[]>(`/api/comisiones/prevision?usuario=${idUsuario}`)).data);
    } catch (e) {
      mostrarToast(textoError(e), "error");
    }
  };

  const verLibro = async (idUsuario: number, m: string) => {
    try {
      setLibro((await llamar<Apunte[]>(`/api/comisiones/libro?usuario=${idUsuario}&mes=${m}`)).data);
    } catch (e) {
      mostrarToast(textoError(e), "error");
    }
  };

  const columnasLiquidaciones: ColumnaTabla<LiquidacionResumen>[] = [
    { clave: "vendedor", etiqueta: "Vendedor", valor: (l) => l.vendedor ?? "" },
    { clave: "mes", etiqueta: "Mes", valor: (l) => l.mes, celda: (l) => nombreMes(l.mes) },
    {
      clave: "estado",
      etiqueta: "Estado",
      valor: (l) => l.estado,
      celda: (l) => (
        <>
          <span style={{ color: COLOR_ESTADO[l.estado], fontWeight: 600 }}>{l.estado}</span>
          {l.version > 1 && <span style={{ color: "var(--text-muted)" }}> · v{l.version}</span>}
          {l.origen === "importada_antigua" && <span style={{ color: "var(--text-muted)" }}> · importada</span>}
        </>
      ),
    },
    { clave: "puntos", etiqueta: "Puntos / Objetivo", valor: (l) => l.puntosMes, celda: (l) => `${puntos(l.puntosMes)} / ${puntos(l.objetivoX)}`, alinear: "right" },
    { clave: "tramo", etiqueta: "Tramo", valor: (l) => l.tramo, celda: (l) => etiquetaTramo(l.tramo) },
    { clave: "bruto", etiqueta: "Bruto", valor: (l) => l.bruto, celda: (l) => euros(l.bruto), alinear: "right" },
    { clave: "penalizacion", etiqueta: "Penalización", valor: (l) => l.penalizacion, celda: (l) => euros(l.penalizacion), alinear: "right" },
    { clave: "neto", etiqueta: "Neto", valor: (l) => l.neto, celda: (l) => <b>{euros(l.neto)}</b>, alinear: "right" },
    { clave: "mesPago", etiqueta: "Se cobra en", valor: (l) => l.mesPago, celda: (l) => nombreMes(l.mesPago) },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      valor: () => "",
      celda: (l) => (
        <span style={{ display: "inline-flex", gap: "6px" }}>
          <BotonMini onClick={() => abrir(l.idLiquidation)}>Desglose</BotonMini>
          <BotonMini onClick={() => verLibro(l.idUsuario, l.mes)}>Libro</BotonMini>
          <BotonMini onClick={() => verPrevision(l.idUsuario)}>Nómina</BotonMini>
          {(l.origen === "importada_antigua" || l.version > 1) && <BotonMini onClick={() => comparar(l.idLiquidation)}>Comparar con la antigua</BotonMini>}
          {l.estado === "calculada" && <BotonMini onClick={() => cambiarEstado(l.idLiquidation, "revisada")}>Marcar revisada</BotonMini>}
          {l.estado !== "cerrada" && <BotonMini onClick={() => cambiarEstado(l.idLiquidation, "cerrada")}>Cerrar</BotonMini>}
        </span>
      ),
    },
  ];
  const columnasPrevision: ColumnaTabla<PrevisionMes>[] = [
    { clave: "mes", etiqueta: "Nómina de", valor: (p) => p.mesPago, celda: (p) => nombreMes(p.mesPago) },
    { clave: "neto", etiqueta: "Comisión neta", valor: (p) => p.neto, celda: (p) => euros(p.neto), alinear: "right" },
    { clave: "pendientesPlan", etiqueta: "Pendientes del plan", valor: (p) => p.pendientesPlan, celda: (p) => euros(p.pendientesPlan), alinear: "right" },
    { clave: "pendienteCobro", etiqueta: "Pendiente de cobro", valor: (p) => p.pendienteCobro, celda: (p) => euros(p.pendienteCobro), alinear: "right" },
    { clave: "total", etiqueta: "Total previsto", valor: (p) => p.total, celda: (p) => <b>{euros(p.total)}</b>, alinear: "right" },
  ];
  const columnasLibro: ColumnaTabla<Apunte>[] = [
    { clave: "fecha", etiqueta: "Fecha", valor: (a) => a.fecha },
    { clave: "evento", etiqueta: "Evento", valor: (a) => a.evento },
    { clave: "expediente", etiqueta: "Expediente", valor: (a) => a.idExpediente ?? 0, celda: (a) => (a.idExpediente ? codigoExpediente(a.idExpediente) : "—") },
    { clave: "regla", etiqueta: "Regla", valor: (a) => a.regla ?? "", celda: (a) => a.regla ?? "—" },
    { clave: "puntos", etiqueta: "Puntos", valor: (a) => a.puntos, celda: (a) => <span style={{ color: a.puntos < 0 ? "var(--danger)" : undefined }}>{puntos(a.puntos)}</span>, alinear: "right" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Seccion titulo="Liquidación Consolidada" ayuda="Lo generado en el mes M se cobra en la nómina de fin del mes M+1. Si cambias un expediente de un mes ya cerrado, la liquidación se recalcula sola y se guarda la versión anterior.">
        <div style={{ display: "flex", gap: "12px", alignItems: "end", flexWrap: "wrap" }}>
          <div>
            <label className="form-label">Mes</label>
            <input className="form-input" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Vendedor</label>
            <select className="form-input" value={vendedor} onChange={(e) => setVendedor(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Todos los del plan</option>
              {plan.vendedores.map((v) => (
                <option key={v.idUsuario} value={v.idUsuario}>
                  {nombreV(v.idUsuario)}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-primary" disabled={trabajando} onClick={calcular}>
            {trabajando ? "Calculando…" : "Calcular / Recalcular Liquidación"}
          </button>
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>«Comparar» aparece en las liquidaciones importadas de la aplicación antigua.</span>
        </div>
      </Seccion>

      <Seccion titulo="Liquidaciones del plan">
        <TablaDatos<LiquidacionResumen>
          id="liquidaciones-plan"
          columnas={columnasLiquidaciones}
          filas={liqs}
          clave={(l) => l.idLiquidation}
          placeholder="Buscar por vendedor, mes, estado…"
          vacio="Aún no hay liquidaciones calculadas para este plan."
          pie={(fs) => ({
            vendedor: `${fs.length} liquidación${fs.length === 1 ? "" : "es"}`,
            bruto: euros(fs.reduce((t, l) => t + l.bruto, 0)),
            penalizacion: euros(fs.reduce((t, l) => t + l.penalizacion, 0)),
            neto: euros(fs.reduce((t, l) => t + l.neto, 0)),
          })}
        />
      </Seccion>

      {prevision.length > 0 && (
        <Seccion titulo="Previsión de nómina (M+1)" acciones={<BotonMini onClick={() => setPrevision([])}>Ocultar</BotonMini>}>
          <TablaDatos<PrevisionMes>
            id="prevision-nomina"
            columnas={columnasPrevision}
            filas={prevision}
            clave={(p) => p.mesPago}
            vacio="Sin previsión."
            pie={(fs) => ({
              mes: "Total",
              neto: euros(fs.reduce((t, p) => t + p.neto, 0)),
              pendientesPlan: euros(fs.reduce((t, p) => t + p.pendientesPlan, 0)),
              pendienteCobro: euros(fs.reduce((t, p) => t + p.pendienteCobro, 0)),
              total: euros(fs.reduce((t, p) => t + p.total, 0)),
            })}
          />
        </Seccion>
      )}

      {libro && (
        <Seccion titulo="Libro de puntos (solo inserción)" acciones={<BotonMini onClick={() => setLibro(null)}>Ocultar</BotonMini>}>
          <TablaDatos<Apunte>
            id="libro-puntos"
            columnas={columnasLibro}
            filas={libro}
            clave={(a) => a.id}
            placeholder="Buscar por evento, expediente, regla…"
            vacio="El libro no tiene apuntes."
            pie={(fs) => ({ fecha: "Total", puntos: puntos(fs.reduce((t, a) => t + a.puntos, 0)) })}
          />
        </Seccion>
      )}

      {comparacion && (
        <Modal
          titulo={`Comparar con liquidación antigua · ${nombreMes(comparacion.mes)}`}
          ancho="900px"
          pie={
            <button type="button" className="btn btn-secondary" onClick={() => setComparacion(null)}>
              Cerrar
            </button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxHeight: "calc(65 * var(--uvh))", overflowY: "auto" }}>
            <table className="table-premium table-compact">
              <thead>
                <tr>
                  <th />
                  <th style={{ textAlign: "right" }}>Antigua</th>
                  <th style={{ textAlign: "right" }}>Motor nuevo</th>
                  <th style={{ textAlign: "right" }}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Total neto</td>
                  <td style={{ textAlign: "right" }}>{euros(comparacion.totalAntes)}</td>
                  <td style={{ textAlign: "right" }}>{euros(comparacion.totalAhora)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{eurosConSigno(comparacion.totalAhora - comparacion.totalAntes)}</td>
                </tr>
                <tr>
                  <td>Puntos del mes</td>
                  <td style={{ textAlign: "right" }}>{puntos(comparacion.puntosAntes)}</td>
                  <td style={{ textAlign: "right" }}>{puntos(comparacion.puntosAhora)}</td>
                  <td style={{ textAlign: "right" }}>{puntos(comparacion.puntosAhora - comparacion.puntosAntes)}</td>
                </tr>
                <tr>
                  <td>Tramo</td>
                  <td style={{ textAlign: "right" }}>{etiquetaTramo(comparacion.tramoAntes)}</td>
                  <td style={{ textAlign: "right" }}>{etiquetaTramo(comparacion.tramoAhora)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <table className="table-premium table-compact">
              <thead>
                <tr>
                  <th>Expediente</th>
                  <th style={{ textAlign: "right" }}>Puntos antes</th>
                  <th style={{ textAlign: "right" }}>Puntos ahora</th>
                  <th style={{ textAlign: "right" }}>Importe antes</th>
                  <th style={{ textAlign: "right" }}>Importe ahora</th>
                  <th style={{ textAlign: "right" }}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {comparacion.filas.map((f, i) => (
                  <tr key={i}>
                    <td>{f.idExpediente ? codigoExpediente(f.idExpediente) : "—"}</td>
                    <td style={{ textAlign: "right" }}>{puntos(f.puntosAntes)}</td>
                    <td style={{ textAlign: "right" }}>{puntos(f.puntosAhora)}</td>
                    <td style={{ textAlign: "right" }}>{euros(f.importeAntes)}</td>
                    <td style={{ textAlign: "right" }}>{euros(f.importeAhora)}</td>
                    <td style={{ textAlign: "right", color: f.diferencia === 0 ? undefined : "var(--warning)" }}>{eurosConSigno(f.diferencia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              <b>Las diferencias solo pueden explicarse por:</b>
              <ul style={{ margin: "6px 0 0", paddingLeft: "20px" }}>
                {comparacion.explicaciones.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              Cualquier otra diferencia es un fallo a investigar (del motor nuevo o del antiguo).
            </div>
          </div>
        </Modal>
      )}

      {detalle && (
        <Modal
          titulo={`Desglose de Liquidación · ${nombreMes(detalle.liquidacion.mes)} (${detalle.liquidacion.estado}, v${detalle.liquidacion.version})`}
          ancho="980px"
          pie={
            <button type="button" className="btn btn-secondary" onClick={() => setDetalle(null)}>
              Cerrar
            </button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxHeight: "calc(65 * var(--uvh))", overflowY: "auto" }}>
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
              <span>Puntos: <b>{puntos(detalle.liquidacion.puntosMes)}</b> / X = {puntos(detalle.liquidacion.objetivoX)}</span>
              <span>Tramo: <b>{etiquetaTramo(detalle.liquidacion.tramo)}</b></span>
              <span>Bruto: <b>{euros(detalle.liquidacion.bruto)}</b></span>
              <span>Penalización: <b>{euros(detalle.liquidacion.penalizacion)}</b></span>
              <span>Neto: <b>{euros(detalle.liquidacion.neto)}</b></span>
            </div>
            {detalle.liquidacion.tasaIntervencion.length > 0 && (
              <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                Tasa de intervención:{" "}
                {detalle.liquidacion.tasaIntervencion.map((t) => `${cat.marcas.find((m) => m.id === t.idMarca)?.nombre}: ${t.numerador}/${t.denominador}${t.porcentaje !== null ? ` (${t.porcentaje} %)` : ""} ${t.cumplida ? "✔ cumplida" : "✘ no cumplida"}`).join(" · ")}
              </div>
            )}
            {detalle.liquidacion.avisos.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: "20px", color: "var(--warning)" }}>
                {detalle.liquidacion.avisos.map((a, i) => (
                  <li key={i}>⚠️ {a}</li>
                ))}
              </ul>
            )}
            <table className="table-premium table-compact">
              <thead>
                <tr>
                  <th>Expediente</th>
                  <th>Concepto</th>
                  <th style={{ textAlign: "right" }}>Puntos</th>
                  <th style={{ textAlign: "right" }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {detalle.lineas.flatMap((l) =>
                  l.conceptos.map((c, k) => (
                    <tr key={c.idItem}>
                      <td>
                        {k === 0 && l.idExpediente ? (
                          <Link href={`/dashboard/expedientes/editar/${l.idExpediente}`} style={{ color: "var(--primary)" }}>
                            {codigoExpediente(l.idExpediente)} ({l.clase})
                          </Link>
                        ) : null}
                      </td>
                      <td>
                        {c.descripcion}
                        {c.aviso && <div style={{ color: "var(--warning)", fontSize: "0.8rem" }}>⚠️ {c.aviso}</div>}
                      </td>
                      <td style={{ textAlign: "right" }}>{c.puntos ? puntos(c.puntos) : ""}</td>
                      <td style={{ textAlign: "right" }}>{c.importe ? euros(c.importe) : ""}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
            {detalle.versiones.length > 0 && (
              <div>
                <h4 style={{ marginBottom: "8px" }}>Historial de versiones</h4>
                {detalle.versiones.map((v) => (
                  <div key={v.id} style={{ fontSize: "0.9rem" }}>
                    v{v.version} · {new Date(v.creadaEn).toLocaleString("es-ES")} · {v.motivo}: antes {euros(v.netoAnterior)} → ahora {euros(v.netoNuevo)} ({eurosConSigno(v.diferencia)})
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
