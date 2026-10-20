"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import VisorPedido from "@/components/documentos/VisorPedido";
import { leerListadoRenault, type FilaListadoRenault, type ListadoLeido } from "@/lib/listados-renault";
import type { FilaPrevisualizada, PropuestaCampo, Referencia, ResultadoPrevisualizar } from "@/lib/servicios/completar-datos";

type Filtro = "con_cambios" | "sin_cambios" | "sin_coincidencia" | "ambiguo" | "anulado" | "archivado" | "todas";
type Columna = "estadoListado" | "documentos" | "expediente" | "propuestas";

const CLAVE_BORRADOR = "completar-datos-borrador";
const CLAVE_COLUMNAS = "completar-datos-columnas";
const REFS: { id: Referencia; texto: string; ayuda: string }[] = [
  { id: "bastidor", texto: "Bastidor", ayuda: "El número de bastidor (VIN): el dato más fiable" },
  { id: "matricula", texto: "Matrícula", ayuda: "La matrícula del vehículo (sin la fecha entre paréntesis ni la E inicial)" },
  { id: "nif", texto: "NIF/DNI/CIF", ayuda: "El documento del cliente; se compara sin ceros a la izquierda y se sugieren los muy parecidos" },
  { id: "email", texto: "Correo", ayuda: "El correo del cliente: sirve para decidir entre varios pedidos del mismo cliente" },
  { id: "nombre", texto: "Nombre del cliente", ayuda: "El nombre, por si no hay otro dato (puede haber dudas con clientes repetidos)" },
];
const COLUMNAS: { id: Columna; texto: string; ayuda: string }[] = [
  { id: "estadoListado", texto: "Estado del listado", ayuda: "El estado que trae el Excel (Archivado, Anulado, Matriculación…)" },
  { id: "documentos", texto: "Documento y bastidor", ayuda: "El NIF, el bastidor y la matrícula que trae el listado" },
  { id: "expediente", texto: "Expediente en la app", ayuda: "A qué expediente de la app se asocia cada fila" },
  { id: "propuestas", texto: "Qué se propone", ayuda: "Los datos que se rellenarían o corregirían" },
];
const FILTROS: { id: Filtro; texto: string; ayuda: string }[] = [
  { id: "con_cambios", texto: "Con cambios", ayuda: "Filas con datos que rellenar o corregir" },
  { id: "sin_cambios", texto: "Sin cambios", ayuda: "El expediente ya está igual que el listado" },
  { id: "sin_coincidencia", texto: "Sin expediente", ayuda: "No se encontró ningún expediente (no se crea nada): puedes asociarlo a mano" },
  { id: "ambiguo", texto: "Dudosos", ayuda: "Varios expedientes posibles: elige cuál a mano" },
  { id: "anulado", texto: "Anulados", ayuda: "Anulados en el listado: revísalos uno a uno" },
  { id: "archivado", texto: "Archivados", ayuda: "Archivados en el listado (ya matriculados, entregados y con la llamada de calidad hecha)" },
  { id: "todas", texto: "Todas", ayuda: "Todas las filas de los listados" },
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
const esCampoFecha = (campo: string) => campo.startsWith("fecha_");
const aIso = (v: string): string => {
  const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : v.trim();
};
const textoFila = (f: FilaPrevisualizada) => [f.clienteListado, f.nifListado, f.bastidorListado, f.matriculaListado, f.estadoListado, f.clienteApp, f.dniApp, f.idExpediente !== null ? `exp ${f.idExpediente}` : "", f.vehiculoApp].join(" ").toLowerCase();

interface Borrador {
  listados: ListadoLeido[];
  referencias: Referencia[];
  elegidos: string[];
  asignaciones?: Record<string, number>;
  editados?: Record<string, string>;
  deshabilitar?: number[];
}

/**
 * «Completar datos desde listados»: sube los Excel/CSV del fabricante (Expedientes, Llamadas de calidad…), la app reconoce las
 * columnas, encuentra tus expedientes (por bastidor, matrícula, NIF, correo o nombre) y propone rellenar huecos o corregir datos.
 * Se puede filtrar y buscar, abrir cada fila para ver el pedido en PDF, editar a mano lo que se va a guardar y asociar a mano
 * las filas dudosas. Nunca crea expedientes, clientes ni modelos.
 */
export default function ModalCompletarDatos({ alCerrar, alAplicar }: { alCerrar: () => void; alAplicar: () => void }) {
  const { mostrar, confirmar } = useToast();
  const [listados, setListados] = useState<ListadoLeido[]>([]);
  const [resultado, setResultado] = useState<ResultadoPrevisualizar | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [asignaciones, setAsignaciones] = useState<Record<string, number>>({});
  const [editados, setEditados] = useState<Record<string, string>>({});
  const [deshabilitar, setDeshabilitar] = useState<Set<number>>(new Set());
  const [trabajando, setTrabajando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("con_cambios");
  const [busqueda, setBusqueda] = useState("");
  const [columnas, setColumnas] = useState<Set<Columna>>(new Set(["estadoListado", "documentos", "expediente", "propuestas"]));
  const [detalle, setDetalle] = useState<number | null>(null);
  const [hecho, setHecho] = useState<{ expedientesCambiados: number; camposCambiados: number; omitidos: string[]; pagosEnlazados?: number } | null>(null);
  const [referencias, setReferencias] = useState<Referencia[]>(["bastidor", "matricula", "nif", "email", "nombre"]);

  /** Busca los expedientes de las filas con las referencias elegidas; si hay una selección guardada, la conserva. */
  const previsualizar = async (leidos: ListadoLeido[], refs: Referencia[], asig: Record<string, number>, previos?: Set<string>, reasignada?: number) => {
    // Un mismo coche puede salir en varios listados (uno trae el teléfono, otro la matrícula): se juntan por bastidor
    // Se renumeran: dos listados (VN y VO) empiezan los dos en la fila 2 y no pueden repetirse
    const filas: FilaListadoRenault[] = unir(leidos.flatMap((l) => l.filas)).map((f, i) => ({ ...f, fila: i + 1 }));
    const { data } = await llamar<ResultadoPrevisualizar>("/api/expedientes/completar/previsualizar", { method: "POST", cuerpo: { filas, referencias: refs, asignaciones: asig } });
    setResultado(data);
    const marcados = new Set<string>();
    for (const f of data.filas) {
      for (const p of f.propuestas) {
        const k = claveCampo(f.fila, p.campo);
        // Un anulado en el listado no se marca solo: se decide a mano
        const porDefecto = (f.estado !== "anulado" || p.campo === "estado_intranet") && (p.tipo === "rellenar" || !p.aviso || f.coincide === "manual");
        if (previos && f.fila !== reasignada ? previos.has(k) : porDefecto) marcados.add(k);
      }
    }
    setElegidos(marcados);
  };

  // Si se cerró la ventana a medias, la importación queda guardada y se retoma al volver a abrirla
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const guardado = window.localStorage.getItem(CLAVE_BORRADOR);
        if (!guardado) return;
        const b = JSON.parse(guardado) as Borrador;
        if (!Array.isArray(b.listados) || b.listados.length === 0) return;
        const asig = b.asignaciones ?? {};
        setListados(b.listados);
        setReferencias(b.referencias.length > 0 ? b.referencias : ["bastidor"]);
        setAsignaciones(asig);
        setEditados(b.editados ?? {});
        setDeshabilitar(new Set(b.deshabilitar ?? []));
        setTrabajando(true);
        previsualizar(b.listados, b.referencias, asig, new Set(b.elegidos))
          .catch((err) => mostrar(textoError(err), "error"))
          .finally(() => setTrabajando(false));
      } catch {
        /* sin borrador */
      }
      try {
        const c = JSON.parse(window.localStorage.getItem(CLAVE_COLUMNAS) ?? "null") as Columna[] | null;
        if (Array.isArray(c) && c.length > 0) setColumnas(new Set(c));
      } catch {
        /* columnas por defecto */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (listados.length === 0 || hecho) return;
    try {
      const b: Borrador = { listados, referencias, elegidos: [...elegidos], asignaciones, editados, deshabilitar: [...deshabilitar] };
      window.localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(b));
    } catch {
      /* el borrador es una comodidad: si no cabe, no pasa nada */
    }
  }, [listados, referencias, elegidos, asignaciones, editados, deshabilitar, hecho]);
  const descartar = () => {
    try {
      window.localStorage.removeItem(CLAVE_BORRADOR);
    } catch {
      /* nada */
    }
    setListados([]);
    setResultado(null);
    setElegidos(new Set());
    setAsignaciones({});
    setEditados({});
    setDeshabilitar(new Set());
  };
  const cambiarReferencia = (r: Referencia, activa: boolean) => {
    const nuevas = REFS.map((x) => x.id).filter((id) => (id === r ? activa : referencias.includes(id)));
    if (nuevas.length === 0) return;
    setReferencias(nuevas);
    if (listados.length === 0) return;
    setTrabajando(true);
    previsualizar(listados, nuevas, asignaciones)
      .catch((err) => mostrar(textoError(err), "error"))
      .finally(() => setTrabajando(false));
  };
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

  /** Asocia (o quita la asociación de) una fila con un expediente elegido a mano y vuelve a calcular sus cambios. */
  const asignar = async (fila: number, idExpediente: number | null) => {
    const nuevas = { ...asignaciones };
    if (idExpediente === null) delete nuevas[String(fila)];
    else nuevas[String(fila)] = idExpediente;
    setAsignaciones(nuevas);
    setTrabajando(true);
    try {
      await previsualizar(listados, referencias, nuevas, elegidos, fila);
    } catch (err) {
      mostrar(textoError(err), "error");
    } finally {
      setTrabajando(false);
    }
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
      setAsignaciones({});
      setEditados({});
      setDeshabilitar(new Set());
      await previsualizar(leidos, referencias, {});
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
  const alternarDeshabilitar = (id: number, marcar: boolean) =>
    setDeshabilitar((s) => {
      const n = new Set(s);
      if (marcar) n.add(id);
      else n.delete(id);
      return n;
    });
  const valorDe = (f: FilaPrevisualizada, p: PropuestaCampo) => editados[claveCampo(f.fila, p.campo)] ?? p.nuevo;

  const totalElegido = elegidos.size + deshabilitar.size;
  const cuentas = useMemo(() => {
    const c: Record<Filtro, number> = { con_cambios: 0, sin_cambios: 0, sin_coincidencia: 0, ambiguo: 0, anulado: 0, archivado: 0, todas: 0 };
    for (const f of resultado?.filas ?? []) {
      c.todas++;
      if (f.estado === "propuestas") c.con_cambios++;
      if (f.estado === "sin_cambios") c.sin_cambios++;
      if (f.estado === "sin_coincidencia") c.sin_coincidencia++;
      if (f.estado === "ambiguo") c.ambiguo++;
      if (f.estado === "anulado") c.anulado++;
      if (/archivad/i.test(f.estadoListado)) c.archivado++;
    }
    return c;
  }, [resultado]);
  const mostradas = useMemo(() => {
    if (!resultado) return [];
    const q = busqueda.trim().toLowerCase();
    return resultado.filas.filter((f) => {
      const pasa = filtro === "todas" ? true : filtro === "con_cambios" ? f.estado === "propuestas" : filtro === "archivado" ? /archivad/i.test(f.estadoListado) : f.estado === filtro;
      return pasa && (q === "" || textoFila(f).includes(q));
    });
  }, [resultado, filtro, busqueda]);

  const aplicar = async () => {
    if (!resultado) return;
    const cambios = resultado.filas
      .filter((f) => f.idExpediente !== null)
      .map((f) => ({
        id_expediente: f.idExpediente as number,
        campos: f.propuestas.filter((p) => elegidos.has(claveCampo(f.fila, p.campo)) && valorDe(f, p).trim() !== "").map((p) => ({ campo: p.campo, valor: esCampoFecha(p.campo) ? aIso(valorDe(f, p)) : valorDe(f, p).trim() })),
      }))
      .filter((c) => c.campos.length > 0);
    if (cambios.length === 0 && deshabilitar.size === 0) {
      mostrar("No has marcado ningún cambio.", "error");
      return;
    }
    if (!await confirmar({ texto: `Se van a cambiar ${elegidos.size} dato(s) en ${cambios.length} expediente(s)${deshabilitar.size > 0 ? ` y deshabilitar ${deshabilitar.size} expediente(s) anulado(s)` : ""}. Quedará en el Log de importaciones y se podrá deshacer. ¿Continuar?`, peligro: true })) return;
    setTrabajando(true);
    try {
      const { data } = await llamar<{ expedientesCambiados: number; camposCambiados: number; omitidos: string[]; pagosEnlazados?: number }>("/api/expedientes/completar/aplicar", {
        method: "POST",
        cuerpo: { archivo: listados.map((l) => l.nombre).join(", ").slice(0, 250), cambios, deshabilitar: [...deshabilitar] },
      });
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
  const filaDetalle = detalle !== null ? (resultado?.filas.find((f) => f.fila === detalle) ?? null) : null;
  const ver = (c: Columna) => columnas.has(c);

  return (
    <>
      <Modal
        titulo="📥 Completar datos desde listados"
        ancho="1280px"
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
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "72vh", overflowY: "auto" }}>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Sube uno o varios listados del fabricante (Expedientes de VN y de VO, Llamadas de calidad…; Excel o CSV). La app reconoce las columnas sola, busca tus expedientes y te propone rellenar lo que falta o corregir lo que no coincide. <b>No crea expedientes, ni clientes, ni modelos</b>. Antes de aplicar ves todo: filtra, busca, abre cada fila para ver el pedido en PDF, edita el dato que se guardará y asocia a mano las filas dudosas.
          </p>
          <label className="btn btn-primary" style={{ alignSelf: "flex-start", cursor: trabajando ? "wait" : "pointer" }}>
            {trabajando ? "Trabajando…" : listados.length > 0 ? "Elegir otros archivos" : "Elegir archivos (.xlsx, .xls, .csv)"}
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
              {(hecho.pagosEnlazados ?? 0) > 0 && <div style={{ marginTop: "4px" }}>💳 Además, {hecho.pagosEnlazados} pago(s) de la financiera que estaban pendientes se han enlazado con su expediente y han fijado su fecha RCI.</div>}
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
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                {FILTROS.map((f) => (
                  <button key={f.id} type="button" title={f.ayuda} className={filtro === f.id ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "3px 10px", fontSize: "0.82rem" }} onClick={() => setFiltro(f.id)}>
                    {f.texto} ({cuentas[f.id]})
                  </button>
                ))}
                <input className="input-premium" type="search" placeholder="Buscar por cliente, NIF, bastidor, matrícula, expediente…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ flex: "1 1 260px", minWidth: "220px", marginLeft: "auto" }} title="Filtra las filas que se ven por cualquier dato del listado o del expediente" />
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
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Mostrando {mostradas.length} de {resultado.resumen.filas} fila(s) · {resultado.resumen.cambios} cambio(s) propuesto(s) en total.
              </div>
              {(resultado.sinFila?.length ?? 0) > 0 && (
                <details style={{ fontSize: "0.82rem" }}>
                  <summary style={{ cursor: "pointer", color: "var(--warning)" }}>{resultado.sinFila?.length} expediente(s) tuyos no aparecen en el listado (por eso no se rellenan): ver cuáles</summary>
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
                      <th style={{ width: "34px" }} title="Marca o desmarca todos los cambios de la fila" />
                      <th title="Cliente y vehículo tal como vienen en el listado">Listado</th>
                      {ver("estadoListado") && <th title="Estado del expediente en el listado del fabricante">Estado</th>}
                      {ver("documentos") && <th title="NIF, bastidor y matrícula que trae el listado, para cotejar a mano">Documento / bastidor</th>}
                      {ver("expediente") && <th title="Expediente de la app al que se asocia la fila y por qué dato se encontró">Expediente en la app</th>}
                      {ver("propuestas") && <th title="Datos que se rellenarían o corregirían; puedes editar el valor nuevo">Qué se propone</th>}
                      <th style={{ width: "86px" }} title="Abrir la fila para ver el pedido en PDF, editar y asociar a mano">
                        Detalle
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mostradas.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                          No hay nada que mostrar con este filtro.
                        </td>
                      </tr>
                    )}
                    {mostradas.map((f) => {
                      const todas = f.propuestas.length > 0 && f.propuestas.every((p) => elegidos.has(claveCampo(f.fila, p.campo)));
                      return (
                        <tr key={f.fila} style={{ opacity: f.estado === "propuestas" || f.estado === "anulado" || f.estado === "ambiguo" ? 1 : 0.65 }}>
                          <td>{f.propuestas.length > 0 && <input type="checkbox" checked={todas} onChange={(e) => alternarFila(f, e.target.checked)} title="Marcar o desmarcar todos los cambios de este expediente" />}</td>
                          <td>
                            <b>{f.clienteListado || "—"}</b>
                            <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>{f.resumen}</div>
                          </td>
                          {ver("estadoListado") && (
                            <td style={{ fontSize: "0.8rem", color: f.estado === "anulado" ? "var(--danger)" : undefined }} title={f.estadoListado}>
                              {f.estadoListado || "—"}
                            </td>
                          )}
                          {ver("documentos") && (
                            <td style={{ fontSize: "0.78rem" }}>
                              <div>{f.nifListado || "—"}</div>
                              <div style={{ color: "var(--text-muted)" }}>{f.bastidorListado || f.matriculaListado || "—"}</div>
                            </td>
                          )}
                          {ver("expediente") && (
                            <td>
                              {f.idExpediente !== null ? (
                                <>
                                  <b>Exp. {f.idExpediente}</b> · {f.clienteApp ?? "—"}
                                  <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                                    {f.claseApp} · {f.vehiculoApp ?? "—"} · encontrado por {f.coincide}
                                    {f.deshabilitadoApp ? " · deshabilitado" : ""}
                                  </div>
                                </>
                              ) : (
                                f.candidatos[0]?.probable ? (
                                  <div style={{ fontSize: "0.78rem" }}>
                                    <b style={{ color: "var(--success)" }}>Probable:</b> Exp. {f.candidatos[0].id} · {f.candidatos[0].cliente ?? "—"}
                                    <div style={{ color: "var(--text-muted)" }}>{f.candidatos[0].motivo}</div>
                                    <button type="button" className="btn btn-primary" style={{ marginTop: "3px", padding: "1px 8px", fontSize: "0.76rem" }} disabled={trabajando} onClick={() => void asignar(f.fila, f.candidatos[0].id)} title="Asociar esta fila del listado con ese expediente y calcular los cambios">
                                      Elegir este
                                    </button>
                                  </div>
                                ) : (
                                  <span style={{ color: f.estado === "ambiguo" ? "var(--warning)" : "var(--text-muted)", fontSize: "0.8rem" }}>{f.candidatos.length > 0 ? `${f.candidatos.length} posible(s): abre la fila y elige` : "—"}</span>
                                )
                              )}
                            </td>
                          )}
                          {ver("propuestas") && (
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
                                      <span style={{ color: "var(--danger)", textDecoration: p.actual ? "line-through" : "none" }}>{formatear(p.actual)}</span>→<span style={{ color: "var(--success)", fontWeight: 700 }}>{formatear(valorDe(f, p))}</span>
                                      {p.aviso && <span style={{ color: "var(--warning)", fontSize: "0.74rem" }}>⚠ {p.aviso}</span>}
                                    </label>
                                  ))}
                                  {f.motivo && <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>ℹ {f.motivo}</span>}
                                </div>
                              )}
                            </td>
                          )}
                          <td>
                            <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.78rem" }} onClick={() => setDetalle(f.fila)} title="Ver el pedido en PDF, editar los datos y asociar a mano">
                              🔍 Abrir
                            </button>
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
      {filaDetalle && (
        <DetalleFila
          fila={filaDetalle}
          elegidos={elegidos}
          editados={editados}
          deshabilitar={deshabilitar}
          trabajando={trabajando}
          alCerrar={() => setDetalle(null)}
          alAlternar={alternar}
          alEditar={(k, v) => setEditados((s) => ({ ...s, [k]: v }))}
          alAsignar={(id) => void asignar(filaDetalle.fila, id)}
          alDeshabilitar={alternarDeshabilitar}
        />
      )}
    </>
  );
}

