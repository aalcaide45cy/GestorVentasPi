"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import TablaDatos, { PANTALLA_COMPLETA, type ColumnaTabla } from "@/components/TablaDatos";
import PanelReenvioIncidencias from "@/components/admin/PanelReenvioIncidencias";
import { useCarga } from "@/components/comisiones/useCarga";
import { ESTADOS_INCIDENCIA, ETIQUETA_ORIGEN, ICONO_ORIGEN, informeDe, ORIGENES, type EstadoIncidencia, type OrigenIncidencia } from "@/lib/incidencias";
import type { IncidenciaDto, ResumenIncidencias } from "@/lib/servicios/incidencias";

interface Datos {
  incidencias: IncidenciaDto[];
  resumen: ResumenIncidencias;
}

async function enviar(metodo: "PATCH" | "DELETE", cuerpo: unknown): Promise<void> {
  const r = await fetch("/api/admin/incidencias", { method: metodo, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(j.message ?? `Error ${r.status}`);
  }
}

type Vista = "pendientes" | "nuevas" | "resueltas" | "ignoradas" | "todas";
const VISTAS: { id: Vista; texto: string; ayuda: string; estados: EstadoIncidencia[] }[] = [
  { id: "pendientes", texto: "Pendientes", ayuda: "Nuevas y ya vistas pero sin resolver", estados: ["nueva", "revisada"] },
  { id: "nuevas", texto: "Nuevas", ayuda: "Todavía sin mirar", estados: ["nueva"] },
  { id: "resueltas", texto: "Resueltas", ayuda: "Marcadas como arregladas (si vuelven a ocurrir se reabren solas)", estados: ["resuelta"] },
  { id: "ignoradas", texto: "Ignoradas", ayuda: "Que no se quiere volver a ver como pendientes", estados: ["ignorada"] },
  { id: "todas", texto: "Todas", ayuda: "Todo lo anotado", estados: [...ESTADOS_INCIDENCIA] },
];
const TEXTO_ESTADO: Record<EstadoIncidencia, string> = { nueva: "Nueva", revisada: "Vista", resuelta: "Resuelta", ignorada: "Ignorada" };

const fecha = (iso: string): string => new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * «Incidencias»: todo lo que falla o va mal en un solo sitio (errores del servidor y del navegador, avisos de error mostrados, tareas fallidas, lentitud,
 * avisos del equipo y fallos que avisa una persona). Se revisan, se marcan como resueltas o ignoradas y se copian en un informe para pasarlo a quien las arregla.
 */
export default function PestanaIncidencias() {
  const { mostrar, confirmar } = useToast();
  const { datos, recargar } = useCarga<Datos | null>("/api/admin/incidencias", null);
  const [vista, setVista] = useState<Vista>("pendientes");
  const [origen, setOrigen] = useState<"" | OrigenIncidencia>("");
  const [nivel, setNivel] = useState<"" | "error" | "aviso">("");
  const [auto, setAuto] = useState(true);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [visibles, setVisibles] = useState<IncidenciaDto[]>([]);
  const [abierta, setAbierta] = useState<number | null>(null);

  // Se actualiza sola cada 20 segundos mientras se mira (se puede parar)
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(recargar, 20_000);
    return () => clearInterval(t);
  }, [auto, recargar]);

  const todas = useMemo(() => datos?.incidencias ?? [], [datos]);
  const estadosVista = useMemo(() => VISTAS.find((v) => v.id === vista)?.estados ?? [], [vista]);
  const cuentaVista = (v: Vista) => todas.filter((i) => (VISTAS.find((x) => x.id === v)?.estados ?? []).includes(i.estado)).length;
  const filas = useMemo(() => todas.filter((i) => estadosVista.includes(i.estado) && (!origen || i.origen === origen) && (!nivel || i.nivel === nivel)), [todas, estadosVista, origen, nivel]);
  const elegidas = useMemo(() => todas.filter((i) => marcados.has(i.id)), [todas, marcados]);

  const cambiar = async (ids: number[], estado: EstadoIncidencia, texto?: string) => {
    try {
      await enviar("PATCH", { ids, estado });
      if (texto) mostrar(texto);
      recargar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido cambiar.", "error");
    }
  };

  const borrar = async (lista: IncidenciaDto[]) => {
    if (lista.length === 0) return;
    if (!(await confirmar({ texto: lista.length === 1 ? "¿Borro esta incidencia?" : `¿Borro ${lista.length} incidencias?`, peligro: true }))) return;
    try {
      await enviar("DELETE", { ids: lista.map((i) => i.id) });
      mostrar(lista.length === 1 ? "Incidencia borrada." : `${lista.length} incidencias borradas.`);
      setMarcados(new Set());
      recargar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido borrar.", "error");
    }
  };

  const copiarInforme = async (lista: IncidenciaDto[]) => {
    const texto = informeDe(lista.slice(0, 30));
    try {
      await navigator.clipboard.writeText(texto);
      mostrar(`Informe de ${Math.min(lista.length, 30)} incidencia(s) copiado: pégalo donde se vaya a revisar.`);
    } catch {
      mostrar("No se ha podido copiar al portapapeles: usa «Descargar informe».", "error");
    }
  };

  const alternar = (id: number) =>
    setMarcados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const columnas: ColumnaTabla<IncidenciaDto>[] = [
    { clave: "marca", etiqueta: "Elegir", cabecera: "☑", valor: (i) => (marcados.has(i.id) ? 0 : 1), celda: (i) => <input type="checkbox" checked={marcados.has(i.id)} onChange={() => alternar(i.id)} aria-label={`Elegir la incidencia ${i.id}`} />, ancho: 40, alinear: "center" },
    { clave: "nivel", etiqueta: "Nivel", valor: (i) => (i.nivel === "error" ? 0 : 1), celda: (i) => <span title={i.nivel === "error" ? "Error" : "Aviso"}>{i.nivel === "error" ? "🔴" : "🟡"}</span>, ancho: 50, alinear: "center" },
    { clave: "equipo", etiqueta: "Equipo", valor: (i) => i.equipo ?? "Este servidor", celda: (i) => (i.equipo ? <span title="Reporte que llegó desde otro equipo" style={{ whiteSpace: "nowrap", fontWeight: 600 }}>📡 {i.equipo}</span> : <span style={{ color: "var(--text-muted)" }}>Este servidor</span>), ayuda: "Desde qué equipo se hizo el reporte" },
    { clave: "origen", etiqueta: "Origen", valor: (i) => ETIQUETA_ORIGEN[i.origen], celda: (i) => <span style={{ whiteSpace: "nowrap" }}>{ICONO_ORIGEN[i.origen]} {ETIQUETA_ORIGEN[i.origen]}</span> },
    {
      clave: "titulo",
      etiqueta: "Qué pasó",
      valor: (i) => i.titulo,
      celda: (i) => (
        <button type="button" onClick={() => setAbierta(i.id)} style={{ all: "unset", cursor: "pointer", color: "var(--primary)", fontWeight: i.estado === "nueva" ? 700 : 500, wordBreak: "break-word", whiteSpace: "normal", maxWidth: "520px", display: "block" }} title="Ver el detalle">
          {i.titulo}
          {i.capturas.length > 0 && " 📷"}
        </button>
      ),
    },
    { clave: "ruta", etiqueta: "Dónde", valor: (i) => i.ruta ?? "", celda: (i) => <span style={{ fontFamily: "monospace", fontSize: "0.8rem", wordBreak: "break-all" }}>{i.ruta ?? "—"}</span> },
    { clave: "veces", etiqueta: "Veces", valor: (i) => i.veces, alinear: "right", ancho: 70 },
    { clave: "ultima", etiqueta: "Última vez", valor: (i) => i.ultimaVez, celda: (i) => <span style={{ whiteSpace: "nowrap" }}>{fecha(i.ultimaVez)}</span> },
    {
      clave: "estado",
      etiqueta: "Estado",
      valor: (i) => TEXTO_ESTADO[i.estado],
      celda: (i) => (
        <select className="form-input" value={i.estado} onChange={(e) => void cambiar([i.id], e.target.value as EstadoIncidencia)} style={{ padding: "3px 8px", width: "auto", fontWeight: i.estado === "nueva" ? 700 : 400 }}>
          {ESTADOS_INCIDENCIA.map((e) => (
            <option key={e} value={e}>
              {TEXTO_ESTADO[e]}
            </option>
          ))}
        </select>
      ),
    },
  ];

  const r = datos?.resumen;
  const tarjeta = (n: number | string, texto: string, color?: string) => (
    <div className="glass-panel" style={{ padding: "10px 16px", minWidth: "140px", borderLeft: color ? `4px solid ${color}` : undefined }}>
      <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>{n}</div>
      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{texto}</div>
    </div>
  );
  const chip = (activo: boolean, texto: string, ayuda: string, alPulsar: () => void) => (
    <button key={texto} type="button" className={activo ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "5px 12px" }} onClick={alPulsar} title={ayuda}>
      {texto}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <PanelReenvioIncidencias />
      <div style={{ color: "var(--text-secondary)", lineHeight: 1.5, fontSize: "0.9rem" }}>
        Aquí se reúne todo lo que falla o va mal: errores del servidor y del navegador, avisos de error que ha visto alguien, tareas y lecturas fallidas, lentitud y fallos que avisa una persona con «🐞 Avisar de un fallo». Los iguales se juntan y cuentan las veces. Si algo resuelto vuelve a ocurrir, se reabre solo.
      </div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {tarjeta(r?.nuevasErrores ?? "—", "errores nuevos", (r?.nuevasErrores ?? 0) > 0 ? "var(--danger)" : undefined)}
        {tarjeta(r?.nuevasAvisos ?? "—", "avisos nuevos", (r?.nuevasAvisos ?? 0) > 0 ? "var(--warning)" : undefined)}
        {tarjeta(r?.ultimas24h ?? "—", "en las últimas 24 h")}
        {tarjeta(r?.total ?? "—", "guardadas en total")}
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {VISTAS.map((v) => chip(vista === v.id, `${v.texto} (${cuentaVista(v.id)})`, v.ayuda, () => setVista(v.id)))}
        <select className="form-input" value={origen} onChange={(e) => setOrigen(e.target.value as "" | OrigenIncidencia)} style={{ width: "auto", padding: "5px 10px" }} aria-label="Origen">
          <option value="">Todos los orígenes</option>
          {ORIGENES.map((o) => (
            <option key={o} value={o}>
              {ICONO_ORIGEN[o]} {ETIQUETA_ORIGEN[o]}
            </option>
          ))}
        </select>
        <select className="form-input" value={nivel} onChange={(e) => setNivel(e.target.value as "" | "error" | "aviso")} style={{ width: "auto", padding: "5px 10px" }} aria-label="Nivel">
          <option value="">Errores y avisos</option>
          <option value="error">Solo errores</option>
          <option value="aviso">Solo avisos</option>
        </select>
        <label style={{ display: "flex", gap: "6px", alignItems: "center", fontSize: "0.82rem", marginLeft: "auto" }} title="Vuelve a mirar cada 20 segundos">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Actualizar sola
        </label>
        <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={recargar}>
          🔄 Actualizar
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => setMarcados(new Set(visibles.map((i) => i.id)))} disabled={visibles.length === 0}>
          ☑ Marcar las {visibles.length} que se ven
        </button>
        {marcados.size > 0 ? (
          <>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => setMarcados(new Set())}>
              Quitar marcas
            </button>
            <b style={{ color: "var(--primary)", fontSize: "0.9rem" }}>{elegidas.length} marcada(s):</b>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => void cambiar(elegidas.map((i) => i.id), "resuelta", "Marcadas como resueltas.")}>
              ✅ Resueltas
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => void cambiar(elegidas.map((i) => i.id), "ignorada", "Marcadas como ignoradas.")} title="Dejan de contar como pendientes (siguen contando veces)">
              🙈 Ignorar
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => void cambiar(elegidas.map((i) => i.id), "nueva", "Reabiertas.")}>
              ↩️ Reabrir
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => void copiarInforme(elegidas)}>
              📋 Copiar informe
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px", color: "var(--danger)" }} onClick={() => void borrar(elegidas)}>
              🗑️ Borrar
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} disabled={filas.length === 0} onClick={() => void copiarInforme(filas)} title="Copia un informe en texto de las que se ven (hasta 30), con los pasos previos de cada una: para pasarlo a quien las vaya a revisar">
              📋 Copiar informe de lo que se ve
            </button>
            <a className="btn btn-secondary" style={{ padding: "5px 12px" }} href={`/api/admin/incidencias?informe=1&estados=${estadosVista.join(",")}${origen ? `&origen=${origen}` : ""}${nivel ? `&nivel=${nivel}` : ""}`} download title="Descarga el informe como archivo de texto">
              ⬇️ Descargar informe
            </a>
          </>
        )}
      </div>

      <TablaDatos<IncidenciaDto>
        id="incidencias"
        columnas={columnas}
        filas={filas}
        clave={(i) => i.id}
        placeholder="Buscar en el mensaje, la pantalla o la ruta…"
        vacio={datos === null ? "Cargando…" : "No hay incidencias con estos filtros. Si todo va bien, aquí no debería salir nada."}
        alto={PANTALLA_COMPLETA}
        alVerFilas={setVisibles}
        textoExtra={(i) => `${i.detalle ?? ""} ${i.nota ?? ""}`}
        pie={(fs) => ({ titulo: `${fs.length} incidencia${fs.length === 1 ? "" : "s"}` })}
      />

      {abierta !== null && <DetalleIncidencia id={abierta} alCerrar={() => { setAbierta(null); recargar(); }} alCambiar={recargar} />}
    </div>
  );
}

