"use client";

import { useEffect, useState } from "react";
import { Plegable } from "@/components/admin/estructura";
import { useToast } from "@/components/Toast";
import { useCarga } from "@/components/comisiones/useCarga";
import type { EstadoReenvio } from "@/lib/servicios/incidencias-remotas";

async function accion(cuerpo: unknown): Promise<EstadoReenvio> {
  const r = await fetch("/api/admin/incidencias/reenvio", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const j = (await r.json().catch(() => ({}))) as { message?: string; data?: EstadoReenvio };
  if (!r.ok || !j.data) throw new Error(j.message ?? `Error ${r.status}`);
  return j.data;
}

/**
 * «Reportes desde otros equipos»: el servidor principal (el PC) recibe aquí los reportes de fallo que se hacen desde el Mac, la Raspberry u otro equipo.
 * En el equipo secundario se escribe la dirección del principal y su clave; en el principal se crea esa clave.
 */
export default function PanelReenvioIncidencias() {
  const { mostrar } = useToast();
  const { datos, recargar } = useCarga<EstadoReenvio | null>("/api/admin/incidencias/reenvio", null);
  const [estado, setEstado] = useState<EstadoReenvio | null>(null);
  // Lo que se escribe; mientras no se toque, se ve lo guardado
  const [urlEscrita, setUrl] = useState<string | null>(null);
  const [clave, setClave] = useState("");
  const [nombreEscrito, setNombre] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const e = estado ?? datos;
  const url = urlEscrita ?? e?.urlPrincipal ?? "";
  const nombre = nombreEscrito ?? e?.nombreEquipo ?? "";
  // Se refresca solo cada 20 segundos (la cola de pendientes va bajando sola)
  useEffect(() => {
    const t = setInterval(recargar, 20_000);
    return () => clearInterval(t);
  }, [recargar]);

  const hacer = async (cuerpo: unknown, ok: string) => {
    setOcupado(true);
    try {
      setEstado(await accion(cuerpo));
      mostrar(ok);
    } catch (er) {
      mostrar(er instanceof Error ? er.message : "No se ha podido hacer.", "error");
    } finally {
      setOcupado(false);
    }
  };
  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      mostrar("Copiado.");
    } catch {
      mostrar("No se ha podido copiar: selecciónalo y cópialo a mano.", "aviso");
    }
  };

  const resumen = e ? `${e.recibe ? "recibe reportes de otros equipos" : "no recibe"} · ${e.envia ? `reenvía los suyos${e.pendientes > 0 ? ` (${e.pendientes} en cola)` : ""}` : "no reenvía"}` : "";
  return (
    <Plegable id="incidencias-reenvio" titulo="📡 Reportes desde otros equipos" resumen={resumen} abiertoPorDefecto={false}>
      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: "18px", fontSize: "0.9rem", lineHeight: 1.5 }}>
        <p style={{ margin: 0, color: "var(--text-secondary)" }}>
          Si usas la aplicación en varios equipos (el PC, el Mac, la Raspberry), cada uno guarda sus propios datos. Con esto, <b>los reportes de fallo con captura que haces desde un equipo secundario llegan solos al servidor principal</b> (el PC), y los ves todos aquí. Si en ese momento no hay conexión, el reporte se queda guardado en el equipo y se reintenta cada minuto hasta que llega.
        </p>

        <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <strong>1 · En el servidor principal (el PC): recibir reportes</strong>
          {e?.recibe && e.claveRecepcion ? (
            <>
              <span>Clave para los otros equipos (cópiala y pégala en ellos):</span>
              <code style={{ padding: "6px 10px", background: "var(--bg-surface-tint)", borderRadius: "var(--radius-sm)", wordBreak: "break-all" }}>{e.claveRecepcion}</code>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-secondary" onClick={() => void copiar(e.claveRecepcion as string)}>
                  📋 Copiar la clave
                </button>
                <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => void hacer({ accion: "generar_clave" }, "Clave nueva creada: los otros equipos deberán usar la nueva.")} title="La clave anterior deja de valer">
                  🔄 Crear una clave nueva
                </button>
                <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => void hacer({ accion: "quitar_clave" }, "Este servidor ya no recibe reportes de otros equipos.")} style={{ color: "var(--danger)" }}>
                  ⛔ Dejar de recibir
                </button>
              </div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>La dirección de este servidor para ponerla en los otros equipos es la que usas para entrar desde fuera (por ejemplo la de Tailscale Funnel), sin nada detrás: solo «https://…».</span>
            </>
          ) : (
            <div>
              <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void hacer({ accion: "generar_clave" }, "Clave creada. Cópiala en los otros equipos.")}>
                🔑 Empezar a recibir reportes de otros equipos
              </button>
            </div>
          )}
        </div>

        <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <strong>2 · En un equipo secundario (el Mac…): reenviar sus reportes al principal</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
            <label className="form-group" style={{ marginBottom: 0 }}>
              <span className="form-label">Dirección del servidor principal</span>
              <input className="form-input" value={url} onChange={(ev) => setUrl(ev.target.value)} placeholder="https://pcamd.tail047528.ts.net" autoComplete="off" />
            </label>
            <label className="form-group" style={{ marginBottom: 0 }}>
              <span className="form-label">Clave de recepción {e?.envia ? "(ya guardada; déjala vacía para conservarla)" : ""}</span>
              <input className="form-input" type="password" value={clave} onChange={(ev) => setClave(ev.target.value)} placeholder="La que te da el principal" autoComplete="new-password" />
            </label>
            <label className="form-group" style={{ marginBottom: 0 }}>
              <span className="form-label">Nombre de este equipo</span>
              <input className="form-input" value={nombre} onChange={(ev) => setNombre(ev.target.value)} placeholder="Mac de Alfonso" autoComplete="off" />
            </label>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" disabled={ocupado || (!url.trim() && !e?.envia)} onClick={() => void hacer({ accion: "guardar_destino", destino: { url, clave, nombreEquipo: nombre } }, url.trim() ? "Guardado. Desde ahora los reportes de este equipo se reenvían al principal." : "Reenvío desactivado.")}>
              💾 Guardar
            </button>
            <button type="button" className="btn btn-secondary" disabled={ocupado || !e?.envia} onClick={() => void hacer({ accion: "probar" }, "Conexión correcta: el servidor principal acepta los reportes de este equipo.")} title="Manda un aviso de prueba (no queda anotado en el principal)">
              🔌 Probar la conexión
            </button>
            <button type="button" className="btn btn-secondary" disabled={ocupado || !e?.envia || e.pendientes === 0} onClick={() => void hacer({ accion: "reenviar_ahora" }, "Reintento hecho.")}>
              ⏩ Reenviar ahora ({e?.pendientes ?? 0})
            </button>
          </div>
          {e?.envia && (
            <span style={{ color: e.ultimoError ? "var(--danger)" : "var(--text-muted)", fontSize: "0.85rem" }}>
              {e.pendientes > 0 ? `${e.pendientes} reporte(s) esperando a llegar al principal. ` : "No hay reportes en cola. "}
              {e.ultimoError ? `Último intento fallido: ${e.ultimoError}. Se reintenta cada minuto.` : e.ultimoEnvio ? `Último envío correcto: ${new Date(e.ultimoEnvio).toLocaleString("es-ES")}.` : ""}
            </span>
          )}
        </div>
      </div>
    </Plegable>
  );
}
