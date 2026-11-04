"use client";

import { useRef, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";

interface Tarjeta {
  id: string;
  titulo: string;
  descripcion?: string;
  color?: string | null;
}
interface Columna {
  id: string;
  titulo: string;
  tarjetas: Tarjeta[];
}
interface ContenidoTablero {
  columnas: Columna[];
}

const COLORES = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#64748b",
];
const nuevoId = (p: string): string =>
  `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Tablero de columnas y tarjetas (como Trello): se arrastran tarjetas entre columnas y las columnas entre sí. */
export default function TableroKanban({
  contenido,
  soloLeer,
  alCambiar,
}: {
  contenido: Record<string, unknown>;
  soloLeer: boolean;
  alCambiar: (c: Record<string, unknown>) => void;
}) {
  const { confirmar } = useToast();
  const [columnas, setColumnas] = useState<Columna[]>(
    () => (contenido as unknown as ContenidoTablero).columnas ?? [],
  );
  const [editando, setEditando] = useState<{
    col: string;
    tarjeta: Tarjeta;
  } | null>(null);
  const [nueva, setNueva] = useState<{ col: string; texto: string } | null>(
    null,
  );
  const [arrastrando, setArrastrando] = useState<{
    tipo: "tarjeta" | "columna";
    col: string;
    tarjeta?: string;
  } | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const historial = useRef<Columna[][]>([]);
  const [nHistorial, setNHistorial] = useState(0);

  const fijar = (nuevas: Columna[], conHistorial = true) => {
    if (conHistorial) {
      historial.current.push(columnas);
      if (historial.current.length > 100) historial.current.shift();
      setNHistorial(historial.current.length);
    }
    setColumnas(nuevas);
    alCambiar({ columnas: nuevas });
  };
  const deshacer = () => {
    const p = historial.current.pop();
    if (!p) return;
    setNHistorial(historial.current.length);
    setColumnas(p);
    alCambiar({ columnas: p });
  };

  const moverTarjeta = (
    deCol: string,
    idTarjeta: string,
    aCol: string,
    antesDe: string | null,
  ) => {
    const origen = columnas.find((c) => c.id === deCol);
    const t = origen?.tarjetas.find((x) => x.id === idTarjeta);
    if (!t) return;
    const sinEsa = columnas.map((c) =>
      c.id === deCol
        ? { ...c, tarjetas: c.tarjetas.filter((x) => x.id !== idTarjeta) }
        : c,
    );
    fijar(
      sinEsa.map((c) => {
        if (c.id !== aCol) return c;
        const i = antesDe ? c.tarjetas.findIndex((x) => x.id === antesDe) : -1;
        const lista = [...c.tarjetas];
        lista.splice(i < 0 ? lista.length : i, 0, t);
        return { ...c, tarjetas: lista };
      }),
    );
  };
  const moverColumna = (idCol: string, antesDe: string | null) => {
    const col = columnas.find((c) => c.id === idCol);
    if (!col || idCol === antesDe) return;
    const resto = columnas.filter((c) => c.id !== idCol);
    const i = antesDe ? resto.findIndex((c) => c.id === antesDe) : -1;
    resto.splice(i < 0 ? resto.length : i, 0, col);
    fijar(resto);
  };
  const añadirTarjeta = () => {
    if (!nueva || !nueva.texto.trim()) return setNueva(null);
    fijar(
      columnas.map((c) =>
        c.id === nueva.col
          ? {
              ...c,
              tarjetas: [
                ...c.tarjetas,
                { id: nuevoId("t"), titulo: nueva.texto.trim() },
              ],
            }
          : c,
      ),
    );
    setNueva({ col: nueva.col, texto: "" });
  };
  const guardarTarjeta = () => {
    if (!editando) return;
    fijar(
      columnas.map((c) =>
        c.id === editando.col
          ? {
              ...c,
              tarjetas: c.tarjetas.map((t) =>
                t.id === editando.tarjeta.id ? editando.tarjeta : t,
              ),
            }
          : c,
      ),
    );
    setEditando(null);
  };
  const borrarTarjeta = async () => {
    if (
      !editando ||
      !(await confirmar({
        titulo: "Quitar la tarjeta",
        texto: `¿Quitar «${editando.tarjeta.titulo}»?`,
        aceptar: "Quitar",
        peligro: true,
      }))
    )
      return;
    fijar(
      columnas.map((c) =>
        c.id === editando.col
          ? {
              ...c,
              tarjetas: c.tarjetas.filter((t) => t.id !== editando.tarjeta.id),
            }
          : c,
      ),
    );
    setEditando(null);
  };
  const borrarColumna = async (c: Columna) => {
    if (
      !(await confirmar({
        titulo: "Quitar la columna",
        texto:
          c.tarjetas.length > 0
            ? `¿Quitar «${c.titulo}» y sus ${c.tarjetas.length} tarjetas?`
            : `¿Quitar «${c.titulo}»?`,
        aceptar: "Quitar",
        peligro: true,
      }))
    )
      return;
    fijar(columnas.filter((x) => x.id !== c.id));
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
      onKeyDown={(e) =>
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName) &&
        !soloLeer &&
        (e.preventDefault(), deshacer())
      }
      tabIndex={-1}
    >
      {!soloLeer && (
        <div
          style={{
            display: "flex",
            gap: "6px",
            padding: "6px 10px",
            borderBottom: "1px solid var(--border-light)",
            fontSize: "0.8rem",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "2px 8px", fontSize: "0.8rem" }}
            onClick={() =>
              fijar([
                ...columnas,
                { id: nuevoId("c"), titulo: "Nueva columna", tarjetas: [] },
              ])
            }
          >
            ＋ Columna
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "2px 8px", fontSize: "0.8rem" }}
            onClick={deshacer}
            disabled={nHistorial === 0}
            title="Deshacer (Ctrl+Z)"
          >
            ↶
          </button>
          <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
            Arrastra las tarjetas entre columnas y las columnas por su título.
          </span>
        </div>
      )}
      <div
        style={{
          flex: 1,
          minHeight: "360px",
          overflow: "auto",
          display: "flex",
          gap: "12px",
          alignItems: "flex-start",
          padding: "12px",
        }}
      >
        {columnas.map((c) => (
          <section
            key={c.id}
            draggable={!soloLeer && arrastrando?.tipo !== "tarjeta"}
            onDragStart={(e) => {
              if ((e.target as HTMLElement).closest("[data-tarjeta]")) return;
              e.dataTransfer.effectAllowed = "move";
              setArrastrando({ tipo: "columna", col: c.id });
            }}
            onDragEnd={() => {
              setArrastrando(null);
              setSobre(null);
            }}
            onDragOver={(e) => {
              if (!arrastrando) return;
              e.preventDefault();
              setSobre(c.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (arrastrando?.tipo === "columna")
                moverColumna(arrastrando.col, c.id);
              else if (arrastrando?.tarjeta)
                moverTarjeta(arrastrando.col, arrastrando.tarjeta, c.id, null);
              setArrastrando(null);
              setSobre(null);
            }}
            style={{
              width: "260px",
              flexShrink: 0,
              background: "var(--bg-card)",
              border: `1px solid ${sobre === c.id ? "var(--primary)" : "var(--border-light)"}`,
              borderRadius: "var(--radius-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              padding: "8px",
              maxHeight: "100%",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "4px",
                alignItems: "center",
                cursor: soloLeer ? "default" : "grab",
              }}
            >
              <input
                className="form-input"
                value={c.titulo}
                readOnly={soloLeer}
                onChange={(e) =>
                  setColumnas((cs) =>
                    cs.map((x) =>
                      x.id === c.id ? { ...x, titulo: e.target.value } : x,
                    ),
                  )
                }
                onBlur={() => alCambiar({ columnas })}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                style={{
                  fontWeight: 700,
                  padding: "3px 6px",
                  flex: 1,
                  minWidth: 0,
                }}
                draggable={false}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {c.tarjetas.length}
              </span>
              {!soloLeer && (
                <button
                  type="button"
                  aria-label={`Quitar la columna ${c.titulo}`}
                  onClick={() => void borrarColumna(c)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                overflowY: "auto",
                minHeight: "20px",
              }}
            >
              {c.tarjetas.map((t) => (
                <div
                  key={t.id}
                  data-tarjeta
                  draggable={!soloLeer}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = "move";
                    setArrastrando({
                      tipo: "tarjeta",
                      col: c.id,
                      tarjeta: t.id,
                    });
                  }}
                  onDragOver={(e) => {
                    if (arrastrando?.tipo === "tarjeta") e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (arrastrando?.tipo !== "tarjeta" || !arrastrando.tarjeta)
                      return;
                    e.preventDefault();
                    e.stopPropagation();
                    moverTarjeta(
                      arrastrando.col,
                      arrastrando.tarjeta,
                      c.id,
                      t.id,
                    );
                    setArrastrando(null);
                    setSobre(null);
                  }}
                  onClick={() => setEditando({ col: c.id, tarjeta: { ...t } })}
                  style={{
                    padding: "6px 8px",
                    background: "var(--bg-primary, rgba(255,255,255,0.04))",
                    border: "1px solid var(--border-light)",
                    borderLeft: `4px solid ${t.color ?? "var(--border-light)"}`,
                    borderRadius: "var(--radius-sm)",
                    cursor: soloLeer ? "pointer" : "grab",
                    fontSize: "0.9rem",
                    opacity: arrastrando?.tarjeta === t.id ? 0.4 : 1,
                  }}
                >
                  <div>{t.titulo}</div>
                  {t.descripcion && (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        marginTop: "2px",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {t.descripcion.length > 90
                        ? `${t.descripcion.slice(0, 90)}…`
                        : t.descripcion}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!soloLeer &&
              (nueva?.col === c.id ? (
                <input
                  className="form-input"
                  autoFocus
                  placeholder="Título de la tarjeta (Intro para añadir)"
                  value={nueva.texto}
                  onChange={(e) =>
                    setNueva({ col: c.id, texto: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") añadirTarjeta();
                    if (e.key === "Escape") setNueva(null);
                  }}
                  onBlur={() => {
                    añadirTarjeta();
                    setNueva(null);
                  }}
                  style={{ padding: "5px 8px" }}
                />
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setNueva({ col: c.id, texto: "" })}
                  style={{
                    padding: "3px 8px",
                    fontSize: "0.8rem",
                    alignSelf: "flex-start",
                  }}
                >
                  ＋ Tarjeta
                </button>
              ))}
          </section>
        ))}
        {columnas.length === 0 && (
          <span style={{ color: "var(--text-muted)" }}>
            No hay columnas. Añade una con «＋ Columna».
          </span>
        )}
      </div>
      {editando && (
        <Modal
          titulo="Tarjeta"
          ancho="min(calc(96 * var(--uvw)), 520px)"
          pie={
            <>
              {!soloLeer && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void borrarTarjeta()}
                  style={{ marginRight: "auto" }}
                >
                  🗑️ Quitar
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditando(null)}
              >
                {soloLeer ? "Cerrar" : "Cancelar"}
              </button>
              {!soloLeer && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={guardarTarjeta}
                >
                  Guardar
                </button>
              )}
            </>
          }
        >
          <input
            className="form-input"
            autoFocus
            readOnly={soloLeer}
            value={editando.tarjeta.titulo}
            onChange={(e) =>
              setEditando({
                ...editando,
                tarjeta: { ...editando.tarjeta, titulo: e.target.value },
              })
            }
            placeholder="Título"
          />
          <textarea
            className="form-input"
            readOnly={soloLeer}
            rows={6}
            value={editando.tarjeta.descripcion ?? ""}
            onChange={(e) =>
              setEditando({
                ...editando,
                tarjeta: { ...editando.tarjeta, descripcion: e.target.value },
              })
            }
            placeholder="Descripción"
            style={{ resize: "vertical" }}
          />
          {!soloLeer && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              Color:
              {COLORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={editando.tarjeta.color === c}
                  onClick={() =>
                    setEditando({
                      ...editando,
                      tarjeta: {
                        ...editando.tarjeta,
                        color: editando.tarjeta.color === c ? null : c,
                      },
                    })
                  }
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: c,
                    cursor: "pointer",
                    border: `2px solid ${editando.tarjeta.color === c ? "var(--text-primary)" : "transparent"}`,
                  }}
                />
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
