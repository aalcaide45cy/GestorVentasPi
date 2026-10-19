"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import VisorPedido from "@/components/documentos/VisorPedido";
import { euros, fechaCorta } from "@/lib/pagos-rci-cliente";
import type { CandidatoPago, EstadoPago, PagoRciDto } from "@/lib/servicios/pagos-rci";

type Filtro = EstadoPago | "todos";
type Columna = "archivo" | "operacion" | "adquiriente" | "vehiculo" | "importe" | "expediente";

const CLAVE_COLUMNAS = "pagos-rci-columnas";
const FILTROS: { id: Filtro; texto: string; ayuda: string }[] = [
  { id: "pendiente", texto: "Pendientes", ayuda: "Pagos que no se han podido asociar solos: elige el expediente a mano o ignóralos" },
  { id: "aplicado", texto: "Aplicados", ayuda: "Pagos que ya han fijado la fecha RCI de su expediente (se pueden deshacer)" },
  { id: "ignorado", texto: "Ignorados", ayuda: "Documentos que no eran un pago de la financiera o que se han descartado: revísalos por si alguno sí lo era" },
  { id: "todos", texto: "Todos", ayuda: "Todos los documentos subidos" },
];
const COLUMNAS: { id: Columna; texto: string; ayuda: string }[] = [
  { id: "archivo", texto: "Archivo", ayuda: "Nombre del fichero subido" },
  { id: "operacion", texto: "Operación y fecha", ayuda: "Número de operación de la financiera y fecha de pago" },
  { id: "adquiriente", texto: "Adquiriente", ayuda: "Nombre y documento del adquiriente que trae el pago" },
  { id: "vehiculo", texto: "Vehículo", ayuda: "Marca, modelo, bastidor y matrícula del pago" },
  { id: "importe", texto: "Importes", ayuda: "Importe nominal del préstamo y total líquido al vendedor" },
  { id: "expediente", texto: "Expediente", ayuda: "Expediente de la app al que se ha aplicado el pago" },
];
const COLOR: Record<EstadoPago, string> = { aplicado: "var(--success)", pendiente: "var(--warning)", ignorado: "var(--text-muted)" };
const TEXTO_ESTADO: Record<EstadoPago, string> = { aplicado: "Aplicado", pendiente: "Pendiente", ignorado: "Ignorado" };

const textoPago = (p: PagoRciDto) => [p.nombreArchivo, p.numeroOperacion, p.nombre, p.nif, p.bastidor, p.matricula, p.marca, p.modelo, p.clienteExpediente, p.idExpediente !== null ? `exp ${p.idExpediente}` : "", p.motivo].join(" ").toLowerCase();

/**
 * Pagos de la financiera subidos: lo aplicado, lo pendiente de decidir y lo ignorado, con filtros, búsqueda y columnas elegibles.
 * Cada fila se abre para ver el PDF, corregir lo mal leído y elegir a mano el expediente.
 */