function DetalleIncidencia({ id, alCerrar, alCambiar }: { id: number; alCerrar: () => void; alCambiar: () => void }) {
  const { mostrar, confirmar } = useToast();
  const { datos } = useCarga<IncidenciaDto | null>(`/api/admin/incidencias?id=${id}`, null);
  const [nota, setNota] = useState<string | null>(null);
  const i = datos;
  const contexto = i?.contexto ?? {};
  const pasos = Array.isArray(contexto.pasos) ? (contexto.pasos as string[]) : [];
  const resto = Object.entries(contexto).filter(([k]) => k !== "pasos");

  const guardarNota = async () => {
    if (!i) return;
    try {
      await enviar("PATCH", { ids: [i.id], nota: nota ?? i.nota ?? "" });
      mostrar("Nota guardada.");
      alCambiar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido guardar la nota.", "error");
    }
  };
  const poner = async (estado: EstadoIncidencia) => {
    if (!i) return;
    try {
      await enviar("PATCH", { ids: [i.id], estado });
      alCerrar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido cambiar.", "error");
    }
  };
  const copiar = async () => {
    if (!i) return;
    try {
      await navigator.clipboard.writeText(informeDe([i]));
      mostrar("Informe copiado.");
    } catch {
      mostrar("No se ha podido copiar al portapapeles.", "error");
    }
  };
  const borrar = async () => {
    if (!i || !(await confirmar({ texto: "¿Borro esta incidencia?", peligro: true }))) return;
    try {
      await enviar("DELETE", { ids: [i.id] });
      alCerrar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido borrar.", "error");
    }
  };

  return (
    <Modal
      titulo={i ? `${i.nivel === "error" ? "🔴" : "🟡"} Incidencia #${i.id} · ${ICONO_ORIGEN[i.origen]} ${ETIQUETA_ORIGEN[i.origen]}` : "Incidencia"}
      ancho="860px"
      pie={
        <>
          <button type="button" className="btn btn-secondary" style={{ marginRight: "auto", color: "var(--danger)" }} onClick={() => void borrar()} disabled={!i}>
            🗑️ Borrar
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void copiar()} disabled={!i}>
            📋 Copiar informe
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void poner("ignorada")} disabled={!i}>
            🙈 Ignorar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void poner("resuelta")} disabled={!i}>
            ✅ Marcar resuelta
          </button>
          <button type="button" className="btn btn-secondary" onClick={alCerrar}>
            Cerrar
          </button>
        </>
      }
    >
      {!i ? (
        <div style={{ color: "var(--text-muted)" }}>Cargando…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
          <div style={{ fontWeight: 700, fontSize: "1.05rem", wordBreak: "break-word" }}>{i.titulo}</div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
            <span>Dónde: <b style={{ fontFamily: "monospace" }}>{i.ruta ?? "—"}</b></span>
            <span>Veces: <b>{i.veces}</b></span>
            <span>Primera: {fecha(i.primeraVez)}</span>
            <span>Última: {fecha(i.ultimaVez)}</span>
            <span>Estado: <b>{TEXTO_ESTADO[i.estado]}</b></span>
            {i.version && <span>Versión: {i.version}</span>}
          </div>
          {i.capturas.map((c) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={c} src={`/api/admin/incidencias?captura=${c}`} alt="Captura de pantalla de quien avisó" style={{ maxWidth: "100%", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }} />
          ))}
          {pasos.length > 0 && (
            <div>
              <b>Qué se estaba haciendo (del más antiguo al más reciente)</b>
              <ol style={{ margin: "6px 0 0", paddingLeft: "22px", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                {pasos.map((p, k) => (
                  <li key={k}>{p}</li>
                ))}
              </ol>
            </div>
          )}
          {resto.length > 0 && (
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              {resto.map(([k, v]) => (
                <div key={k}>
                  <b>{k}:</b> {typeof v === "string" ? v : JSON.stringify(v)}
                </div>
              ))}
            </div>
          )}
          {i.detalle && <pre style={{ margin: 0, padding: "10px", background: "rgba(0,0,0,0.25)", borderRadius: "var(--radius-sm)", maxHeight: "260px", overflow: "auto", fontSize: "0.78rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{i.detalle}</pre>}
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <textarea className="form-input" rows={2} value={nota ?? i.nota ?? ""} onChange={(e) => setNota(e.target.value)} placeholder="Nota (por ejemplo, la causa o qué se hizo)…" style={{ flex: 1 }} maxLength={2000} />
            <button type="button" className="btn btn-secondary" onClick={() => void guardarNota()} disabled={nota === null || nota === (i.nota ?? "")}>
              Guardar nota
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
