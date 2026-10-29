"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { usePreferencia } from "@/lib/preferencias";

/**
 * «Columnas y vistas» de la tabla de expedientes: ordenar las columnas (arrastrando o con las flechas), mostrarlas u ocultarlas,
 * volver a lo predeterminado y guardar vistas con nombre para cambiar de una configuración a otra con un clic.
 * Todo se recuerda en este navegador.
 */

export interface ConfigColumnas {
  orden: string[];
  visibles: Record<string, boolean>;
}

interface Vista extends ConfigColumnas {
  id: string;
  nombre: string;
}

export const CLAVE_VISTAS_COLUMNAS = "exp-column-views";

interface Props {
  columnas: { clave: string; etiqueta: string; ayuda?: string }[];
  actual: ConfigColumnas;
  predeterminada: ConfigColumnas;
  vistasIncluidas: { id: string; nombre: string; ayuda: string; config: ConfigColumnas }[];
  /** Dónde se guardan las vistas con nombre (por defecto, las de la tabla de expedientes). */
  claveVistas?: string;
  alCambiar: (c: ConfigColumnas) => void;
  alCerrar: () => void;
  /** Si se dan, cada columna lleva botones para hacerla más ancha o más estrecha (el ancho cambiado, y el de fábrica de cada una). */
  anchos?: Record<string, number>;
  anchosPorDefecto?: Record<string, number>;
  alCambiarAnchos?: (anchos: Record<string, number>) => void;
}

/** Completa un orden guardado con las columnas que falten (columnas nuevas de versiones posteriores) y quita las que ya no existen. */
export function normalizarOrden(guardado: string[] | null | undefined, todas: string[]): string[] {
  const conocidas = (guardado ?? []).filter((c, i, a) => todas.includes(c) && a.indexOf(c) === i);
  return [...conocidas, ...todas.filter((c) => !conocidas.includes(c))];
}

const igual = (a: ConfigColumnas, b: ConfigColumnas, claves: string[]): boolean => claves.every((c, i) => a.orden[i] === b.orden[i] && (a.visibles[c] !== false) === (b.visibles[c] !== false));

