"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { ICONOS, botonChico, numero } from "@/components/datos/DatosSeccion";
import { INFO_SECCIONES, SECCIONES, type Modo, type Seccion } from "@/lib/secciones-info";
import type { Informe } from "@/lib/servicios/intercambio";
import type { ResultadoLote, ResumenSeccionLote } from "@/lib/servicios/intercambio-lote";
import { TEXTO_SEGUNDO_CLIC, useDobleConfirmacion } from "@/components/useDobleConfirmacion";

/** Qué secciones se marcan al exportar todo: «Clientes y expedientes» ya incluye a «Clientes» y «Expedientes» por separado. */
const DE_TODO: Seccion[] = SECCIONES.filter((s) => s !== "clientes" && s !== "expedientes");

const TEXTO_MODO: Record<Modo, string> = {
  anadir: "Añadir solo lo nuevo",
  actualizar: "Añadir y actualizar",
  sustituir: "Sustituir (elimina lo que no esté)",
};

interface ResumenArchivo {
  exportadoEn: string;
  version: string | null;
  secciones: ResumenSeccionLote[];
}

function guardarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** «Todo en un archivo»: exportar varias secciones en un solo JSON e importarlas en lote, eligiendo qué entra y con qué modo. */
export default function PanelLote({ alTerminar }: { alTerminar: () => void }) {
  const { mostrar } = useToast();
  const [elegidas, setElegidas] = useState<Seccion[]>(DE_TODO);
  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);

  const exportar = async () => {
    if (elegidas.length === 0) return;
    setExportando(true);
    try {
      const res = await fetch(`/api/admin/datos/lote?secciones=${elegidas.join(",")}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? "No se pudo exportar.");
      const nombre = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "gv_todo.json";
      guardarBlob(await res.blob(), nombre);
      mostrar(`✅ Exportado ${nombre}: ${numero(Number(res.headers.get("X-Registros") ?? 0))} registros de ${elegidas.length} secciones en un solo archivo.`);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setExportando(false);
    }
  };

  const alternar = (s: Seccion) => setElegidas((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const sensibles = elegidas.filter((s) => INFO_SECCIONES[s].aviso);

  return (
    <div className="glass-panel" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px", border: "1px solid var(--border-light)" }}>
      <div style={{ fontWeight: 700 }}>🧺 Todo en un solo archivo (JSON)</div>
      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
        Exporta varias secciones <b>en un único archivo</b> y, al importarlo, elige <b>qué secciones entran y cómo</b>: ves un <b>cotejo exacto</b> de lo que cambiaría en cada una antes de aplicar nada. Las secciones de abajo se pueden marcar o quitar.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
        {SECCIONES.map((s) => (
          <label key={s} style={{ display: "flex", gap: "6px", alignItems: "center", fontSize: "0.85rem", cursor: "pointer" }} title={INFO_SECCIONES[s].descripcion}>
            <input type="checkbox" checked={elegidas.includes(s)} onChange={() => alternar(s)} style={{ accentColor: "var(--primary)" }} />
            {ICONOS[s]} {INFO_SECCIONES[s].titulo}
          </label>
        ))}
      </div>
      {sensibles.length > 0 && <div style={{ fontSize: "0.8rem", color: "var(--warning)" }}>⚠️ El archivo llevará datos personales o confidenciales ({sensibles.map((s) => INFO_SECCIONES[s].titulo).join(", ")}): guárdalo en un sitio seguro.</div>}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" style={botonChico} disabled={exportando || elegidas.length === 0} onClick={() => void exportar()} title="Descarga un solo archivo .json con las secciones marcadas. No cambia nada en la aplicación.">
          {exportando ? "Exportando…" : `📤 Exportar todo (${elegidas.length} secciones)`}
        </button>
        <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setImportando(true)} title="Elige un archivo .json (de todo o de una sola sección), marca qué secciones importar y mira el cotejo antes de aplicar.">
          📥 Importar en lote…
        </button>
      </div>
      {importando && <ModalLote alCerrar={() => setImportando(false)} alTerminar={alTerminar} />}
    </div>
  );
}

function ModalLote({ alCerrar, alTerminar }: { alCerrar: () => void; alTerminar: () => void }) {
  const { mostrar } = useToast();
  const [paquete, setPaquete] = useState<unknown>(null);
  const [nombre, setNombre] = useState("");
  const [resumen, setResumen] = useState<ResumenArchivo | null>(null);
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({});
  const [modos, setModos] = useState<Record<string, Modo>>({});
  const [resultado, setResultado] = useState<ResultadoLote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<"leer" | "cotejar" | "aplicar" | null>(null);

  const elecciones = useMemo(() => (resumen?.secciones ?? []).filter((s) => s.importable && marcadas[s.seccion]).map((s) => ({ seccion: s.seccion, modo: modos[s.seccion] ?? s.modoSugerido ?? "anadir" })), [resumen, marcadas, modos]);
  const palabra = elecciones.some((e) => e.modo === "sustituir") ? "SUSTITUIR" : "IMPORTAR";

  const invalidar = () => {
    setResultado(null);
  };

  const elegirArchivo = async (ev: ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!archivo) return;
    setError(null);
    invalidar();
    setResumen(null);
    setTrabajando("leer");
    try {
      const p = JSON.parse(await archivo.text()) as unknown;
      const { extra } = await llamar("/api/admin/datos/lote", { method: "POST", cuerpo: { accion: "leer", paquete: p } });
      const r = extra.resumen as ResumenArchivo;
      setPaquete(p);
      setNombre(archivo.name);
      setResumen(r);
      setMarcadas(Object.fromEntries(r.secciones.map((s) => [s.seccion, s.importable])));
      setModos(Object.fromEntries(r.secciones.map((s) => [s.seccion, s.modoSugerido ?? "anadir"])));
    } catch (e) {
      setPaquete(null);
      setError(e instanceof SyntaxError ? "No se pudo leer el archivo: no es un JSON válido." : textoError(e));
    } finally {
      setTrabajando(null);
    }
  };

  const cotejar = async () => {
    setError(null);
    invalidar();
    setTrabajando("cotejar");
    try {
      const { extra } = await llamar("/api/admin/datos/lote", { method: "POST", cuerpo: { accion: "cotejar", paquete, elecciones } });
      setResultado(extra.resultado as ResultadoLote);
    } catch (e) {
      setError(textoError(e));
    } finally {
      setTrabajando(null);
    }
  };

  const aplicar = async () => {
    setError(null);
    setTrabajando("aplicar");
    try {
      const { extra } = await llamar("/api/admin/datos/lote", { method: "POST", cuerpo: { accion: "aplicar", paquete, elecciones, confirmacion: palabra } });
      const r = extra.resultado as ResultadoLote;
      const copia = extra.copia as { nombre: string } | null;
      const total = r.informes.reduce((a, i) => ({ nuevos: a.nuevos + i.nuevos, actualizados: a.actualizados + i.actualizados, eliminados: a.eliminados + i.eliminados }), { nuevos: 0, actualizados: 0, eliminados: 0 });
      mostrar(`✅ Importación en lote terminada (${r.informes.length} secciones): ${numero(total.nuevos)} nuevos, ${numero(total.actualizados)} actualizados${total.eliminados ? `, ${numero(total.eliminados)} eliminados` : ""}.${copia ? ` Copia de seguridad previa: ${copia.nombre}.` : ""}`);
      alTerminar();
      alCerrar();
    } catch (e) {
      setError(`No se ha importado nada. ${textoError(e)}`);
      mostrar("No se ha importado nada: mira el motivo en la ventana.", "error");
    } finally {
      setTrabajando(null);
    }
  };

  const hayCambios = !!resultado && resultado.informes.some((i) => i.nuevos + i.actualizados + i.eliminados > 0);
  const puedeAplicar = hayCambios && resultado?.fallos.length === 0 && trabajando === null;
  const doble = useDobleConfirmacion(() => void aplicar());
  const informePor = new Map((resultado?.informes ?? []).map((i) => [i.seccion, i]));
  const falloPor = new Map((resultado?.fallos ?? []).map((f) => [f.seccion, f.motivo]));

  return (
    <Modal
      titulo="📥 Importar en lote"
      ancho="900px"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={trabajando === "aplicar"}>
            Cancelar
          </button>
          <button type="button" className="btn btn-secondary" disabled={!resumen || elecciones.length === 0 || trabajando !== null} onClick={() => void cotejar()} title="Calcula exactamente qué crearía, actualizaría u omitiría cada sección elegida, sin cambiar nada.">
            {trabajando === "cotejar" ? "Cotejando…" : "🔍 Cotejar lo elegido"}
          </button>
          <button type="button" className="btn btn-primary" disabled={!puedeAplicar} onClick={doble.pulsar} style={doble.armado ? { background: "var(--danger)", borderColor: "var(--danger)" } : undefined} title={hayCambios ? "Aplica todo lo cotejado de una vez: si algo falla no queda nada a medias. Antes se guardan una copia de seguridad y una copia interna de cada sección. Hay que pulsar dos veces." : "Primero coteja lo elegido."}>
            {trabajando === "aplicar" ? "Importando…" : doble.armado ? TEXTO_SEGUNDO_CLIC : "Sí, importar lo elegido"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.9rem" }}>
        <div style={{ color: "var(--text-secondary)" }}>
          Elige un archivo <b>.json</b> exportado con «Exportar todo» (o el de una sola sección). Marca <b>qué secciones quieres</b> y con qué modo, pulsa <b>Cotejar</b> para ver exactamente qué pasaría y, si te cuadra, confirma. Se importa todo junto o nada.
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <label className="btn btn-secondary" style={{ ...botonChico, cursor: "pointer" }} title="Elige en tu equipo el archivo .json. Se lee aquí y no cambia nada todavía.">
            📂 Elegir archivo…
            <input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => void elegirArchivo(e)} disabled={trabajando !== null} />
          </label>
          <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
            {nombre || "Ningún archivo elegido"}
            {resumen?.exportadoEn ? ` · exportado el ${new Date(resumen.exportadoEn).toLocaleString("es-ES")}` : ""}
            {resumen?.version ? ` · versión ${resumen.version}` : ""}
          </span>
        </div>
        {trabajando === "leer" && <div style={{ color: "var(--text-muted)" }}>Leyendo el archivo…</div>}
        {error && (
          <div role="alert" style={{ padding: "10px 12px", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.08)", color: "var(--danger)" }}>
            🛑 {error}
          </div>
        )}

        {resumen && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {resumen.secciones.map((s) => {
              const inf = informePor.get(s.seccion);
              const fallo = falloPor.get(s.seccion);
              return (
                <div key={s.seccion} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px", opacity: s.importable && !marcadas[s.seccion] ? 0.65 : 1 }}>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 600, cursor: s.importable ? "pointer" : "default", flex: "1 1 260px" }} title={INFO_SECCIONES[s.seccion].descripcion}>
                      <input
                        type="checkbox"
                        checked={!!marcadas[s.seccion]}
                        disabled={!s.importable || trabajando !== null}
                        onChange={(e) => {
                          setMarcadas((p) => ({ ...p, [s.seccion]: e.target.checked }));
                          invalidar();
                        }}
                        style={{ accentColor: "var(--primary)" }}
                      />
                      {ICONOS[s.seccion]} {s.titulo}
                      <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.82rem" }}>{numero(s.registros)} en el archivo</span>
                    </label>
                    {s.importable ? (
                      <select
                        className="form-input"
                        value={modos[s.seccion] ?? s.modoSugerido ?? "anadir"}
                        disabled={trabajando !== null}
                        onChange={(e) => {
                          setModos((p) => ({ ...p, [s.seccion]: e.target.value as Modo }));
                          invalidar();
                        }}
                        title="Cómo se importa esta sección: solo lo nuevo, nuevo y actualizado, o que quede igual que el archivo (elimina lo que no esté)."
                        style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                      >
                        {s.modos.map((m) => (
                          <option key={m} value={m}>
                            {TEXTO_MODO[m]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Solo para consultar: no se importa.</span>
                    )}
                  </div>
                  {s.aviso && marcadas[s.seccion] && <div style={{ fontSize: "0.78rem", color: "var(--warning)" }}>⚠️ {s.aviso}</div>}
                  {fallo && <div style={{ fontSize: "0.82rem", color: "var(--danger)" }}>🛑 No se puede importar: {fallo}</div>}
                  {inf && <CotejoSeccion informe={inf} />}
                </div>
              );
            })}
          </div>
        )}

        {resultado && !hayCambios && resultado.fallos.length === 0 && <div style={{ color: "var(--text-secondary)" }}>Lo elegido ya está igual en la aplicación: no hay nada que importar.</div>}
        {resultado && hayCambios && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--border-light)", paddingTop: "12px" }}>
            {resultado.fallos.length > 0 ? (
              <div style={{ color: "var(--danger)" }}>🛑 Hay secciones que no se pueden importar: quítalas de la elección (o corrige el archivo) para poder aplicar.</div>
            ) : (
              <>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Antes de aplicar se guardan una copia de seguridad nueva y una copia interna de cada sección elegida. {palabra === "SUSTITUIR" && <b style={{ color: "var(--danger)" }}>Alguna sección está en «Sustituir»: eliminará lo que no esté en el archivo. </b>}
                  Al pulsar «Sí, importar lo elegido» se te pedirá confirmar una segunda vez.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function CotejoSeccion({ informe }: { informe: Informe }) {
  const celda = (etiqueta: string, valor: number, color?: string) => (
    <span key={etiqueta} style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
      {etiqueta}: <b style={{ color: valor > 0 ? color : "var(--text-muted)" }}>{numero(valor)}</b>
    </span>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", background: "var(--bg-surface-tint)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {celda("Nuevos", informe.nuevos, "var(--success)")}
        {celda("Se actualizan", informe.actualizados, "var(--primary)")}
        {celda("Ya iguales", informe.sinCambios)}
        {celda("Omitidos", informe.omitidos, "var(--warning)")}
        {informe.eliminados > 0 && celda("Se eliminan", informe.eliminados, "var(--danger)")}
      </div>
      {(informe.muestra.length > 0 || informe.totalErrores > 0 || informe.avisos.length > 0) && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: "0.82rem", color: "var(--primary)" }}>Ver detalle ({informe.muestra.length} cambios de muestra{informe.totalErrores > 0 ? `, ${numero(informe.totalErrores)} con error` : ""})</summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: "18px", fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: "2px" }}>
            {informe.muestra.map((m, i) => (
              <li key={`m${i}`} style={{ color: m.accion === "elimina" ? "var(--danger)" : m.accion === "omite" ? "var(--text-muted)" : undefined }}>
                {m.texto}
              </li>
            ))}
            {informe.errores.map((e, i) => (
              <li key={`e${i}`} style={{ color: "var(--danger)" }}>
                {e}
              </li>
            ))}
            {informe.avisos.map((a, i) => (
              <li key={`a${i}`} style={{ color: "var(--warning)" }}>
                {a}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
