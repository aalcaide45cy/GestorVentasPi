"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { InputCentesimas } from "@/components/comisiones/campos";
import { useCarga } from "@/components/comisiones/useCarga";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { euros, nombreMes } from "@/lib/formato";
import type { FilaRejillaGuardada, RejillaGuardada } from "@/lib/servicios/rejillas-visor";
import ResumenLiquidacion from "./ResumenLiquidacion";

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });

const colFilas: ColumnaTabla<FilaRejillaGuardada>[] = [
  { clave: "matricula", etiqueta: "Matrícula", valor: (f) => f.matricula, celda: (f) => <b>{f.matricula}</b> },
  { clave: "cliente", etiqueta: "Cliente", valor: (f) => f.cliente ?? "" },
  { clave: "financiacion", etiqueta: "Financiación", valor: (f) => f.financiacion ?? "" },
  { clave: "concepto", etiqueta: "Concepto", valor: (f) => f.concepto ?? "" },
  { clave: "importe", etiqueta: "Importe", valor: (f) => f.importe ?? -1, celda: (f) => (f.importe === null ? <span style={{ color: "var(--text-muted)" }}>sin importe</span> : euros(f.importe)), alinear: "right" },
  { clave: "confianza", etiqueta: "Confianza OCR", valor: (f) => f.confianza ?? -1, celda: (f) => (f.confianza === null ? "—" : `${f.confianza} %`), alinear: "right", oculta: true },
  { clave: "original", etiqueta: "Línea original", valor: (f) => f.textoOriginal ?? "", oculta: true },
];