export default function PanelPagosRci({ alCerrar, alCambiar }: { alCerrar: () => void; alCambiar?: () => void }) {
  const { mostrar } = useToast();
  const [pagos, setPagos] = useState<PagoRciDto[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("pendiente");
  const [busqueda, setBusqueda] = useState("");
  const [columnas, setColumnas] = useState<Set<Columna>>(new Set(["archivo", "operacion", "adquiriente", "vehiculo", "importe", "expediente"]));
  const [detalle, setDetalle] = useState<number | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data } = await llamar<PagoRciDto[]>("/api/pagos-rci");
      setPagos(data);
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  }, [mostrar]);
  useEffect(() => {
    void Promise.resolve().then(cargar);
    void Promise.resolve().then(() => {
      try {
        const c = JSON.parse(window.localStorage.getItem(CLAVE_COLUMNAS) ?? "null") as Columna[] | null;
        if (Array.isArray(c) && c.length > 0) setColumnas(new Set(c));
      } catch {
        /* columnas por defecto */
      }
    });
  }, [cargar]);

  const cambiarColumna = (c: Columna, visible: boolean) =>
    setColumnas((s) => {
      const n = new Set(s);
      if (visible) n.add(c);
      else if (n.size > 1) n.delete(c);
      try {
        window.localStorage.setItem(CLAVE_COLUMNAS, JSON.stringify([...n]));
      } catch {
        /* nada */
      }
      return n;
    });

  /** Hace una acción sobre un pago y actualiza la lista con lo que devuelve el servidor. */
  const accion = async (cuerpo: Record<string, unknown>, aviso?: string) => {
    setTrabajando(true);
    try {
      const { data } = await llamar<PagoRciDto>("/api/pagos-rci/accion", { method: "POST", cuerpo });
      setPagos((lista) => (lista ?? []).map((p) => (p.id === data.id ? data : p)));
      if (aviso) mostrar(aviso);
      alCambiar?.();
      return data;
    } catch (e) {
      mostrar(textoError(e), "error");
      return null;
    } finally {
      setTrabajando(false);
    }
  };

  const reintentar = async () => {
    setTrabajando(true);
    try {
      const { data } = await llamar<{ revisados: number; enlazados: number }>("/api/pagos-rci/accion", { method: "POST", cuerpo: { accion: "reintentar" } });
      mostrar(data.enlazados > 0 ? `${data.enlazados} pago(s) enlazado(s) con su expediente.` : `Revisados ${data.revisados} pago(s) pendientes: ninguno encaja todavía.`);
      await cargar();
      alCambiar?.();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const cuentas = useMemo(() => {
    const c: Record<Filtro, number> = { pendiente: 0, aplicado: 0, ignorado: 0, todos: 0 };
    for (const p of pagos ?? []) {
      c.todos++;
      c[p.estado]++;
    }
    return c;
  }, [pagos]);
  const mostrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (pagos ?? []).filter((p) => (filtro === "todos" || p.estado === filtro) && (q === "" || textoPago(p).includes(q)));
  }, [pagos, filtro, busqueda]);
  const ver = (c: Columna) => columnas.has(c);
  const abierto = detalle !== null ? (pagos?.find((p) => p.id === detalle) ?? null) : null;

  return (
    <>
      <Modal
        titulo="💳 Pagos de la financiera (RCI)"
        ancho="1280px"
        pie={
          <button type="button" className="btn btn-secondary" onClick={alCerrar}>
            Cerrar
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "72vh", overflowY: "auto" }}>
          <p style={{ margin: 0, fontSize: "0.86rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            La <b>fecha de pago</b> de cada documento de la financiera es la fecha RCI (contratación) del expediente. Si el pago se asocia solo (por bastidor, matrícula o documento del adquiriente) la fecha se fija directamente; si hay dudas o no hay expediente, queda <b>pendiente</b> para que decidas. Nunca se crea un expediente desde aquí.
          </p>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            {FILTROS.map((f) => (
              <button key={f.id} type="button" title={f.ayuda} className={filtro === f.id ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "3px 10px", fontSize: "0.82rem" }} onClick={() => setFiltro(f.id)}>
                {f.texto} ({cuentas[f.id]})
              </button>
            ))}
            <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.82rem" }} disabled={trabajando || cuentas.pendiente === 0} onClick={() => void reintentar()} title="Vuelve a buscar el expediente de los pagos pendientes: útil después de completar datos con un listado (el expediente ya tiene bastidor o documento nuevo)">
              ↻ Reintentar pendientes
            </button>
            <input className="input-premium" type="search" placeholder="Buscar por cliente, documento, bastidor, matrícula, operación…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ flex: "1 1 260px", minWidth: "220px", marginLeft: "auto" }} title="Filtra los pagos por cualquier dato" />
            <details style={{ fontSize: "0.82rem" }}>
              <summary style={{ cursor: "pointer" }} title="Elige qué columnas ver en la tabla">
                Columnas
              </summary>
              <div style={{ position: "absolute", zIndex: 5, background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {COLUMNAS.map((c) => (
                  <label key={c.id} style={{ display: "flex", gap: "6px", alignItems: "center" }} title={c.ayuda}>
                    <input type="checkbox" checked={columnas.has(c.id)} onChange={(e) => cambiarColumna(c.id, e.target.checked)} />
                    {c.texto}
                  </label>
                ))}
              </div>
            </details>
          </div>
          <div className="table-container">
            <table className="table-premium table-compact">
              <thead>
                <tr>
                  <th title="Estado del pago: aplicado, pendiente o ignorado">Estado</th>
                  {ver("archivo") && <th title="Nombre del fichero subido">Archivo</th>}
                  {ver("operacion") && <th title="Número de operación y fecha de pago (= fecha RCI)">Operación / fecha de pago</th>}
                  {ver("adquiriente") && <th title="Nombre y documento del adquiriente que trae el pago">Adquiriente</th>}
                  {ver("vehiculo") && <th title="Vehículo del pago">Vehículo</th>}
                  {ver("importe") && <th title="Importe nominal del préstamo y total líquido al vendedor">Importes</th>}
                  {ver("expediente") && <th title="Expediente de la app al que se ha aplicado el pago">Expediente</th>}
                  <th style={{ width: "150px" }} title="Abrir el pago para ver el PDF, corregir datos y elegir el expediente">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagos === null && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                      Cargando…
                    </td>
                  </tr>
                )}
                {pagos !== null && mostrados.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                      No hay nada que mostrar con este filtro.
                    </td>
                  </tr>
                )}
                {mostrados.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b style={{ color: COLOR[p.estado], fontSize: "0.8rem" }}>{TEXTO_ESTADO[p.estado]}</b>
                      {p.motivo && <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", maxWidth: "260px" }}>{p.motivo}</div>}
                    </td>
                    {ver("archivo") && (
                      <td style={{ fontSize: "0.8rem" }} title={p.nombreArchivo}>
                        {p.nombreArchivo}
                      </td>
                    )}
                    {ver("operacion") && (
                      <td style={{ fontSize: "0.8rem" }}>
                        <div>{p.numeroOperacion ?? "—"}</div>
                        <div style={{ fontWeight: 700 }}>{fechaCorta(p.fechaPago)}</div>
                      </td>
                    )}
                    {ver("adquiriente") && (
                      <td style={{ fontSize: "0.8rem" }}>
                        <div>{p.nombre ?? "—"}</div>
                        <div style={{ color: "var(--text-muted)" }}>{p.nif ?? "—"}</div>
                      </td>
                    )}
                    {ver("vehiculo") && (
                      <td style={{ fontSize: "0.78rem" }}>
                        <div>{[p.marca, p.modelo].filter(Boolean).join(" ") || "—"}</div>
                        <div style={{ color: "var(--text-muted)" }}>{[p.bastidor, p.matricula].filter(Boolean).join(" · ") || "—"}</div>
                      </td>
                    )}
                    {ver("importe") && (
                      <td style={{ fontSize: "0.78rem" }}>
                        <div>{euros(p.importeNominalCent)}</div>
                        <div style={{ color: "var(--text-muted)" }}>líquido {euros(p.totalLiquidoCent)}</div>
                      </td>
                    )}
                    {ver("expediente") && <td style={{ fontSize: "0.8rem" }}>{p.idExpediente !== null ? `Exp. ${p.idExpediente} · ${p.clienteExpediente ?? "—"}` : "—"}</td>}
                    <td>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.78rem" }} onClick={() => setDetalle(p.id)} title="Ver el PDF, corregir datos y elegir el expediente">
                          🔍 Abrir
                        </button>
                        {p.estado === "aplicado" && (
                          <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.78rem" }} disabled={trabajando} onClick={() => void accion({ accion: "deshacer", id: p.id }, "Aplicación deshecha.")} title="Devuelve la fecha RCI del expediente a la que tenía antes">
                            ↩ Deshacer
                          </button>
                        )}
                        {p.estado === "pendiente" && (
                          <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.78rem" }} disabled={trabajando} onClick={() => void accion({ accion: "ignorar", id: p.id }, "Pago ignorado.")} title="Descarta este pago sin tocar ningún expediente">
                            Ignorar
                          </button>
                        )}
                        {p.estado === "ignorado" && (
                          <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.78rem" }} disabled={trabajando} onClick={() => void accion({ accion: "recuperar", id: p.id }, "Pago recuperado: vuelve a estar pendiente.")} title="Vuelve a ponerlo pendiente para decidir qué hacer">
                            Recuperar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
      {abierto && <DetallePago pago={abierto} trabajando={trabajando} alCerrar={() => setDetalle(null)} accion={accion} />}
    </>
  );
}

/** Un pago abierto: el PDF a un lado y, al otro, lo leído (editable), los expedientes posibles y el buscador para elegir a mano. */
function DetallePago({ pago, trabajando, alCerrar, accion }: { pago: PagoRciDto; trabajando: boolean; alCerrar: () => void; accion: (cuerpo: Record<string, unknown>, aviso?: string) => Promise<PagoRciDto | null> }) {
  const { mostrar } = useToast();
  const [fecha, setFecha] = useState(pago.fechaPago ?? "");
  const [nif, setNif] = useState(pago.nif ?? "");
  const [bastidor, setBastidor] = useState(pago.bastidor ?? "");
  const [matricula, setMatricula] = useState(pago.matricula ?? "");
  const [candidatos, setCandidatos] = useState<CandidatoPago[]>([]);
  const [motivoBusqueda, setMotivoBusqueda] = useState("");
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<{ id_expediente: number; label: string }[]>([]);
  const editable = pago.estado !== "aplicado";

  const cargarCandidatos = useCallback(async () => {
    if (pago.estado === "aplicado") return;
    try {
      const { data } = await llamar<{ candidatos: CandidatoPago[]; motivo: string }>("/api/pagos-rci/accion", { method: "POST", cuerpo: { accion: "candidatos", id: pago.id } });
      setCandidatos(data.candidatos);
      setMotivoBusqueda(data.motivo);
    } catch {
      setCandidatos([]);
    }
  }, [pago.id, pago.estado]);
  useEffect(() => {
    void Promise.resolve().then(cargarCandidatos);
  }, [cargarCandidatos]);

  const guardar = async () => {
    const r = await accion({ accion: "editar", datos: { id: pago.id, fechaPago: fecha || null, nif, bastidor, matricula } }, "Datos del pago corregidos.");
    if (r) void cargarCandidatos();
  };
  const buscar = async () => {
    if (texto.trim().length < 2) return;
    try {
      const r = await fetch(`/api/buscar?q=${encodeURIComponent(texto.trim())}`, { credentials: "same-origin", cache: "no-store" });
      const j = (await r.json()) as { expedientes?: { id_expediente: number; label: string }[] };
      setResultados(j.expedientes ?? []);
    } catch {
      setResultados([]);
    }
  };
  const aplicar = async (idExpediente: number) => {
    if (!fecha) {
      mostrar("Indica la fecha de pago antes de aplicar.", "error");
      return;
    }
    await accion({ accion: "aplicar", datos: { id: pago.id, idExpediente, fechaPago: fecha } }, `Fecha RCI fijada en el expediente ${idExpediente}.`);
  };

  const campo = (titulo: string, valor: string, fijar: (v: string) => void, tipo = "text", ayuda = "") => (
    <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.82rem" }} title={ayuda}>
      <span style={{ minWidth: "110px", color: "var(--text-muted)" }}>{titulo}</span>
      <input className="input-premium" type={tipo} value={valor} onChange={(e) => fijar(e.target.value)} disabled={!editable} style={{ flex: 1 }} />
    </label>
  );

  return (
    <Modal
      titulo={`🔍 ${pago.nombre ?? pago.nombreArchivo}`}
      ancho="1240px"
      pie={
        <button type="button" className="btn btn-primary" onClick={alCerrar}>
          Listo
        </button>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "16px", maxHeight: "72vh" }}>
        <div style={{ minHeight: "300px", overflow: "hidden", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)" }}>
          {pago.idAdjunto !== null ? <VisorPedido key={pago.idAdjunto} idAdjunto={pago.idAdjunto} nombre={pago.nombreArchivo} /> : <div style={{ padding: "16px", color: "var(--text-muted)" }}>El archivo ya no está guardado.</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto" }}>
          <div style={{ fontSize: "0.84rem" }}>
            <b style={{ color: COLOR[pago.estado] }}>{TEXTO_ESTADO[pago.estado]}</b>
            {pago.motivo && <span style={{ color: "var(--text-muted)" }}> · {pago.motivo}</span>}
          </div>
          {pago.estado !== "ignorado" || pago.numeroOperacion ? (
            <section style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <h4 style={{ margin: 0 }}>Lo que trae el pago</h4>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Operación {pago.numeroOperacion ?? "—"} · {[pago.marca, pago.modelo].filter(Boolean).join(" ") || "—"} · importe {euros(pago.importeNominalCent)}
              </div>
              {campo("Fecha de pago", fecha, setFecha, "date", "Es también la fecha RCI (contratación). Corrígela si se leyó mal")}
              {campo("Documento", nif, setNif, "text", "NIF/DNI/CIF del adquiriente (no el de la persona que representa a la financiera)")}
              {campo("Bastidor", bastidor, setBastidor)}
              {campo("Matrícula", matricula, setMatricula, "text", "Solo la traen los usados")}
              {editable && (
                <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start", padding: "3px 10px" }} disabled={trabajando} onClick={() => void guardar()} title="Guarda lo corregido y vuelve a buscar los expedientes posibles">
                  Guardar correcciones y volver a buscar
                </button>
              )}
            </section>
          ) : (
            <span style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>Este documento no se ha reconocido como un pago de la financiera. Si lo es, mira el PDF: puede estar escaneado con poca calidad.</span>
          )}
          {pago.estado === "aplicado" && (
            <section style={{ fontSize: "0.84rem" }}>
              Aplicado al <b>expediente {pago.idExpediente}</b> ({pago.clienteExpediente ?? "—"}): la fecha RCI es {fechaCorta(pago.fechaPago)}
              {pago.fechaRciAnterior ? ` (antes ${fechaCorta(pago.fechaRciAnterior)})` : ""}.
              <div>
                <button type="button" className="btn btn-secondary" style={{ marginTop: "6px", padding: "3px 10px" }} disabled={trabajando} onClick={() => void accion({ accion: "deshacer", id: pago.id }, "Aplicación deshecha.")}>
                  ↩ Deshacer la aplicación
                </button>
              </div>
            </section>
          )}
          {editable && (
            <section style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <h4 style={{ margin: 0 }}>A qué expediente va</h4>
              {motivoBusqueda && <span style={{ fontSize: "0.8rem", color: "var(--warning)" }}>ℹ {motivoBusqueda}</span>}
              {candidatos.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "4px 8px" }}>
                  <span style={{ flex: 1 }}>
                    <b>Exp. {c.id}</b> · {c.cliente ?? "—"} · {c.dni ?? "sin documento"} · {c.vehiculo ?? "—"} · {c.vin ?? c.matricula ?? "sin bastidor"}
                    <div style={{ color: "var(--text-muted)" }}>
                      {c.motivo}
                      {c.fechaRci ? ` · ya tiene fecha RCI ${fechaCorta(c.fechaRci)}` : ""}
                    </div>
                  </span>
                  <button type="button" className="btn btn-primary" style={{ padding: "2px 8px" }} disabled={trabajando} onClick={() => void aplicar(c.id)} title="Fija la fecha RCI de este expediente con la fecha de pago">
                    Aplicar aquí
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  className="input-premium"
                  placeholder="Buscar otro expediente (nombre, DNI, bastidor, matrícula)"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void buscar();
                    }
                  }}
                  style={{ flex: 1 }}
                  title="Busca un expediente de la app para aplicarle este pago"
                />
                <button type="button" className="btn btn-secondary" disabled={texto.trim().length < 2} onClick={() => void buscar()}>
                  Buscar
                </button>
              </div>
              {resultados.map((r) => (
                <div key={r.id_expediente} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem" }}>
                  <span style={{ flex: 1 }}>{r.label}</span>
                  <button type="button" className="btn btn-primary" style={{ padding: "2px 8px" }} disabled={trabajando} onClick={() => void aplicar(r.id_expediente)}>
                    Aplicar aquí
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                {pago.estado === "pendiente" ? (
                  <button type="button" className="btn btn-secondary" disabled={trabajando} onClick={() => void accion({ accion: "ignorar", id: pago.id }, "Pago ignorado.")} title="Descarta este pago sin tocar ningún expediente">
                    Ignorar este pago
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary" disabled={trabajando} onClick={() => void accion({ accion: "recuperar", id: pago.id }, "Pago recuperado: vuelve a estar pendiente.")} title="Vuelve a ponerlo pendiente para decidir qué hacer">
                    Recuperar como pendiente
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
}
