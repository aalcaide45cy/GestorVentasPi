"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePreferencia } from "@/lib/preferencias";

/**
 * Tabla compacta con buscador (en cualquier columna), orden al pulsar la cabecera y un botón pequeño para elegir, ordenar y
 * restaurar las columnas. La configuración de columnas se recuerda en este navegador (clave `tabla-<id>`).
 */

export interface ColumnaTabla<T> {
  clave: string;
  etiqueta: string;
  /** Valor que se ordena y se busca (número o texto). */
  valor: (fila: T) => string | number;
  /** Cómo se pinta la celda (por defecto, el valor). */
  celda?: (fila: T) => ReactNode;
  ancho?: number;
  alinear?: "left" | "right" | "center";
  /** Oculta por defecto. */
  oculta?: boolean;
  ayuda?: string;
}

interface Config {
  orden: string[];
  visibles: Record<string, boolean>;
}

interface Props<T> {
  id: string;
  columnas: ColumnaTabla<T>[];
  filas: T[];
  clave: (fila: T) => string | number;
  /** Texto extra buscable que no tiene columna (por ejemplo, marca de un coche). */
  textoExtra?: (fila: T) => string;
  placeholder?: string;
  vacio?: string;
  /** Fila de totales (se pinta al final con el mismo orden de columnas). */
  pie?: (filas: T[]) => Partial<Record<string, ReactNode>>;
}