/** Una fila abierta: el pedido en PDF a un lado y, al otro, lo que trae el listado, el expediente asociado y lo que se guardará (editable). */
function DetalleFila({
  fila,
  elegidos,
  editados,
  deshabilitar,
  trabajando,
  alCerrar,
  alAlternar,
  alEditar,
  alAsignar,
  alDeshabilitar,
}: {
  fila: FilaPrevisualizada;
  elegidos: Set<string>;
  editados: Record<string, string>;
  deshabilitar: Set<number>;
  trabajando: boolean;
  alCerrar: () => void;
  alAlternar: (k: string) => void;
  alEditar: (k: string, v: string) => void;
  alAsignar: (id: number | null) => void;
  alDeshabilitar: (id: number, marcar: boolean) => void;
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<{ id_expediente: number; label: string }[]>([]);
  const [buscando, setBuscando] = useState(false);

  const buscar = async () => {
    if (texto.trim().length < 2) return;
    setBuscando(true);
    try {
      const r = await fetch(`/api/buscar?q=${encodeURIComponent(texto.trim())}`, { credentials: "same-origin", cache: "no-store" });
      const j = (await r.json()) as { expedientes?: { id_expediente: number; label: string }[] };
      setResultados(j.expedientes ?? []);
    } catch {
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  };

  const dato = (titulo: string, valor: string | null) => (
    <div style={{ display: "flex", gap: "6px", fontSize: "0.82rem" }}>
      <span style={{ color: "var(--text-muted)", minWidth: "92px" }}>{titulo}</span>
      <b>{valor && valor !== "" ? valor : "—"}</b>
    </div>
  );

  return (
    <Modal
      titulo={`🔍 ${fila.clienteListado || "Fila"} · fila ${fila.fila} del listado`}
      ancho="1240px"
      pie={
        <button type="button" className="btn btn-primary" onClick={alCerrar}>
          Listo
        </button>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "16px", maxHeight: "72vh" }}>
        <div style={{ minHeight: "300px", overflow: "hidden", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)" }}>
          {fila.idAdjuntoPedido !== null ? (
            <VisorPedido key={fila.idAdjuntoPedido} idAdjunto={fila.idAdjuntoPedido} nombre={fila.clienteApp ?? fila.clienteListado} />
          ) : (
            <div style={{ padding: "16px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {fila.idExpediente === null ? "Aún no hay expediente asociado, así que no hay pedido que ver. Asocia uno a la derecha." : "Este expediente no tiene un pedido guardado (se creó a mano o se purgó el archivo)."}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto" }}>
          <section>
            <h4 style={{ margin: "0 0 4px" }}>En el listado</h4>
            {dato("Cliente", fila.clienteListado)}
            {dato("Estado", fila.estadoListado)}
            {dato("NIF", fila.nifListado)}
            {dato("Bastidor", fila.bastidorListado)}
            {dato("Matrícula", fila.matriculaListado)}
            {dato("Vehículo", fila.resumen)}
          </section>
          <section>
            <h4 style={{ margin: "0 0 4px" }}>Expediente en la app</h4>
            {fila.idExpediente !== null ? (
              <>
                {dato("Expediente", `Exp. ${fila.idExpediente}${fila.deshabilitadoApp ? " (deshabilitado)" : ""}`)}
                {dato("Cliente", fila.clienteApp)}
                {dato("NIF", fila.dniApp)}
                {dato("Vehículo", `${fila.claseApp ?? ""} ${fila.vehiculoApp ?? ""}`.trim())}
                {dato("Encontrado por", fila.coincide)}
                {fila.coincide === "manual" && (
                  <button type="button" className="btn btn-secondary" style={{ marginTop: "6px", padding: "2px 8px", fontSize: "0.78rem" }} disabled={trabajando} onClick={() => alAsignar(null)} title="Olvida la asociación elegida a mano y vuelve a buscar solo con los datos">
                  Quitar asociación manual
                </button>
                )}
              </>
            ) : (
              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{fila.motivo ?? "Sin expediente asociado."}</span>
            )}
            {fila.motivo && fila.idExpediente !== null && <div style={{ fontSize: "0.78rem", color: "var(--warning)", marginTop: "4px" }}>ℹ {fila.motivo}</div>}
            {fila.candidatos.length > 0 && (
              <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                <b style={{ fontSize: "0.82rem" }}>Posibles expedientes:</b>
                {fila.candidatos.map((c) => (
                  <div key={c.id} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "4px 8px" }}>
                    <span style={{ flex: 1 }}>
                      <b>Exp. {c.id}</b> {c.probable && <b style={{ color: "var(--success)" }}>· probable </b>}· {c.cliente ?? "—"} · {c.dni ?? "sin NIF"} · {c.vehiculo ?? "—"} · {c.vin ?? c.matricula ?? "sin bastidor"} · {c.fecha ?? ""}
                      <div style={{ color: "var(--text-muted)" }}>{c.motivo}</div>
                    </span>
                    <button type="button" className="btn btn-primary" style={{ padding: "2px 8px" }} disabled={trabajando} onClick={() => alAsignar(c.id)} title="Asociar esta fila del listado con este expediente">
                      Elegir
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: "8px", display: "flex", gap: "6px" }}>
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
                title="Busca un expediente de la app para asociarlo a esta fila"
              />
              <button type="button" className="btn btn-secondary" disabled={buscando || texto.trim().length < 2} onClick={() => void buscar()}>
                Buscar
              </button>
            </div>
            {resultados.map((r) => (
              <div key={r.id_expediente} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", marginTop: "4px" }}>
                <span style={{ flex: 1 }}>{r.label}</span>
                <button type="button" className="btn btn-primary" style={{ padding: "2px 8px" }} disabled={trabajando} onClick={() => alAsignar(r.id_expediente)} title="Asociar esta fila del listado con este expediente">
                  Elegir
                </button>
              </div>
            ))}
          </section>
          {fila.idExpediente !== null && (
            <section>
              <h4 style={{ margin: "0 0 4px" }}>Qué se guardaría (puedes editarlo)</h4>
              {fila.propuestas.length === 0 && <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>No hay nada que cambiar en este expediente.</span>}
              {fila.propuestas.map((p) => {
                const k = `${fila.fila}|${p.campo}`;
                const valor = editados[k] ?? p.nuevo;
                const esFecha = p.campo.startsWith("fecha_");
                return (
                  <div key={p.campo} style={{ display: "flex", gap: "8px", alignItems: "center", margin: "4px 0", flexWrap: "wrap" }}>
                    <input type="checkbox" checked={elegidos.has(k)} onChange={() => alAlternar(k)} title="Aplicar este cambio" />
                    <span style={{ minWidth: "130px", fontSize: "0.82rem" }}>
                      <b>{p.etiqueta}</b>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.74rem" }}>ahora: {formatear(p.actual)}</div>
                    </span>
                    <input
                      className="input-premium"
                      type={esFecha ? "date" : "text"}
                      value={esFecha ? (/^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : "") : valor}
                      onChange={(e) => alEditar(k, e.target.value)}
                      style={{ width: esFecha ? "170px" : "250px" }}
                      title="Valor que se guardará: puedes corregirlo a mano antes de aplicar"
                    />
                    {p.aviso && <span style={{ color: "var(--warning)", fontSize: "0.74rem" }}>⚠ {p.aviso}</span>}
                  </div>
                );
              })}
              {fila.estado === "anulado" && !fila.deshabilitadoApp && (
                <label style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "8px", fontSize: "0.84rem" }} title="Un expediente deshabilitado sigue en la lista pero no cuenta en comisiones, tasa ni liquidaciones. Se puede deshacer desde el Log de importaciones">
                  <input type="checkbox" checked={deshabilitar.has(fila.idExpediente)} onChange={(e) => alDeshabilitar(fila.idExpediente as number, e.target.checked)} />
                  Deshabilitar este expediente (está anulado en el listado)
                </label>
              )}
            </section>
          )}
        </div>
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
