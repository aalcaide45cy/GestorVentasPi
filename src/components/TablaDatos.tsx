"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { usePreferencia } from "@/lib/preferencias";
import PanelColumnas from "@/components/expedientes/PanelColumnas";

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
  /** Estilo propio de cada fila (por ejemplo, un color de fondo según su estado). */
  estiloFila?: (fila: T) => CSSProperties;
  /** Clase CSS de cada fila (por ejemplo, «fila-aviso» para el marco amarillo punteado). */
  claseFila?: (fila: T) => string;
  /** Menos relleno entre columnas, para tablas dentro de modales que no deben desplazarse a los lados. */
  compacta?: boolean;
  /** Orden con el que se abre la tabla (por una columna y en un sentido). */
  ordenInicial?: { clave: string; asc: boolean };
}

const sinAcentos = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function TablaDatos<T>({ id, columnas, filas, clave, textoExtra, placeholder = "Buscar…", vacio = "No hay datos.", pie, estiloFila, claseFila, compacta, ordenInicial }: Props<T>) {
  const relleno = compacta ? "5px 6px" : "6px 8px";
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

  const [texto, setTexto] = useState("");
  const [orden, setOrden] = useState<{ clave: string; asc: boolean } | null>(ordenInicial ?? null);
  const [menu, setMenu] = useState(false);

  const activas = config.orden.map((k) => columnas.find((c) => c.clave === k)!).filter((c) => c && config.visibles[c.clave] !== false);
  // Borde transparente de 2 px en la primera y la última columna: así las cifras no se desplazan en las filas con marco (cápsula)
  // Primera columna a la izquierda, la última a la derecha y el resto centradas (así en todas las tablas)
  const alineacion = (k: number): "left" | "right" | "center" => (k === 0 ? "left" : k === activas.length - 1 ? "right" : "center");
  const bordesLaterales = (k: number): CSSProperties => ({ ...(k === 0 ? { borderLeft: "2px solid transparent" } : {}), ...(k === activas.length - 1 ? { borderRight: "2px solid transparent" } : {}) });

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

  const pieFila = pie ? pie(visibles) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <input className="form-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`🔎 ${placeholder}`} style={{ flex: 1, minWidth: "160px", padding: "4px 10px", fontSize: "0.85rem" }} />
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{texto ? `${visibles.length} de ${filas.length}` : `${filas.length}`}</span>
        <button type="button" className="btn btn-secondary" onClick={() => setMenu(true)} title="Columnas y vistas: elige cuáles se ven, cámbialas de orden (arrastrando) o guarda vistas con nombre" style={{ padding: "4px 10px", fontSize: "0.8rem" }}>
          ⚙️ Columnas y vistas
        </button>
        {menu && <PanelColumnas columnas={columnas} actual={config} predeterminada={defecto} vistasIncluidas={[]} claveVistas={`tabla-vistas-${id}`} alCambiar={cambiar} alCerrar={() => setMenu(false)} />}
      </div>
      {visibles.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0 }}>{filas.length === 0 ? vacio : "Ningún resultado con esa búsqueda."}</p>
      ) : (
        <div className="tabla-scroll" style={{ ["--alto-tabla" as string]: "min(55vh, 420px)" }}>
          <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ color: "var(--text-secondary)" }}>
                {activas.map((c, k) => (
                  <th key={c.clave} onClick={() => setOrden((o) => (o?.clave === c.clave ? { clave: c.clave, asc: !o.asc } : { clave: c.clave, asc: true }))} title={c.ayuda ?? `Ordenar por «${c.etiqueta}»`} style={{ textAlign: alineacion(k), padding: relleno, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none", minWidth: c.ancho, ...bordesLaterales(k) }}>
                    {c.etiqueta}
                    {orden?.clave === c.clave ? (orden.asc ? " ▲" : " ▼") : <span style={{ opacity: 0.35 }}> ↕</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={clave(f)} className={claseFila?.(f) || undefined} style={estiloFila?.(f)}>
                  {activas.map((c, k) => (
                    <td key={c.clave} style={{ ...bordesLaterales(k), borderTop: "1px solid var(--border-light)", textAlign: alineacion(k), padding: relleno, whiteSpace: "nowrap", maxWidth: c.ancho ? c.ancho * 2 : undefined, overflow: "hidden", textOverflow: "ellipsis" }} title={typeof c.valor(f) === "string" ? String(c.valor(f)) : undefined}>
                      {c.celda ? c.celda(f) : c.valor(f)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {pieFila && (
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  {activas.map((c, k) => (
                    <td key={c.clave} style={{ ...bordesLaterales(k), borderTop: "2px solid var(--border-light)", textAlign: alineacion(k), padding: relleno }}>
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
