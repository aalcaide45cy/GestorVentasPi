"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import BotonesBackup from "@/components/BotonesBackup";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { useCarga } from "@/components/comisiones/useCarga";
import type { InfoSeccion, Informe, Modo, Seccion } from "@/lib/servicios/intercambio";

interface SeccionDatos extends InfoSeccion {
  seccion: Seccion;
  registros: number;
}
interface PlanElegible {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
}
interface Datos {
  secciones: SeccionDatos[];
  planes: PlanElegible[];
}

const VACIO: Datos = { secciones: [], planes: [] };

const ICONOS: Record<Seccion, string> = { clientes: "👥", expedientes: "📁", marcas_modelos: "🚗", tipos_venta: "💳", estados: "🏷️", tiendas: "🏬", planes: "🎯", rejillas: "🧾", ajustes: "⚙️", usuarios: "🧑‍💼" };

const MODOS: Record<Modo, { titulo: string; ayuda: string }> = {
  anadir: { titulo: "Añadir solo lo nuevo", ayuda: "Crea lo que no existe y deja tal cual lo que ya existe. Es lo más seguro." },
  actualizar: { titulo: "Añadir y actualizar", ayuda: "Crea lo nuevo y modifica lo que ya existe con los datos del archivo (lo que no esté en el archivo no se toca)." },
  sustituir: { titulo: "Sustituir (que quede igual que el archivo)", ayuda: "Crea lo nuevo, actualiza lo existente y ELIMINA lo que no esté en el archivo. Es la opción más delicada." },
};

const boton = { padding: "8px 14px", fontSize: "0.85rem" } as const;

const numero = (n: number) => n.toLocaleString("es-ES");