export default function PanelColumnas({ columnas, actual, predeterminada, vistasIncluidas, claveVistas = CLAVE_VISTAS_COLUMNAS, alCambiar, alCerrar, anchos, anchosPorDefecto, alCambiarAnchos }: Props) {
  const { mostrar } = useToast();
  const [guardadas, fijarGuardadas] = usePreferencia(claveVistas);
  const [nombre, setNombre] = useState("");
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const claves = columnas.map((c) => c.clave);
  const etiqueta = (clave: string) => columnas.find((c) => c.clave === clave)?.etiqueta ?? clave;

  const vistas: Vista[] = (() => {
    try {
      const v = guardadas ? (JSON.parse(guardadas) as Vista[]) : [];
      return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string" && typeof x.nombre === "string" && Array.isArray(x.orden)) : [];
    } catch {
      return [];
    }
  })();
  const guardarVistas = (v: Vista[]) => fijarGuardadas(JSON.stringify(v));

  const mover = (clave: string, destino: number) => {
    const resto = actual.orden.filter((c) => c !== clave);
    resto.splice(Math.max(0, Math.min(destino, resto.length)), 0, clave);
    alCambiar({ ...actual, orden: resto });
  };

  const aplicar = (c: ConfigColumnas, texto: string) => {
    alCambiar({ orden: normalizarOrden(c.orden, claves), visibles: Object.fromEntries(claves.map((k) => [k, c.visibles[k] !== false])) });
    mostrar(`✅ ${texto}`);
  };

  const guardarNueva = () => {
    const n = nombre.trim();
    if (!n) return;
    if (vistas.some((v) => v.nombre.toLowerCase() === n.toLowerCase())) {
      mostrar(`Ya tienes una vista llamada «${n}». Usa «Actualizar» en esa vista o elige otro nombre.`, "error");
      return;
    }
    guardarVistas([...vistas, { id: n.toLowerCase(), nombre: n, orden: actual.orden, visibles: actual.visibles }]);
    setNombre("");
    mostrar(`✅ Vista «${n}» guardada con el orden y las columnas de ahora.`);
  };

  const esPredeterminada = igual(actual, predeterminada, claves);
  const ocultas = claves.filter((c) => actual.visibles[c] === false).length;
  const chico = { padding: "4px 10px", fontSize: "0.78rem" } as const;

  return (
    <Modal
      titulo="⚙️ Columnas y vistas"
      ancho="900px"
      pie={
        <button type="button" className="btn btn-primary" onClick={alCerrar}>
          Listo
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.9rem" }}>
        <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Los cambios se ven al momento en la tabla. Arrastra <b>⠿</b> (o usa las flechas) para ordenar, marca la casilla para mostrar u ocultar y guarda tus combinaciones como <b>vistas</b>. Se recuerdan en este navegador.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px", alignItems: "start" }} className="rejilla-propia">
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <b>
                Columnas ({claves.length - ocultas} de {claves.length} visibles)
              </b>
              <button type="button" className="btn btn-secondary" style={chico} disabled={esPredeterminada} onClick={() => aplicar(predeterminada, "Columnas restauradas: orden y visibilidad predeterminados.")} title="Vuelve al orden y a las columnas con los que viene la aplicación. No borra tus vistas guardadas.">
                ↺ Restaurar predeterminado
              </button>
              {alCambiarAnchos && anchos && Object.keys(anchos).length > 0 && (
                <button type="button" className="btn btn-secondary" style={chico} onClick={() => { alCambiarAnchos({}); mostrar("✅ Anchos de columna restaurados."); }} title="Vuelve a los anchos de fábrica de todas las columnas">
                  ↔ Anchos de fábrica
                </button>
              )}
            </div>
            <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", maxHeight: "420px", overflowY: "auto" }}>
              {actual.orden.map((clave, i) => (
                <div
                  key={clave}
                  draggable
                  onDragStart={(e) => {
                    setArrastrando(clave);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (sobre !== clave) setSobre(clave);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (arrastrando && arrastrando !== clave) mover(arrastrando, actual.orden.indexOf(clave));
                    setArrastrando(null);
                    setSobre(null);
                  }}
                  onDragEnd={() => {
                    setArrastrando(null);
                    setSobre(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 10px",
                    borderBottom: "1px solid var(--border-light)",
                    background: sobre === clave && arrastrando && arrastrando !== clave ? "rgba(var(--primary-rgb), 0.15)" : undefined,
                    opacity: arrastrando === clave ? 0.4 : actual.visibles[clave] === false ? 0.55 : 1,
                  }}
                >
                  <span title="Arrastra para cambiar de sitio" style={{ cursor: "grab", color: "var(--text-muted)", fontSize: "1rem", userSelect: "none" }}>
                    ⠿
                  </span>
                  <label style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none" }} title={columnas.find((c) => c.clave === clave)?.ayuda ?? `Mostrar u ocultar la columna «${etiqueta(clave)}»`}>
                    <input type="checkbox" checked={actual.visibles[clave] !== false} onChange={(e) => alCambiar({ ...actual, visibles: { ...actual.visibles, [clave]: e.target.checked } })} style={{ width: "15px", height: "15px", accentColor: "var(--primary)" }} />
                    {etiqueta(clave)}
                  </label>
                  {anchosPorDefecto && alCambiarAnchos && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }} title="Ancho de la columna en la tabla (se guarda en tu perfil)">
                      <button type="button" className="btn btn-secondary" style={{ padding: "0 7px", fontSize: "0.7rem" }} disabled={(anchos?.[clave] ?? anchosPorDefecto[clave] ?? 100) <= 40} onClick={() => alCambiarAnchos({ ...anchos, [clave]: Math.max(40, (anchos?.[clave] ?? anchosPorDefecto[clave] ?? 100) - 10) })} title="Más estrecha" aria-label={`Hacer más estrecha la columna ${etiqueta(clave)}`}>
                        −
                      </button>
                      <span style={{ minWidth: "38px", textAlign: "center", fontSize: "0.72rem", color: anchos?.[clave] !== undefined ? "var(--primary)" : "var(--text-muted)" }}>{anchos?.[clave] ?? anchosPorDefecto[clave] ?? 100}</span>
                      <button type="button" className="btn btn-secondary" style={{ padding: "0 7px", fontSize: "0.7rem" }} disabled={(anchos?.[clave] ?? anchosPorDefecto[clave] ?? 100) >= 600} onClick={() => alCambiarAnchos({ ...anchos, [clave]: Math.min(600, (anchos?.[clave] ?? anchosPorDefecto[clave] ?? 100) + 10) })} title="Más ancha" aria-label={`Hacer más ancha la columna ${etiqueta(clave)}`}>
                        +
                      </button>
                    </span>
                  )}
                  <button type="button" className="btn btn-secondary" style={{ padding: "0 7px", fontSize: "0.7rem" }} disabled={i === 0} onClick={() => mover(clave, i - 1)} title="Subir (más a la izquierda en la tabla)">
                    ▲
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ padding: "0 7px", fontSize: "0.7rem" }} disabled={i === actual.orden.length - 1} onClick={() => mover(clave, i + 1)} title="Bajar (más a la derecha en la tabla)">
                    ▼
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-secondary" style={chico} onClick={() => alCambiar({ ...actual, visibles: Object.fromEntries(claves.map((c) => [c, true])) })} title="Muestra todas las columnas, sin cambiar el orden.">
                Mostrar todas
              </button>
              <button type="button" className="btn btn-secondary" style={chico} onClick={() => alCambiar({ ...actual, visibles: Object.fromEntries(claves.map((c) => [c, c === "cliente" || c === "vendedor"])) })} title="Deja solo Cliente y Vendedor.">
                Solo lo mínimo
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <b>Vistas</b>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {vistasIncluidas.map((v) => (
                <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "8px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "6px 10px", background: igual(actual, v.config, claves) ? "rgba(var(--primary-rgb), 0.12)" : undefined }}>
                  <div style={{ flex: 1 }} title={v.ayuda}>
                    <div style={{ fontWeight: 600 }}>
                      {v.nombre} <span style={{ fontSize: "0.68rem", color: "var(--primary)", border: "1px solid var(--primary)", borderRadius: "999px", padding: "0 6px" }}>Incluida</span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{v.ayuda}</div>
                  </div>
                  <button type="button" className="btn btn-secondary" style={chico} onClick={() => aplicar(v.config, `Vista «${v.nombre}» aplicada.`)} title={`Aplica la vista «${v.nombre}»: ${v.ayuda}`}>
                    Aplicar
                  </button>
                </div>
              ))}
              {vistas.map((v) => (
                <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "6px 10px", background: igual(actual, v, claves) ? "rgba(var(--primary-rgb), 0.12)" : undefined }}>
                  <div style={{ flex: 1, minWidth: "120px" }}>
                    <div style={{ fontWeight: 600 }}>{v.nombre}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{claves.filter((c) => v.visibles[c] !== false).length} columnas visibles</div>
                  </div>
                  <button type="button" className="btn btn-secondary" style={chico} onClick={() => aplicar(v, `Vista «${v.nombre}» aplicada.`)} title="Pone el orden y las columnas guardados en esta vista.">
                    Aplicar
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={chico}
                    onClick={() => {
                      guardarVistas(vistas.map((x) => (x.id === v.id ? { ...x, orden: actual.orden, visibles: actual.visibles } : x)));
                      mostrar(`✅ Vista «${v.nombre}» actualizada con lo que ves ahora.`);
                    }}
                    title="Sustituye lo guardado en esta vista por el orden y las columnas de ahora."
                  >
                    Actualizar
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ ...chico, color: "var(--danger)" }}
                    onClick={() => {
                      guardarVistas(vistas.filter((x) => x.id !== v.id));
                      mostrar(`Vista «${v.nombre}» borrada.`);
                    }}
                    title="Borra esta vista guardada. La tabla no cambia."
                  >
                    🗑️
                  </button>
                </div>
              ))}
              {vistas.length === 0 && <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Todavía no has guardado ninguna vista tuya.</div>}
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--border-light)", paddingTop: "10px" }}>
              <input className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guardarNueva()} maxLength={40} placeholder="Nombre de la vista nueva" style={{ flex: 1, minWidth: "150px" }} />
              <button type="button" className="btn btn-primary" style={chico} disabled={!nombre.trim()} onClick={guardarNueva} title="Guarda el orden y las columnas visibles de ahora con este nombre.">
                💾 Guardar vista
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