/** «Mis rejillas»: todas las rejillas guardadas, por mes, para revisarlas cuando haga falta (ver, buscar, ordenar, cambiar el mes o borrar). */
export default function MisRejillas({ esAdministrador }: { esAdministrador: boolean }) {
  const { mostrar, confirmar } = useToast();
  const { datos, recargar } = useCarga<RejillaGuardada[]>("/api/comisiones/rejillas/lista", []);
  const [viendo, setViendo] = useState<RejillaGuardada | null>(null);
  const [filas, setFilas] = useState<FilaRejillaGuardada[] | null>(null);
  const [editando, setEditando] = useState<{ r: RejillaGuardada; mes: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Corregir lo leído: las filas se pueden editar, añadir y quitar aunque la rejilla ya estuviera confirmada
  const [edicion, setEdicion] = useState<FilaRejillaGuardada[] | null>(null);
  const cambiarFila = (i: number, c: Partial<FilaRejillaGuardada>) => setEdicion((e) => (e ? e.map((f, j) => (j === i ? { ...f, ...c } : f)) : e));
  const guardarCorrecciones = async () => {
    if (!viendo || !edicion) return;
    const validas = edicion.filter((f) => f.matricula.trim());
    if (validas.length === 0) {
      mostrar("La rejilla no puede quedarse sin filas con matrícula. Si quieres quitarla entera, usa «Borrar».", "error");
      return;
    }
    setOcupado(true);
    try {
      await llamar(`/api/comisiones/rejillas?usuario=${viendo.idUsuario}`, {
        method: "PUT",
        cuerpo: {
          mes: viendo.mes,
          origen: viendo.origen,
          nombreArchivo: viendo.nombreArchivo,
          totalHoja: viendo.totalHoja,
          notas: viendo.notas,
          filas: validas.map((f) => ({ matricula: f.matricula.trim(), cliente: f.cliente, financiacion: f.financiacion, concepto: f.concepto, importe: f.importe, textoOriginal: f.textoOriginal, confianza: f.confianza })),
        },
      });
      mostrar("Correcciones guardadas.");
      setFilas(validas);
      setEdicion(null);
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  const abrir = async (r: RejillaGuardada) => {
    setViendo(r);
    setFilas(null);
    try {
      const { data } = await llamar<{ rejilla: RejillaGuardada; filas: FilaRejillaGuardada[] }>(`/api/comisiones/rejillas/detalle?id=${r.id}`);
      setFilas(data.filas);
    } catch (e) {
      mostrar(textoError(e), "error");
      setViendo(null);
    }
  };

  const guardarMes = async () => {
    if (!editando) return;
    setOcupado(true);
    try {
      await llamar("/api/comisiones/rejillas/detalle", { method: "PATCH", cuerpo: { id: editando.r.id, mes: editando.mes } });
      mostrar(`Rejilla movida a ${nombreMes(editando.mes)}.`);
      setEditando(null);
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async (r: RejillaGuardada) => {
    if (!await confirmar({ texto: `¿Borrar la rejilla de ${r.vendedor} de ${nombreMes(r.mes)}? Se pierden sus ${r.filas} filas. Siempre puedes volver a subir el archivo.`, peligro: true })) return;
    try {
      await llamar(`/api/comisiones/rejillas?usuario=${r.idUsuario}&mes=${r.mes}`, { method: "DELETE" });
      mostrar("Rejilla borrada.");
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  const columnas: ColumnaTabla<RejillaGuardada>[] = [
    { clave: "mes", etiqueta: "Mes", valor: (r) => r.mes, celda: (r) => <b>{nombreMes(r.mes)}</b> },
    { clave: "vendedor", etiqueta: "Vendedor", valor: (r) => r.vendedor, oculta: !esAdministrador },
    { clave: "origen", etiqueta: "Origen", valor: (r) => r.origen, ayuda: "Cómo entró: excel, csv, pdf, imagen o manual" },
    { clave: "archivo", etiqueta: "Archivo", valor: (r) => r.nombreArchivo ?? "" },
    { clave: "filas", etiqueta: "Filas", valor: (r) => r.filas, alinear: "right" },
    { clave: "total", etiqueta: "Total de la hoja", valor: (r) => r.totalHoja ?? -1, celda: (r) => (r.totalHoja === null ? "—" : euros(r.totalHoja)), alinear: "right" },
    { clave: "guardada", etiqueta: "Guardada", valor: (r) => r.creadaEn, celda: (r) => fechaHora(r.creadaEn) },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      valor: () => "",
      celda: (r) => (
        <span style={{ display: "inline-flex", gap: "6px" }}>
          <button type="button" className="btn btn-primary" style={{ padding: "3px 10px", fontSize: "0.78rem" }} onClick={() => void abrir(r)} title="Ver las filas de esta rejilla y tu liquidación de ese mes">
            Ver
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.78rem" }} onClick={() => setEditando({ r, mes: r.mes })} title="Cambiar el mes al que pertenece">
            Cambiar mes
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.78rem", color: "var(--danger)" }} onClick={() => void borrar(r)}>
            Borrar
          </button>
        </span>
      ),
    },
  ];

  return (
    <section className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div>
        <h3 style={{ margin: 0 }}>📁 Mis rejillas guardadas</h3>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          Cada rejilla que guardas queda aquí con el mes al que pertenece. Pulsa «Ver» para recorrer sus filas (con buscador y orden) junto a tu liquidación de ese mes, o «Cambiar mes» si la guardaste en el mes equivocado. Una rejilla nueva del mismo mes sustituye a la anterior.
        </p>
      </div>
      <TablaDatos<RejillaGuardada> id="rejillas-guardadas" columnas={columnas} filas={datos} clave={(r) => r.id} placeholder="Buscar por mes, vendedor, archivo…" vacio="Todavía no has guardado ninguna rejilla." />

      {editando && (
        <Modal
          titulo="Cambiar el mes de la rejilla"
          ancho="440px"
          pie={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditando(null)} disabled={ocupado}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void guardarMes()} disabled={ocupado || !/^\d{4}-\d{2}$/.test(editando.mes)}>
                Guardar
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            Rejilla de <b>{editando.r.vendedor}</b> ({editando.r.nombreArchivo ?? editando.r.origen}), ahora en {nombreMes(editando.r.mes)}.
          </p>
          <label className="form-label">Mes al que pertenece</label>
          <input type="month" className="form-input" value={editando.mes} onChange={(e) => setEditando({ ...editando, mes: e.target.value })} />
        </Modal>
      )}

      {viendo && (
        <Modal titulo={`Rejilla de ${viendo.vendedor}: ${nombreMes(viendo.mes)}`} ancho="1200px" pie={<button type="button" className="btn btn-secondary" onClick={() => { setViendo(null); setEdicion(null); }}>Cerrar</button>}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxHeight: "70vh", overflowY: "auto" }}>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              {viendo.nombreArchivo ?? viendo.origen} · {viendo.filas} filas · guardada el {fechaHora(viendo.creadaEn)}
              {viendo.totalHoja !== null ? ` · total de la hoja ${euros(viendo.totalHoja)}` : ""}
            </p>
            {filas !== null && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {edicion === null ? (
                  <button type="button" className="btn btn-secondary" onClick={() => setEdicion(filas.map((f) => ({ ...f })))} title="Cambiar matrículas, importes o clientes mal leídos, aunque la rejilla ya esté confirmada">
                    ✏️ Corregir lecturas
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn btn-primary" onClick={() => void guardarCorrecciones()} disabled={ocupado}>
                      Guardar correcciones
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setEdicion(null)} disabled={ocupado}>
                      Descartar cambios
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setEdicion((e) => (e ? [...e, { id: -Date.now(), matricula: "", cliente: null, financiacion: null, concepto: null, importe: null, textoOriginal: null, confianza: null }] : e))}>
                      + Añadir fila
                    </button>
                  </>
                )}
              </div>
            )}
            {filas === null ? (
              <p>Cargando filas…</p>
            ) : edicion !== null ? (
              <div className="table-container">
                <table className="table-premium table-compact">
                  <thead>
                    <tr>
                      <th>Matrícula</th>
                      <th>Cliente</th>
                      <th>Financiación</th>
                      <th>Concepto</th>
                      <th>Importe</th>
                      <th>Línea original</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {edicion.map((f, i) => (
                      <tr key={f.id}>
                        <td>
                          <input className="form-input" style={{ width: "120px", fontWeight: 700 }} value={f.matricula} onChange={(e) => cambiarFila(i, { matricula: e.target.value.toUpperCase() })} />
                        </td>
                        <td>
                          <input className="form-input" value={f.cliente ?? ""} onChange={(e) => cambiarFila(i, { cliente: e.target.value || null })} />
                        </td>
                        <td>
                          <input className="form-input" value={f.financiacion ?? ""} onChange={(e) => cambiarFila(i, { financiacion: e.target.value || null })} />
                        </td>
                        <td>
                          <input className="form-input" value={f.concepto ?? ""} onChange={(e) => cambiarFila(i, { concepto: e.target.value || null })} />
                        </td>
                        <td>
                          <InputCentesimas valor={f.importe ?? 0} vacioEsNulo onChange={(v) => cambiarFila(i, { importe: v })} sufijo="€" />
                        </td>
                        <td style={{ fontSize: "0.8rem", color: "var(--text-muted)", maxWidth: "260px" }}>{f.textoOriginal}</td>
                        <td>
                          <button type="button" className="btn btn-secondary" style={{ color: "var(--danger)", padding: "3px 8px" }} onClick={() => setEdicion((e) => (e ? e.filter((_, j) => j !== i) : e))} title="Quitar esta fila">
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <TablaDatos<FilaRejillaGuardada>
                id="rejilla-filas"
                columnas={colFilas}
                filas={filas}
                clave={(f) => f.id}
                placeholder="Buscar por matrícula, cliente, concepto…"
                vacio="Esta rejilla no tiene filas."
                pie={(fs) => ({ matricula: `${fs.length} fila${fs.length === 1 ? "" : "s"}`, importe: euros(fs.reduce((t, f) => t + (f.importe ?? 0), 0)) })}
              />
            )}
            <ResumenLiquidacion usuario={viendo.idUsuario} mes={viendo.mes} />
          </div>
        </Modal>
      )}
    </section>
  );
}
