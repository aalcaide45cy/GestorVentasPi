"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { llamar, textoError } from "@/components/comisiones/api";
import { useToast } from "@/components/Toast";
import type { ExpedienteDto } from "@/lib/dto";
import AyudaSemaforo from "./AyudaSemaforo";
import { EtiquetaApunte, MarcaEstado } from "./etiqueta-apunte";
import type { EstadoSemaforo, PredefinidoDto } from "@/lib/servicios/apuntes";

const COLORES_SEMAFORO = ["#ef4444", "#eab308", "#22c55e", "#9ca3af"];

type ApunteLista = NonNullable<ExpedienteDto["apuntes"]>[number];

/**
 * Ventana que se abre al pulsar una etiqueta de apunte con forma de semáforo (por ejemplo SEGURO) en la lista de Expedientes: cambia el estado de ESE expediente
 * (rojo, amarillo, verde…) y, abajo, el color y el significado de cada estado (esto último vale para todos los expedientes y solo lo guarda el administrador).
 */
export default function ModalApunte({ apunte, cliente, alCerrar }: { apunte: ApunteLista; idExpediente: number; cliente: string; alCerrar: () => void }) {
  const { mostrar } = useToast();
  const [estados, setEstados] = useState<EstadoSemaforo[]>(apunte.estados ?? []);
  const estadoGuardado = apunte.estado_semaforo ?? 0;
  const [elegido, setElegido] = useState<number>(estadoGuardado);
  const [comentario, setComentario] = useState(apunte.comentario ?? "");
  const [ocupado, setOcupado] = useState(false);
  const cambiado = JSON.stringify(estados) !== JSON.stringify(apunte.estados ?? []);

  const guardar = async (estadoElegido: number = elegido) => {
    setOcupado(true);
    try {
      await llamar(`/api/expedientes/apuntes?id=${apunte.id}`, { method: "PUT", cuerpo: { accion: "estado", estado_semaforo: estadoElegido, comentario } });
      mostrar(`${cliente ? `${cliente} · ` : ""}${apunte.titulo}: ${estados[estadoElegido]?.texto ?? ""}${comentario.trim() ? " (con comentario)" : ""}`);
      alCerrar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };
  const sinCambios = elegido === estadoGuardado && comentario.trim() === (apunte.comentario ?? "").trim();

  const guardarColores = async () => {
    if (apunte.id_predefinido === null) return;
    setOcupado(true);
    try {
      const { data: lista } = await llamar<PredefinidoDto[]>("/api/admin/apuntes-predefinidos");
      const p = lista.find((x) => x.id === apunte.id_predefinido);
      if (!p) throw new Error("No se encuentra el apunte predefinido");
      await llamar(`/api/admin/apuntes-predefinidos?id=${p.id}`, {
        method: "PUT",
        cuerpo: { titulo: p.titulo, descripcion: p.descripcion, etiqueta: p.etiqueta, color: p.color, mostrar_etiqueta: p.mostrar_etiqueta, rapido: p.rapido, por_defecto: p.por_defecto, semaforo: true, semaforo_estados: estados, lado: p.lado, estilo_etiqueta: p.estilo_etiqueta, colorear_emoticonos: p.colorear_emoticonos, estado_inicial: p.estado_inicial },
      });
      mostrar("Colores y significados guardados para todos los expedientes.");
      alCerrar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  const contenido = (
    <div role="dialog" aria-modal="true" onClick={alCerrar} style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(100%, 520px)", maxHeight: "90vh", overflowY: "auto", padding: "22px", display: "flex", flexDirection: "column", gap: "14px", background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", boxShadow: "0 18px 50px rgba(0, 0, 0, 0.45)", opacity: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
              {apunte.titulo} · <span style={{ fontWeight: 500 }}>{cliente}</span>
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>Elige en qué estado está este expediente y, si quieres, deja un comentario. Con doble clic en un estado se elige y se guarda solo.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={alCerrar} aria-label="Cerrar" style={{ padding: "2px 10px" }}>
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {estados.map((e, i) => (
            <button
              key={i}
              type="button"
              disabled={ocupado}
              onClick={() => setElegido(i)}
              onDoubleClick={() => void guardar(i)}
              title="Doble clic: elige este estado y guarda"
              style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "var(--radius-sm)", border: `2px solid ${i === elegido ? e.color : "var(--border-light)"}`, background: i === elegido ? `${e.color}22` : "var(--bg-card)", color: "var(--text-primary)", textAlign: "left", cursor: "pointer", fontSize: "0.92rem", fontWeight: i === elegido ? 700 : 500 }}
            >
              <MarcaEstado estado={e} />
              {e.texto}
              {i === estadoGuardado && <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--text-secondary)" }}>actual</span>}
            </button>
          ))}
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          Comentario del estado <span style={{ fontWeight: 400 }}>(opcional; saldrá al pasar el ratón por la etiqueta)</span>
          <textarea className="form-input" rows={2} maxLength={1000} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ej. Incidencia: falta el DNI del cliente" style={{ resize: "vertical" }} />
        </label>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={ocupado} style={{ padding: "6px 16px" }}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={ocupado || sinCambios} style={{ padding: "6px 18px" }} title={sinCambios ? "No has cambiado nada" : "Guarda el estado y el comentario"}>
            Guardar
          </button>
        </div>

        <AyudaSemaforo completa={false} />

        <details style={{ borderTop: "1px solid var(--border-light)", paddingTop: "10px" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>🎨 Cambiar el color y el significado de cada estado</summary>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "8px 0" }}>Vale para todos los expedientes. Solo lo guarda el administrador.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {estados.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <select className="form-input" value={e.modo ?? "color"} onChange={(ev) => setEstados((l) => l.map((x, j) => (j === i ? { ...x, modo: ev.target.value === "icono" ? "icono" : ev.target.value === "icono_fondo" ? "icono_fondo" : ev.target.value === "texto" ? "texto" : "color" } : x)))} aria-label={`Cómo se muestra el estado ${i + 1}`} style={{ width: "auto" }}>
                  <option value="color">Fondo</option>
                  <option value="icono">Icono</option>
                  <option value="icono_fondo">Icono + fondo</option>
                  <option value="texto">Solo mi texto</option>
                </select>
                {(e.modo === "icono" || e.modo === "icono_fondo" || e.modo === "texto") && (
                  <input className="form-input" maxLength={e.modo === "texto" ? 24 : 8} value={e.icono ?? ""} onChange={(ev) => setEstados((l) => l.map((x, j) => (j === i ? { ...x, icono: ev.target.value } : x)))} placeholder="✅" aria-label={`Icono del estado ${i + 1}`} style={{ width: e.modo === "texto" ? "130px" : "62px", textAlign: "center" }} />
                )}
                {e.modo !== "icono" && (
                  <input type="color" value={e.color} onChange={(ev) => setEstados((l) => l.map((x, j) => (j === i ? { ...x, color: ev.target.value } : x)))} aria-label={`Color del estado ${i + 1}`} style={{ width: "34px", height: "28px", padding: 0, border: "none", background: "none", flex: "0 0 auto" }} />
                )}
                <input className="form-input" maxLength={80} value={e.texto} onChange={(ev) => setEstados((l) => l.map((x, j) => (j === i ? { ...x, texto: ev.target.value } : x)))} style={{ flex: 1, minWidth: 0 }} aria-label={`Significado del estado ${i + 1}`} />
                <select className="form-input" value={e.efecto ?? "ninguno"} onChange={(ev) => setEstados((l) => l.map((x, j) => (j === i ? { ...x, efecto: ev.target.value as EstadoSemaforo["efecto"] } : x)))} aria-label={`Efecto del estado ${i + 1}`} title="Efecto animado de la etiqueta en este estado" style={{ width: "auto" }}>
                  <option value="ninguno">Sin efecto</option>
                  <option value="parpadeo">Parpadeo</option>
                  <option value="pulso">Pulso</option>
                  <option value="destello">Destello</option>
                  <option value="latido">Latido</option>
                  <option value="brillo">Brillo</option>
                </select>
                <EtiquetaApunte etiqueta={apunte.etiqueta} color={e.color} estilo={apunte.estilo} colorearEmoticonos={apunte.colorear_emoticonos} estado={e} />
                <label title="Si está marcado, la etiqueta se ve tenue (como apagada)" style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={e.apagado === true} onChange={(ev) => setEstados((l) => l.map((x, j) => (j === i ? { ...x, apagado: ev.target.checked } : x)))} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
                  Tenue
                </label>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setEstados((l) => l.map((x, i) => ({ ...x, color: COLORES_SEMAFORO[i] ?? "#3b82f6" })))} style={{ marginTop: "8px", padding: "3px 10px", fontSize: "0.78rem" }} title="Vuelve a poner los colores en rojo, amarillo, verde y gris (los significados no cambian)">
            ↺ Restablecer los colores del semáforo
          </button>
          {cambiado && (
            <button type="button" className="btn btn-primary" disabled={ocupado || estados.some((e) => e.texto.trim() === "")} onClick={() => void guardarColores()} style={{ marginTop: "10px", padding: "5px 14px", fontSize: "0.82rem" }}>
              Guardar colores y significados
            </button>
          )}
        </details>
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(contenido, document.body);
}