/** «Datos por secciones»: exportar e importar cada tipo de datos por separado (con vista previa y copia previa automática). */
export default function PanelDatos() {
  const router = useRouter();
  const { mostrar } = useToast();
  const { datos, recargar } = useCarga<Datos>("/api/admin/datos", VACIO);
  const [ocupado, setOcupado] = useState(false);
  const [exportando, setExportando] = useState<SeccionDatos | null>(null);
  const [elegidos, setElegidos] = useState<number[] | null>(null);
  const [importando, setImportando] = useState<SeccionDatos | null>(null);

  const descargar = async (s: SeccionDatos, ids: number[] | null) => {
    setOcupado(true);
    try {
      const res = await fetch(`/api/admin/datos/exportar?seccion=${s.seccion}${ids && ids.length > 0 ? `&ids=${ids.join(",")}` : ""}`);
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? "No se pudo exportar.");
      const registros = res.headers.get("X-Registros") ?? "";
      const nombre = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `gv_${s.seccion}.json`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      mostrar(`✅ Exportados ${numero(Number(registros))} ${s.plural} al archivo ${nombre} (se ha descargado en tu equipo).`);
      setExportando(null);
      setElegidos(null);
    } catch (e) {
      mostrar(`No se ha exportado nada. ${textoError(e)}`, "error");
    } finally {
      setOcupado(false);
    }
  };

  const abrirExportar = (s: SeccionDatos) => {
    setElegidos(null);
    setExportando(s);
  };

  const numExportar = exportando ? (exportando.seccion === "planes" && elegidos !== null ? elegidos.length : exportando.registros) : 0;

  return (
    <div id="datos-por-secciones" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>📦 Exportar e importar datos por secciones</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
          Cada sección se puede <b>exportar</b> a un archivo (.json) y <b>volver a importar</b> más tarde, aquí o en otra instalación, sin tocar el resto de los datos. Antes de aplicar una importación siempre ves una <b>vista previa</b> de lo que cambiará y se hace una <b>copia de seguridad automática</b> del estado actual.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px", border: "1px solid var(--border-light)" }}>
        <div style={{ fontWeight: 700 }}>🗄️ Toda la aplicación</div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Para guardar o restaurar <b>todo</b> a la vez tienes dos opciones. La <b>copia completa (.dump)</b> es la más segura y la recomendada: incluye todo, se valida al crearla y está justo debajo, en «Copias de seguridad». La <b>copia completa en JSON</b> es legible y sirve para llevar los datos a otro equipo, pero <b>incluye las contraseñas cifradas y los secretos del doble factor</b>: guárdala en un sitio seguro y guarda también el archivo .env (o al menos APP_SECRET).
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <a className="btn btn-primary" style={boton} href="#copias-de-seguridad" title="Baja a «Copias de seguridad»: crea una copia completa (.dump) de toda la aplicación, descárgala, súbela o restáurala. Es la forma más segura de guardar todo.">
            💾 Copia completa (.dump)…
          </a>
          <BotonesBackup deshabilitado={ocupado} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "14px" }} className="rejilla-propia">
        {datos.secciones.map((s) => (
          <div key={s.seccion} className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px", border: "1px solid var(--border-light)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
              <strong>
                {ICONOS[s.seccion]} {s.titulo}
              </strong>
              <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", whiteSpace: "nowrap" }}>{numero(s.registros)} registros</span>
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.45, flex: 1 }}>{s.descripcion}</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={boton}
                disabled={ocupado}
                onClick={() => abrirExportar(s)}
                title={`Descarga un archivo .json con ${s.plural === "planes de comisionamiento" ? "los planes elegidos" : `los ${s.plural}`} (${numero(s.registros)} registros). No borra ni cambia nada: sirve para guardar una copia solo de esta sección o llevarla a otra instalación.`}
              >
                📤 Exportar {s.plural}
              </button>
              {s.importable ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={boton}
                  disabled={ocupado}
                  onClick={() => setImportando(s)}
                  title={`Lee un archivo .json exportado antes (de esta u otra instalación), te enseña qué va a cambiar en «${s.titulo}» y solo lo aplica si lo confirmas. Antes se hace una copia de seguridad automática. Úsalo para recuperar o cargar ${s.plural} sin tocar el resto.`}
                >
                  📥 Importar {s.plural}…
                </button>
              ) : (
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", alignSelf: "center" }}>Solo se exporta (para consultar)</span>
              )}
            </div>
            {s.aviso && <div style={{ fontSize: "0.75rem", color: "var(--warning)" }}>⚠️ {s.aviso}</div>}
          </div>
        ))}
      </div>

      {exportando && (
        <Modal
          titulo={`📤 Exportar ${exportando.plural}`}
          ancho="560px"
          pie={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setExportando(null)} disabled={ocupado}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void descargar(exportando, elegidos)} disabled={ocupado || numExportar === 0}>
                {ocupado ? "Exportando…" : `Sí, exportar ${numero(numExportar)}`}
              </button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
            <div>
              Se van a exportar <b>{numero(numExportar)} {exportando.plural}</b> a un archivo <b>.json</b> que se descargará en tu equipo. No se borra ni se cambia nada en la aplicación.
            </div>
            {exportando.seccion === "planes" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer" }} title="Exporta todos los planes de comisionamiento en un solo archivo.">
                  <input type="radio" name="planes" checked={elegidos === null} onChange={() => setElegidos(null)} /> Todos los planes ({numero(datos.planes.length)})
                </label>
                <label style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer" }} title="Elige uno o varios planes concretos para exportarlos.">
                  <input type="radio" name="planes" checked={elegidos !== null} onChange={() => setElegidos([])} /> Elegir planes concretos
                </label>
                {elegidos !== null && (
                  <div style={{ maxHeight: "220px", overflowY: "auto", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {datos.planes.map((p) => (
                      <label key={p.id} style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer", fontSize: "0.85rem" }}>
                        <input type="checkbox" checked={elegidos.includes(p.id)} onChange={(e) => setElegidos((prev) => (e.target.checked ? [...(prev ?? []), p.id] : (prev ?? []).filter((x) => x !== p.id)))} />
                        <span>
                          {p.nombre} <span style={{ color: "var(--text-muted)" }}>({p.fechaInicio} a {p.fechaFin} · {p.estado})</span>
                        </span>
                      </label>
                    ))}
                    {datos.planes.length === 0 && <span style={{ color: "var(--text-muted)" }}>Todavía no hay planes.</span>}
                  </div>
                )}
              </div>
            )}
            {exportando.aviso && (
              <div style={{ padding: "10px 12px", borderLeft: "4px solid var(--warning)", background: "var(--bg-card)", fontSize: "0.85rem" }}>⚠️ {exportando.aviso}</div>
            )}
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>El archivo no incluye contraseñas ni claves. Podrás volver a importarlo desde «Importar {exportando.plural}…».</div>
          </div>
        </Modal>
      )}

      {importando && (
        <ModalImportar
          seccion={importando}
          alCerrar={() => setImportando(null)}
          alTerminar={() => {
            recargar();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Importar: archivo → vista previa → confirmación → aplicar           */
/* ------------------------------------------------------------------ */

function ModalImportar({ seccion, alCerrar, alTerminar }: { seccion: SeccionDatos; alCerrar: () => void; alTerminar: () => void }) {
  const { mostrar } = useToast();
  const [paquete, setPaquete] = useState<unknown>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [modo, setModo] = useState<Modo>("anadir");
  const [informe, setInforme] = useState<Informe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const palabra = modo === "sustituir" ? "SUSTITUIR" : "IMPORTAR";

  const previsualizar = async (p: unknown, m: Modo) => {
    setTrabajando(true);
    setError(null);
    setInforme(null);
    try {
      const { extra } = await llamar("/api/admin/datos/importar", { method: "POST", cuerpo: { paquete: p, modo: m, aplicar: false, seccion: seccion.seccion } });
      setInforme(extra.informe as Informe);
    } catch (e) {
      setError(textoError(e));
    } finally {
      setTrabajando(false);
    }
  };

  const elegirArchivo = async (ev: ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!archivo) return;
    setError(null);
    setInforme(null);
    setConfirmacion("");
    try {
      const p = JSON.parse(await archivo.text()) as unknown;
      setPaquete(p);
      setNombreArchivo(archivo.name);
      await previsualizar(p, modo);
    } catch {
      setPaquete(null);
      setError("No se pudo leer el archivo: no es un JSON válido.");
    }
  };

  const cambiarModo = (m: Modo) => {
    setModo(m);
    setConfirmacion("");
    if (paquete) void previsualizar(paquete, m);
  };

  const aplicar = async () => {
    if (!paquete) return;
    setTrabajando(true);
    setError(null);
    try {
      const { extra } = await llamar("/api/admin/datos/importar", { method: "POST", cuerpo: { paquete, modo, aplicar: true, seccion: seccion.seccion, confirmacion } });
      const r = extra.informe as Informe;
      const copia = extra.copia as { nombre: string; creadaAhora: boolean } | null;
      mostrar(
        `✅ Importación de ${seccion.plural} terminada: ${numero(r.nuevos)} nuevos, ${numero(r.actualizados)} actualizados, ${numero(r.sinCambios)} sin cambios${r.eliminados ? `, ${numero(r.eliminados)} eliminados` : ""}${r.omitidos ? `, ${numero(r.omitidos)} omitidos` : ""}.${copia ? ` Copia de seguridad previa: ${copia.nombre}.` : ""}`,
      );
      alTerminar();
      alCerrar();
    } catch (e) {
      setError(`No se ha importado nada. ${textoError(e)}`);
      mostrar("No se ha importado nada: mira el motivo en la ventana.", "error");
    } finally {
      setTrabajando(false);
    }
  };

  const hayCambios = !!informe && informe.nuevos + informe.actualizados + informe.eliminados > 0;
  const puedeAplicar = hayCambios && confirmacion.trim() === palabra && !trabajando;
  const fila = (etiqueta: string, valor: number, color?: string, ayuda?: string) => (
    <div key={etiqueta} title={ayuda} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "0.88rem" }}>
      <span style={{ color: "var(--text-secondary)" }}>{etiqueta}</span>
      <b style={{ color: valor > 0 ? color : "var(--text-muted)" }}>{numero(valor)}</b>
    </div>
  );

  return (
    <Modal
      titulo={`📥 Importar ${seccion.plural}`}
      ancho="720px"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={trabajando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={!puedeAplicar} onClick={() => void aplicar()} title={hayCambios ? "Aplica los cambios que ves en la vista previa. Antes se hace una copia de seguridad automática." : "Elige un archivo con cambios para poder aplicarlos."}>
            {trabajando ? "Trabajando…" : "Sí, aplicar importación"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.9rem", maxHeight: "68vh", overflowY: "auto", paddingRight: "4px" }}>
        <div style={{ color: "var(--text-secondary)" }}>
          Elige un archivo <b>.json</b> exportado desde «{seccion.titulo}» (de esta u otra instalación). Verás una <b>vista previa exacta</b> de lo que cambiará; <b>no se toca nada</b> hasta que confirmes.
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <label className="btn btn-secondary" style={{ ...boton, cursor: "pointer" }} title="Elige en tu equipo el archivo .json que exportaste antes. Se lee aquí y no cambia nada todavía.">
            📂 Elegir archivo…
            <input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => void elegirArchivo(e)} disabled={trabajando} />
          </label>
          <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{nombreArchivo || "Ningún archivo elegido"}</span>
        </div>

        <fieldset style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px" }} disabled={trabajando}>
          <legend style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "0 6px" }}>¿Cómo quieres importarlo?</legend>
          {seccion.modos.map((m) => (
            <label key={m} title={MODOS[m].ayuda} style={{ display: "flex", gap: "8px", alignItems: "flex-start", cursor: "pointer" }}>
              <input type="radio" name="modo-importacion" checked={modo === m} onChange={() => cambiarModo(m)} style={{ marginTop: "3px" }} />
              <span>
                <b style={{ color: m === "sustituir" ? "var(--danger)" : undefined }}>{MODOS[m].titulo}</b>
                <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{MODOS[m].ayuda}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {trabajando && !informe && <div style={{ color: "var(--text-muted)" }}>Analizando el archivo…</div>}
        {error && (
          <div role="alert" style={{ padding: "10px 12px", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.08)", color: "var(--danger)" }}>
            🛑 {error}
          </div>
        )}

        {informe && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontWeight: 700 }}>Vista previa: esto es lo que pasará (todavía no se ha cambiado nada)</div>
            <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {fila("Registros en el archivo", informe.total)}
              {fila("Se crearán (nuevos)", informe.nuevos, "var(--success)")}
              {fila("Se actualizarán", informe.actualizados, "var(--primary)")}
              {fila("Ya están igual (sin cambios)", informe.sinCambios)}
              {fila("Se omitirán (ya existen o tienen errores)", informe.omitidos, "var(--warning)", "No se importan. Los que tienen error se detallan abajo.")}
              {informe.eliminados > 0 && fila("Se eliminarán (no están en el archivo)", informe.eliminados, "var(--danger)")}
            </div>
            {informe.muestra.length > 0 && (
              <div style={{ fontSize: "0.82rem" }}>
                <div style={{ color: "var(--text-muted)", marginBottom: "4px" }}>Primeros cambios previstos:</div>
                <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "2px" }}>
                  {informe.muestra.map((m, i) => (
                    <li key={i} style={{ color: m.accion === "elimina" ? "var(--danger)" : m.accion === "omite" ? "var(--text-muted)" : undefined }}>
                      {m.texto}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {informe.totalErrores > 0 && (
              <div style={{ fontSize: "0.82rem", borderLeft: "4px solid var(--danger)", paddingLeft: "10px" }}>
                <div style={{ color: "var(--danger)", fontWeight: 700, marginBottom: "4px" }}>
                  {numero(informe.totalErrores)} registro(s) con errores (se omiten; el resto sí se importa)
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px" }}>
                  {informe.errores.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
                {informe.totalErrores > informe.errores.length && <div style={{ color: "var(--text-muted)" }}>…y {numero(informe.totalErrores - informe.errores.length)} más.</div>}
              </div>
            )}
            {informe.avisos.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "0.82rem", color: "var(--warning)" }}>
                {informe.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
            {modo === "sustituir" && (
              <div style={{ padding: "10px 12px", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.08)", fontSize: "0.85rem" }}>
                ⚠️ <b>Sustituir elimina</b> todo lo que no esté en el archivo. Antes se hará una copia de seguridad nueva con la que podrás volver atrás.
              </div>
            )}
            {hayCambios ? (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  Para aplicar, escribe <b>{palabra}</b>. Antes se hará una copia de seguridad automática del estado actual.
                </label>
                <input className="form-input" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} placeholder={palabra} style={{ maxWidth: "220px" }} />
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)" }}>No hay nada que importar con esta opción.</div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
