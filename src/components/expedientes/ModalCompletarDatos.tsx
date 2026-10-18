"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { leerListadoRenault, type FilaListadoRenault, type ListadoLeido } from "@/lib/listados-renault";
import type { FilaPrevisualizada, PropuestaCampo, Referencia, ResultadoPrevisualizar } from "@/lib/servicios/completar-datos";

type Filtro = "con_cambios" | "todas";

const CLAVE_BORRADOR = "completar-datos-borrador";
const REFS: { id: Referencia; texto: string; ayuda: string }[] = [
  { id: "bastidor", texto: "Bastidor", ayuda: "El número de bastidor (VIN): el dato más fiable" },
  { id: "matricula", texto: "Matrícula", ayuda: "La matrícula del vehículo" },
  { id: "nif", texto: "NIF/NIE", ayuda: "El documento del cliente" },
  { id: "nombre", texto: "Nombre del cliente", ayuda: "El nombre, por si no hay otro dato (puede haber dudas con clientes repetidos)" },
];

/** ¿Hay una importación a medias guardada en este navegador? (para ofrecer continuarla desde el Log de importaciones) */
export function hayBorradorCompletar(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_BORRADOR) !== null;
  } catch {
    return false;
  }
}

const claveCampo = (fila: number, campo: string) => `${fila}|${campo}`;
const formatear = (v: string | null) => (v ? (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : v) : "(vacío)");
const ETIQUETA_TIPO: Record<ListadoLeido["tipo"], string> = { expedientes: "Listado de expedientes", llamadas_calidad: "Llamadas de calidad", desconocido: "Listado" };

/**
 * «Completar datos desde listados»: sube los Excel/CSV del fabricante (Expedientes, Llamadas de calidad…), la app reconoce las
 * columnas, encuentra tus expedientes (por bastidor, matrícula, NIF o nombre) y propone rellenar huecos o corregir datos. Eliges
 * qué aplicar. Nunca crea expedientes, clientes ni modelos.
 */