const sinAcentos = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function TablaDatos<T>({ id, columnas, filas, clave, textoExtra, placeholder = "Buscar…", vacio = "No hay datos.", pie }: Props<T>) {
  const defecto = useMemo<Config>(() => ({ orden: columnas.map((c) => c.clave), visibles: Object.fromEntries(columnas.map((c) => [c.clave, !c.oculta])) }), [columnas]);
  const [guardado, fijar] = usePreferencia(`tabla-${id}`);
  const config = useMemo<Config>(() => {
    try {
      const g = guardado ? (JSON.parse(guardado) as Partial<Config>) : null;
      if (!g) return defecto;
      const claves = columnas.map((c) => c.clave);
      const conocidas = (g.orden ?? []).filter((c, i, a) => claves.includes(c) && a.indexOf(c) === i);
      return { orden: [...conocidas, ...claves.filter((c) => !conocidas.includes(c))], visibles: { ...defecto.visibles, ...(g.visibles ?? {}) } };
    } catch {
      return defecto;
    }
  }, [guardado, defecto, columnas]);
  const cambiar = (c: Config) => fijar(JSON.stringify(c));
  const esDefecto = JSON.stringify(config) === JSON.stringify(defecto);

  const [texto, setTexto] = useState("");
  const [orden, setOrden] = useState<{ clave: string; asc: boolean } | null>(null);
  const [menu, setMenu] = useState(false);

  const activas = config.orden.map((k) => columnas.find((c) => c.clave === k)!).filter((c) => c && config.visibles[c.clave] !== false);

  const visibles = useMemo(() => {
    const q = sinAcentos(texto.trim());
    let lista = filas;
    if (q) {
      lista = filas.filter((f) => {
        const todo = [...columnas.map((c) => String(c.valor(f))), textoExtra?.(f) ?? ""].join(" ");
        return q.split(/\s+/).every((p) => sinAcentos(todo).includes(p));
      });
    }
    if (orden) {
      const col = columnas.find((c) => c.clave === orden.clave);
      if (col) {
        lista = [...lista].sort((a, b) => {
          const x = col.valor(a);
          const y = col.valor(b);
          const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es", { numeric: true });
          return orden.asc ? r : -r;
        });
      }
    }
    return lista;
  }, [filas, texto, orden, columnas, textoExtra]);

  const mover = (k: string, delta: number) => {
    const i = config.orden.indexOf(k);
    const j = i + delta;
    if (j < 0 || j >= config.orden.length) return;
    const n = [...config.orden];
    [n[i], n[j]] = [n[j], n[i]];
    cambiar({ ...config, orden: n });
  };

  const pieFila = pie ? pie(visibles) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <input className="form-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`🔎 ${placeholder}`} style={{ flex: 1, minWidth: "160px", padding: "4px 10px", fontSize: "0.85rem" }} />
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{texto ? `${visibles.length} de ${filas.length}` : `${filas.length}`}</span>
        <div style={{ position: "relative" }}>
          <button type="button" className="btn btn-secondary" onClick={() => setMenu(!menu)} title="Columnas: elige cuáles se ven, cámbialas de orden o vuelve a las de siempre" aria-label="Columnas" style={{ padding: "4px 9px", fontSize: "0.95rem", lineHeight: 1 }}>
            ▥
          </button>
          {menu && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 50, minWidth: "230px", background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "10px", boxShadow: "0 10px 25px rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                <b style={{ fontSize: "0.82rem" }}>Columnas</b>
                <button type="button" className="btn btn-secondary" disabled={esDefecto} onClick={() => cambiar(defecto)} style={{ padding: "2px 8px", fontSize: "0.72rem" }} title="Vuelve a las columnas y al orden de siempre">
                  ↺ Restaurar
                </button>
                <button type="button" onClick={() => setMenu(false)} title="Cerrar" aria-label="Cerrar" style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                  ✕
                </button>
              </div>
              {config.orden.map((k, i) => {
                const c = columnas.find((x) => x.clave === k);
                if (!c) return null;
                return (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem" }}>
                    <label style={{ flex: 1, display: "flex", gap: "6px", alignItems: "center", cursor: "pointer" }} title={c.ayuda ?? `Mostrar u ocultar «${c.etiqueta}»`}>
                      <input type="checkbox" checked={config.visibles[k] !== false} onChange={(e) => cambiar({ ...config, visibles: { ...config.visibles, [k]: e.target.checked } })} style={{ accentColor: "var(--primary)" }} />
                      {c.etiqueta}
                    </label>
                    <button type="button" className="btn btn-secondary" disabled={i === 0} onClick={() => mover(k, -1)} style={{ padding: "0 6px", fontSize: "0.65rem" }} title="Más a la izquierda">
                      ▲
                    </button>
                    <button type="button" className="btn btn-secondary" disabled={i === config.orden.length - 1} onClick={() => mover(k, 1)} style={{ padding: "0 6px", fontSize: "0.65rem" }} title="Más a la derecha">
                      ▼
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {visibles.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0 }}>{filas.length === 0 ? vacio : "Ningún resultado con esa búsqueda."}</p>
      ) : (
        <div className="tabla-scroll" style={{ ["--alto-tabla" as string]: "min(55vh, 420px)" }}>
          <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--text-secondary)" }}>
                {activas.map((c) => (
                  <th key={c.clave} onClick={() => setOrden((o) => (o?.clave === c.clave ? { clave: c.clave, asc: !o.asc } : { clave: c.clave, asc: true }))} title={c.ayuda ?? `Ordenar por «${c.etiqueta}»`} style={{ textAlign: c.alinear ?? "left", padding: "6px 8px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none", minWidth: c.ancho }}>
                    {c.etiqueta}
                    {orden?.clave === c.clave ? (orden.asc ? " ▲" : " ▼") : <span style={{ opacity: 0.35 }}> ↕</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={clave(f)} style={{ borderTop: "1px solid var(--border-light)" }}>
                  {activas.map((c) => (
                    <td key={c.clave} style={{ textAlign: c.alinear ?? "left", padding: "6px 8px", whiteSpace: "nowrap", maxWidth: c.ancho ? c.ancho * 2 : undefined, overflow: "hidden", textOverflow: "ellipsis" }} title={typeof c.valor(f) === "string" ? String(c.valor(f)) : undefined}>
                      {c.celda ? c.celda(f) : c.valor(f)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {pieFila && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border-light)", fontWeight: 700 }}>
                  {activas.map((c) => (
                    <td key={c.clave} style={{ textAlign: c.alinear ?? "left", padding: "6px 8px" }}>
                      {pieFila[c.clave] ?? ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