export default function ModalCompletarDatos({ alCerrar, alAplicar }: { alCerrar: () => void; alAplicar: () => void }) {
  const { mostrar } = useToast();
  const [listados, setListados] = useState<ListadoLeido[]>([]);
  const [resultado, setResultado] = useState<ResultadoPrevisualizar | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [trabajando, setTrabajando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("con_cambios");
  const [hecho, setHecho] = useState<{ expedientesCambiados: number; camposCambiados: number; omitidos: string[] } | null>(null);
  const [referencias, setReferencias] = useState<Referencia[]>(["bastidor", "matricula", "nif", "nombre"]);

  /** Busca los expedientes de las filas con las referencias elegidas; si hay una selección guardada, la conserva. */
  const previsualizar = async (leidos: ListadoLeido[], refs: Referencia[], previos?: Set<string>) => {
    // Un mismo coche puede salir en varios listados (uno trae el teléfono, otro la matrícula): se juntan por bastidor
    const filas: FilaListadoRenault[] = unir(leidos.flatMap((l) => l.filas));
    const { data } = await llamar<ResultadoPrevisualizar>("/api/expedientes/completar/previsualizar", { method: "POST", cuerpo: { filas, referencias: refs } });
    setResultado(data);
    const marcados = new Set<string>();
    for (const f of data.filas) for (const p of f.propuestas) if (previos ? previos.has(claveCampo(f.fila, p.campo)) : p.tipo === "rellenar" || !p.aviso) marcados.add(claveCampo(f.fila, p.campo));
    setElegidos(marcados);
  };

  // Si se cerró la ventana a medias, la importación queda guardada y se retoma al volver a abrirla
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const guardado = window.localStorage.getItem(CLAVE_BORRADOR);
      if (!guardado) return;
      const b = JSON.parse(guardado) as { listados: ListadoLeido[]; referencias: Referencia[]; elegidos: string[] };
      if (!Array.isArray(b.listados) || b.listados.length === 0) return;
      setListados(b.listados);
      setReferencias(b.referencias.length > 0 ? b.referencias : ["bastidor"]);
      setTrabajando(true);
      previsualizar(b.listados, b.referencias, new Set(b.elegidos))
        .catch((err) => mostrar(textoError(err), "error"))
        .finally(() => setTrabajando(false));
      } catch {
        /* sin borrador */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (listados.length === 0 || hecho) return;
    try {
      window.localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ listados, referencias, elegidos: [...elegidos] }));
    } catch {
      /* el borrador es una comodidad: si no cabe, no pasa nada */
    }
  }, [listados, referencias, elegidos, hecho]);
  const descartar = () => {
    try {
      window.localStorage.removeItem(CLAVE_BORRADOR);
    } catch {
      /* nada */
    }
    setListados([]);
    setResultado(null);
    setElegidos(new Set());
  };
  const cambiarReferencia = (r: Referencia, activa: boolean) => {
    const nuevas = REFS.map((x) => x.id).filter((id) => (id === r ? activa : referencias.includes(id)));
    if (nuevas.length === 0) return;
    setReferencias(nuevas);
    if (listados.length === 0) return;
    setTrabajando(true);
    previsualizar(listados, nuevas)
      .catch((err) => mostrar(textoError(err), "error"))
      .finally(() => setTrabajando(false));
  };

  const leerArchivos = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (archivos.length === 0) return;
    setTrabajando(true);
    setHecho(null);
    try {
      const leidos: ListadoLeido[] = [];
      for (const a of archivos) {
        try {
          leidos.push(leerListadoRenault(await a.arrayBuffer(), a.name));
        } catch (err) {
          mostrar(textoError(err), "error");
        }
      }
      if (leidos.length === 0) return;
      setListados(leidos);
      await previsualizar(leidos, referencias);
    } catch (err) {
      mostrar(textoError(err), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const alternar = (k: string) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const alternarFila = (f: FilaPrevisualizada, marcar: boolean) =>
    setElegidos((s) => {
      const n = new Set(s);
      for (const p of f.propuestas) {
        const k = claveCampo(f.fila, p.campo);
        if (marcar) n.add(k);
        else n.delete(k);
      }
      return n;
    });

  const totalElegido = useMemo(() => elegidos.size, [elegidos]);
  const mostradas = useMemo(() => (resultado ? resultado.filas.filter((f) => (filtro === "todas" ? true : f.estado === "propuestas")) : []), [resultado, filtro]);

  const aplicar = async () => {
    if (!resultado) return;
    const cambios = resultado.filas
      .filter((f) => f.idExpediente !== null)
      .map((f) => ({ id_expediente: f.idExpediente as number, campos: f.propuestas.filter((p) => elegidos.has(claveCampo(f.fila, p.campo))).map((p) => ({ campo: p.campo, valor: p.nuevo })) }))
      .filter((c) => c.campos.length > 0);
    if (cambios.length === 0) {
      mostrar("No has marcado ningún cambio.", "error");
      return;
    }
    if (!window.confirm(`Se van a cambiar ${totalElegido} dato(s) en ${cambios.length} expediente(s). Quedará en el Log de importaciones y se podrá deshacer. ¿Continuar?`)) return;
    setTrabajando(true);
    try {
      const { data } = await llamar<{ expedientesCambiados: number; camposCambiados: number; omitidos: string[] }>("/api/expedientes/completar/aplicar", { method: "POST", cuerpo: { archivo: listados.map((l) => l.nombre).join(", ").slice(0, 250), cambios } });
      setHecho(data);
      try {
        window.localStorage.removeItem(CLAVE_BORRADOR);
      } catch {
        /* nada */
      }
      mostrar(`Datos completados en ${data.expedientesCambiados} expediente(s).`);
      alAplicar();
    } catch (err) {
      mostrar(textoError(err), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const insignia = (p: PropuestaCampo) => (
    <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 6px", borderRadius: "999px", background: p.tipo === "rellenar" ? "rgba(34, 197, 94, 0.18)" : "rgba(234, 179, 8, 0.22)", color: p.tipo === "rellenar" ? "var(--success)" : "var(--warning)" }}>
      {p.tipo === "rellenar" ? "RELLENAR" : "CORREGIR"}
    </span>
  );

  return (
    <Modal
      titulo="📥 Completar datos desde listados"
      ancho="1100px"
      pie={
        <>
          {listados.length > 0 && !hecho && (
            <button type="button" className="btn btn-secondary" onClick={descartar} disabled={trabajando} title="Olvida esta importación guardada">
              Descartar importación
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={trabajando} title={hecho ? "" : "Puedes cerrar y seguir luego: la importación queda guardada y la recuperas desde el Log de importaciones o desde este mismo botón"}>
            {hecho ? "Cerrar" : "Cerrar y seguir luego"}
          </button>
          {resultado && !hecho && (
            <button type="button" className="btn btn-primary" onClick={() => void aplicar()} disabled={trabajando || totalElegido === 0}>
              Aplicar {totalElegido} cambio(s) elegido(s)
            </button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "68vh", overflowY: "auto" }}>
        <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Sube uno o varios listados del fabricante (Expedientes, Llamadas de calidad pendientes o archivadas…; Excel o CSV). La app reconoce las columnas sola, busca tus expedientes y te propone rellenar lo que falta o corregir lo que no coincide. <b>No crea expedientes, ni clientes, ni modelos</b>, y el nombre del modelo del listado no se usa para cambiar nada. Antes de aplicar ves todo y eliges qué se cambia.
        </p>
        <label className="btn btn-primary" style={{ alignSelf: "flex-start", cursor: trabajando ? "wait" : "pointer" }}>
          {trabajando ? "Leyendo…" : listados.length > 0 ? "Elegir otros archivos" : "Elegir archivos (.xlsx, .xls, .csv)"}
          <input type="file" accept=".xlsx,.xls,.csv" multiple hidden disabled={trabajando} onChange={(e) => void leerArchivos(e)} />
        </label>

        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center", fontSize: "0.85rem" }}>
          <b>Localizar cada expediente por:</b>
          {REFS.map((r) => (
            <label key={r.id} style={{ display: "flex", gap: "5px", alignItems: "center" }} title={r.ayuda}>
              <input type="checkbox" checked={referencias.includes(r.id)} disabled={trabajando} onChange={(e) => cambiarReferencia(r.id, e.target.checked)} />
              {r.texto}
            </label>
          ))}
          <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>Se prueban en este orden; desmarca los que no quieras usar.</span>
        </div>

        {listados.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.82rem" }}>
            {listados.map((l) => (
              <div key={l.nombre}>
                📄 <b>{l.nombre}</b> · {ETIQUETA_TIPO[l.tipo]} · {l.filas.length} fila(s) · columnas que uso: {l.columnasUsadas.join(", ")}
              </div>
            ))}
          </div>
        )}

        {hecho && (
          <div role="status" style={{ padding: "12px 14px", borderLeft: "4px solid var(--success)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)" }}>
            ✅ Hecho: {hecho.camposCambiados} dato(s) cambiado(s) en {hecho.expedientesCambiados} expediente(s). Está en el <b>Log de importaciones</b>, donde puedes deshacerlo.
            {hecho.omitidos.length > 0 && (
              <ul style={{ margin: "6px 0 0", paddingLeft: "18px", fontSize: "0.82rem", color: "var(--warning)" }}>
                {hecho.omitidos.slice(0, 8).map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {resultado && !hecho && (
          <>
            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", fontSize: "0.85rem" }}>
              <span>
                Con cambios: <b>{resultado.resumen.conCambios}</b>
              </span>
              <span>Sin cambios: {resultado.resumen.sinCambios}</span>
              <span>Sin coincidencia: {resultado.resumen.sinCoincidencia}</span>
              <span>Dudosos: {resultado.resumen.ambiguos}</span>
              <span>Anulados: {resultado.resumen.anuladas}</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                <button type="button" className={filtro === "con_cambios" ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "3px 10px" }} onClick={() => setFiltro("con_cambios")}>
                  Solo con cambios
                </button>
                <button type="button" className={filtro === "todas" ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "3px 10px" }} onClick={() => setFiltro("todas")}>
                  Todas
                </button>
              </span>
            </div>
            {(resultado.sinFila?.length ?? 0) > 0 && (
              <details style={{ fontSize: "0.82rem" }}>
                <summary style={{ cursor: "pointer", color: "var(--warning)" }}>
                  {resultado.sinFila?.length} expediente(s) tuyos no aparecen en el listado (por eso no se rellenan): ver cuáles
                </summary>
                <div style={{ maxHeight: "140px", overflowY: "auto", marginTop: "6px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "6px 8px" }}>
                  {(resultado.sinFila ?? []).map((e) => (
                    <div key={e.id}>
                      <b>Exp. {e.id}</b> · {e.cliente ?? "Sin cliente"} · NIF {e.dni ?? "—"} · bastidor {e.vin ?? "—"} · matrícula {e.matricula ?? "—"}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "4px", color: "var(--text-muted)" }}>Si alguno debería estar, comprueba que el NIF, el bastidor o el nombre coinciden con los del listado.</div>
              </details>
            )}
            <div className="table-container">
              <table className="table-premium table-compact">
                <thead>
                  <tr>
                    <th style={{ width: "34px" }} />
                    <th>Listado</th>
                    <th>Expediente en la app</th>
                    <th>Qué se propone</th>
                  </tr>
                </thead>
                <tbody>
                  {mostradas.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                        No hay nada que mostrar con este filtro.
                      </td>
                    </tr>
                  )}
                  {mostradas.map((f) => {
                    const todas = f.propuestas.length > 0 && f.propuestas.every((p) => elegidos.has(claveCampo(f.fila, p.campo)));
                    return (
                      <tr key={f.fila} style={{ opacity: f.estado === "propuestas" ? 1 : 0.6 }}>
                        <td>{f.propuestas.length > 0 && <input type="checkbox" checked={todas} onChange={(e) => alternarFila(f, e.target.checked)} title="Marcar o desmarcar todos los cambios de este expediente" />}</td>
                        <td>
                          <b>{f.clienteListado || "—"}</b>
                          <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>{f.resumen}</div>
                        </td>
                        <td>
                          {f.idExpediente !== null ? (
                            <>
                              <b>Exp. {f.idExpediente}</b> · {f.clienteApp ?? "—"}
                              <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                                {f.vehiculoApp ?? "—"} · encontrado por {f.coincide}
                              </div>
                            </>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>
                        <td>
                          {f.propuestas.length === 0 ? (
                            <span style={{ fontSize: "0.82rem", color: f.estado === "ambiguo" ? "var(--warning)" : "var(--text-muted)" }}>{f.motivo ?? (f.estado === "sin_cambios" ? "Ya está todo igual" : "")}</span>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              {f.propuestas.map((p) => (
                                <label key={p.campo} style={{ display: "flex", gap: "6px", alignItems: "baseline", fontSize: "0.82rem", flexWrap: "wrap" }}>
                                  <input type="checkbox" checked={elegidos.has(claveCampo(f.fila, p.campo))} onChange={() => alternar(claveCampo(f.fila, p.campo))} />
                                  {insignia(p)}
                                  <b>{p.etiqueta}:</b>
                                  <span style={{ color: "var(--danger)", textDecoration: p.actual ? "line-through" : "none" }}>{formatear(p.actual)}</span>→<span style={{ color: "var(--success)", fontWeight: 700 }}>{formatear(p.nuevo)}</span>
                                  {p.aviso && <span style={{ color: "var(--warning)", fontSize: "0.74rem" }}>⚠ {p.aviso}</span>}
                                </label>
                              ))}
                              {f.motivo && <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>ℹ {f.motivo}</span>}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Une las filas de varios listados que son del mismo coche (mismo bastidor) para que cada una aporte lo que trae. */
function unir(filas: FilaListadoRenault[]): FilaListadoRenault[] {
  const porBastidor = new Map<string, FilaListadoRenault>();
  const sueltas: FilaListadoRenault[] = [];
  for (const f of filas) {
    if (!f.bastidor) {
      sueltas.push(f);
      continue;
    }
    const previa = porBastidor.get(f.bastidor);
    if (!previa) {
      porBastidor.set(f.bastidor, { ...f });
      continue;
    }
    for (const k of Object.keys(f) as (keyof FilaListadoRenault)[]) {
      const v = f[k];
      if (k === "fila") continue;
      if ((previa[k] === "" || previa[k] === null) && v !== "" && v !== null) (previa as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return [...porBastidor.values(), ...sueltas];
}
