"use client";

/* Los botones de la barra solo pasan funciones que leen los historiales al pulsar, nunca al pintar. */
/* eslint-disable react-hooks/refs */

import "@xyflow/react/dist/style.css";
import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type FormaNodo =
  "rect" | "redondo" | "circulo" | "rombo" | "texto" | "nota";
interface DatosNodo extends Record<string, unknown> {
  texto: string;
  forma: FormaNodo;
  color: string;
}
type NodoForma = Node<DatosNodo, "forma">;

const COLORES = [
  "#ffffff",
  "#fde68a",
  "#bbf7d0",
  "#bfdbfe",
  "#fbcfe8",
  "#fed7aa",
  "#ddd6fe",
  "#fecaca",
  "#e5e7eb",
];
const COLORES_LINEA = [
  "#64748b",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#111827",
];
const FORMAS: { id: FormaNodo; icono: string; nombre: string }[] = [
  { id: "rect", icono: "▭", nombre: "Rectángulo" },
  { id: "redondo", icono: "⬭", nombre: "Redondeado" },
  { id: "circulo", icono: "◯", nombre: "Círculo" },
  { id: "rombo", icono: "◇", nombre: "Rombo (decisión)" },
  { id: "nota", icono: "🗒️", nombre: "Nota adhesiva" },
  { id: "texto", icono: "T", nombre: "Texto suelto" },
];
const TAMANO: Record<FormaNodo, { w: number; h: number }> = {
  rect: { w: 160, h: 70 },
  redondo: { w: 160, h: 60 },
  circulo: { w: 110, h: 110 },
  rombo: { w: 150, h: 110 },
  nota: { w: 170, h: 130 },
  texto: { w: 160, h: 40 },
};

export interface ContenidoDiagrama {
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;
}

const nuevoId = (p: string): string =>
  `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const marcador = (color: string) => ({ type: MarkerType.ArrowClosed, color });

/** Lo que se guarda de un nodo y de una flecha (sin selección ni datos temporales). */
function limpiarNodo(n: Node): Node {
  const { id, type, position, data, width, height, measured } = n;
  return {
    id,
    type,
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    data,
    width: width ?? measured?.width,
    height: height ?? measured?.height,
  };
}
function limpiarFlecha(e: Edge): Edge {
  const {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    label,
    style,
    markerEnd,
    animated,
  } = e;
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    label,
    style,
    markerEnd,
    animated,
  };
}

function NodoFormaVista({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<NodoForma>) {
  const [editando, setEditando] = useState(false);
  const texto = String(data.texto ?? "");
  const forma = data.forma;
  const alCambiar = (
    data as { alCambiarTexto?: (id: string, t: string) => void }
  ).alCambiarTexto;
  const sinFondo = forma === "texto";
  const relleno = sinFondo ? "transparent" : data.color;
  const comun = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center" as const,
    padding: "8px 12px",
    boxSizing: "border-box" as const,
    color: "#111827",
    fontSize: "0.9rem",
    wordBreak: "break-word" as const,
    whiteSpace: "pre-wrap" as const,
  };
  const radio =
    forma === "circulo"
      ? "50%"
      : forma === "redondo"
        ? "999px"
        : forma === "nota"
          ? "2px"
          : "8px";
  const contenido = editando ? (
    <textarea
      className="nodrag nowheel"
      autoFocus
      defaultValue={texto}
      onBlur={(e) => {
        setEditando(false);
        if (e.target.value !== texto) alCambiar?.(id, e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") e.currentTarget.blur();
        e.stopPropagation();
      }}
      style={{
        width: "100%",
        height: "100%",
        resize: "none",
        border: "none",
        outline: "none",
        background: "transparent",
        textAlign: "center",
        font: "inherit",
        color: "inherit",
      }}
    />
  ) : (
    <span>{texto || (selected ? "Doble clic para escribir" : "")}</span>
  );
  return (
    <div
      onDoubleClick={() => setEditando(true)}
      style={{
        width: width ?? "100%",
        height: height ?? "100%",
        minWidth: 30,
        minHeight: 24,
        position: "relative",
      }}
    >
      <NodeResizer isVisible={selected} minWidth={40} minHeight={28} />
      {forma === "rombo" ? (
        <>
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0 }}
          >
            <polygon
              points="50,1 99,50 50,99 1,50"
              fill={relleno}
              stroke="#475569"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div style={{ ...comun, position: "relative", padding: "20% 22%" }}>
            {contenido}
          </div>
        </>
      ) : (
        <div
          style={{
            ...comun,
            background: relleno,
            border: sinFondo
              ? selected
                ? "1px dashed #94a3b8"
                : "1px dashed transparent"
              : "1.5px solid #475569",
            borderRadius: radio,
            boxShadow:
              forma === "nota" ? "2px 3px 6px rgba(0,0,0,0.25)" : undefined,
            fontSize: sinFondo ? "1rem" : "0.9rem",
            color: sinFondo ? "var(--text-primary)" : "#111827",
          }}
        >
          {contenido}
        </div>
      )}
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map(
        (p) => (
          <Handle
            key={p}
            id={p}
            type="source"
            position={p}
            style={{
              width: 9,
              height: 9,
              background: "#3b82f6",
              opacity: selected ? 1 : 0.35,
            }}
          />
        ),
      )}
    </div>
  );
}
const TIPOS_NODO = { forma: NodoFormaVista };

function firma(nodos: Node[], flechas: Edge[]): string {
  return JSON.stringify([
    nodos.map((n) => [
      n.id,
      Math.round(n.position.x),
      Math.round(n.position.y),
      n.data,
      n.width ?? n.measured?.width,
      n.height ?? n.measured?.height,
    ]),
    flechas.map((e) => [
      e.id,
      e.source,
      e.target,
      e.sourceHandle,
      e.targetHandle,
      e.label,
      e.style,
      e.animated,
    ]),
  ]);
}

function Interior({
  inicial,
  soloLeer,
  alCambiar,
}: {
  inicial: ContenidoDiagrama;
  soloLeer: boolean;
  alCambiar: (c: ContenidoDiagrama) => void;
}) {
  const [nodos, setNodos] = useState<Node[]>(() => inicial.nodes ?? []);
  const [flechas, setFlechas] = useState<Edge[]>(() => inicial.edges ?? []);
  const vista = useRef<Viewport>(inicial.viewport ?? { x: 0, y: 0, zoom: 1 });
  const ultimaFirma = useRef(firma(nodos, flechas));
  const pasado = useRef<{ n: Node[]; e: Edge[] }[]>([]);
  const futuro = useRef<{ n: Node[]; e: Edge[] }[]>([]);
  const previo = useRef<{ n: Node[]; e: Edge[] }>({
    n: nodos.map(limpiarNodo),
    e: flechas.map(limpiarFlecha),
  });
  const rafaga = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restaurando = useRef(false);
  const portapapeles = useRef<{ n: Node[]; e: Edge[] } | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();
  const [cuentas, setCuentas] = useState({ p: 0, f: 0, c: false });
  const sincronizar = () =>
    setCuentas({
      p: pasado.current.length,
      f: futuro.current.length,
      c: portapapeles.current !== null,
    });

  const emitir = useCallback(
    (n: Node[], e: Edge[]) => {
      alCambiar({
        nodes: n.map(limpiarNodo),
        edges: e.map(limpiarFlecha),
        viewport: vista.current,
      });
    },
    [alCambiar],
  );

  // Cada cambio real (no selecciones) se guarda y entra en el historial de deshacer (agrupando los movimientos seguidos)
  useEffect(() => {
    const f = firma(nodos, flechas);
    if (f === ultimaFirma.current) return;
    ultimaFirma.current = f;
    if (!restaurando.current) {
      if (!rafaga.current) {
        pasado.current.push(previo.current);
        if (pasado.current.length > 200) pasado.current.shift();
        futuro.current = [];
      } else clearTimeout(rafaga.current);
      rafaga.current = setTimeout(() => {
        rafaga.current = null;
      }, 500);
    }
    restaurando.current = false;
    previo.current = {
      n: nodos.map(limpiarNodo),
      e: flechas.map(limpiarFlecha),
    };
    emitir(nodos, flechas);
    setCuentas({
      p: pasado.current.length,
      f: futuro.current.length,
      c: portapapeles.current !== null,
    });
  }, [nodos, flechas, emitir]);

  const cambiarTexto = useCallback((id: string, texto: string) => {
    setNodos((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, texto } } : n)),
    );
  }, []);
  const nodosVista = useMemo(
    () =>
      nodos.map((n) => ({
        ...n,
        data: { ...n.data, alCambiarTexto: cambiarTexto },
      })),
    [nodos, cambiarTexto],
  );

  const alCambiarNodos = useCallback(
    (c: NodeChange[]) => setNodos((ns) => applyNodeChanges(c, ns)),
    [],
  );
  const alCambiarFlechas = useCallback(
    (c: EdgeChange[]) => setFlechas((es) => applyEdgeChanges(c, es)),
    [],
  );
  const alConectar = useCallback(
    (c: Connection) =>
      setFlechas((es) =>
        addEdge(
          {
            ...c,
            id: nuevoId("f"),
            markerEnd: marcador("#64748b"),
            style: { stroke: "#64748b", strokeWidth: 2 },
          },
          es,
        ),
      ),
    [],
  );

  const deshacer = useCallback(() => {
    const p = pasado.current.pop();
    if (!p) return;
    futuro.current.push({
      n: nodos.map(limpiarNodo),
      e: flechas.map(limpiarFlecha),
    });
    restaurando.current = true;
    setNodos(p.n);
    setFlechas(p.e);
  }, [nodos, flechas]);
  const rehacer = useCallback(() => {
    const p = futuro.current.pop();
    if (!p) return;
    pasado.current.push({
      n: nodos.map(limpiarNodo),
      e: flechas.map(limpiarFlecha),
    });
    restaurando.current = true;
    setNodos(p.n);
    setFlechas(p.e);
  }, [nodos, flechas]);

  const añadir = (forma: FormaNodo) => {
    const t = TAMANO[forma];
    const desplazo = (nodos.length % 8) * 24;
    const caja = lienzo.current?.getBoundingClientRect();
    const c = caja
      ? rf.screenToFlowPosition({
          x: caja.left + caja.width / 2,
          y: caja.top + caja.height / 2,
        })
      : { x: 0, y: 0 };
    const centro = { x: c.x - t.w / 2, y: c.y - t.h / 2 };
    const nuevo: NodoForma = {
      id: nuevoId("n"),
      type: "forma",
      position: { x: centro.x + desplazo, y: centro.y + desplazo },
      width: t.w,
      height: t.h,
      selected: true,
      data: {
        texto: "",
        forma,
        color: forma === "nota" ? "#fde68a" : "#ffffff",
      },
    };
    setNodos((ns) => [...ns.map((n) => ({ ...n, selected: false })), nuevo]);
  };
  const seleccionados = nodos.filter((n) => n.selected);
  const flechasSel = flechas.filter((e) => e.selected);
  const cambiarSel = (cambio: Partial<DatosNodo>) =>
    setNodos((ns) =>
      ns.map((n) =>
        n.selected ? { ...n, data: { ...n.data, ...cambio } } : n,
      ),
    );
  const cambiarFlechaSel = (f: (e: Edge) => Edge) =>
    setFlechas((es) => es.map((e) => (e.selected ? f(e) : e)));
  const borrarSel = () => {
    const ids = new Set(seleccionados.map((n) => n.id));
    setNodos((ns) => ns.filter((n) => !n.selected));
    setFlechas((es) =>
      es.filter((e) => !e.selected && !ids.has(e.source) && !ids.has(e.target)),
    );
  };
  const copiar = () => {
    const ids = new Set(seleccionados.map((n) => n.id));
    if (ids.size === 0) return;
    portapapeles.current = {
      n: seleccionados.map(limpiarNodo),
      e: flechas
        .filter((e) => ids.has(e.source) && ids.has(e.target))
        .map(limpiarFlecha),
    };
    sincronizar();
  };
  const pegar = () => {
    const p = portapapeles.current;
    if (!p) return;
    const mapa = new Map(p.n.map((n) => [n.id, nuevoId("n")]));
    const nuevosN = p.n.map((n) => ({
      ...n,
      id: mapa.get(n.id) as string,
      position: { x: n.position.x + 30, y: n.position.y + 30 },
      selected: true,
    }));
    const nuevasF = p.e.map((e) => ({
      ...e,
      id: nuevoId("f"),
      source: mapa.get(e.source) as string,
      target: mapa.get(e.target) as string,
    }));
    // La siguiente copia se desplaza otro poco
    portapapeles.current = {
      n: nuevosN.map(limpiarNodo),
      e: nuevasF.map(limpiarFlecha),
    };
    setNodos((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      ...nuevosN,
    ]);
    setFlechas((es) => [...es, ...nuevasF]);
  };

  const alPulsar = (ev: React.KeyboardEvent) => {
    const t = ev.target as HTMLElement;
    if (["TEXTAREA", "INPUT"].includes(t.tagName) || soloLeer) return;
    if (!(ev.ctrlKey || ev.metaKey)) return;
    const k = ev.key.toLowerCase();
    if (k === "z" && !ev.shiftKey) {
      ev.preventDefault();
      deshacer();
    } else if (k === "y" || (k === "z" && ev.shiftKey)) {
      ev.preventDefault();
      rehacer();
    } else if (k === "c") copiar();
    else if (k === "v") {
      ev.preventDefault();
      pegar();
    } else if (k === "d") {
      ev.preventDefault();
      copiar();
      pegar();
    }
  };

  const etiquetar = () => {
    const actual = flechasSel[0];
    const texto = window.prompt(
      "Texto de la flecha (vacío para quitarlo):",
      typeof actual?.label === "string" ? actual.label : "",
    );
    if (texto === null) return;
    cambiarFlechaSel((e) => ({ ...e, label: texto.trim() || undefined }));
  };
  const boton = (
    texto: string,
    titulo: string,
    alPulsarBoton: () => void,
    activo = false,
    deshabilitado = false,
  ) => (
    <button
      key={titulo}
      type="button"
      className={activo ? "btn btn-primary" : "btn btn-secondary"}
      title={titulo}
      disabled={deshabilitado}
      onClick={alPulsarBoton}
      style={{ padding: "2px 8px", fontSize: "0.8rem" }}
    >
      {texto}
    </button>
  );
  const tema =
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "light"
      ? "light"
      : "dark";

  return (
    <div
      ref={contenedor}
      onKeyDown={alPulsar}
      tabIndex={-1}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        outline: "none",
      }}
    >
      {!soloLeer && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            alignItems: "center",
            padding: "6px 10px",
            borderBottom: "1px solid var(--border-light)",
            fontSize: "0.8rem",
          }}
        >
          <strong>Añadir:</strong>
          {FORMAS.map((f) => boton(f.icono, f.nombre, () => añadir(f.id)))}
          <span
            style={{
              borderLeft: "1px solid var(--border-light)",
              height: "18px",
            }}
          />
          {boton(
            "↶",
            "Deshacer (Ctrl+Z)",
            deshacer,
            false,
            pasado.current.length === 0,
          )}
          {boton(
            "↷",
            "Rehacer (Ctrl+Y)",
            rehacer,
            false,
            futuro.current.length === 0,
          )}
          {boton(
            "⧉",
            "Copiar (Ctrl+C)",
            copiar,
            false,
            seleccionados.length === 0,
          )}
          {boton("📋", "Pegar (Ctrl+V)", pegar, false, !cuentas.c)}
          {boton(
            "🗑️",
            "Borrar lo seleccionado (Supr)",
            borrarSel,
            false,
            seleccionados.length === 0 && flechasSel.length === 0,
          )}
          {seleccionados.length > 0 && (
            <>
              <span
                style={{
                  borderLeft: "1px solid var(--border-light)",
                  height: "18px",
                }}
              />
              {seleccionados.length === 1 &&
                FORMAS.map((f) =>
                  boton(
                    f.icono,
                    `Cambiar a ${f.nombre.toLowerCase()}`,
                    () => cambiarSel({ forma: f.id }),
                    seleccionados[0].data.forma === f.id,
                  ),
                )}
              <span style={{ display: "inline-flex", gap: "3px" }}>
                {COLORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    onClick={() => cambiarSel({ color: c })}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: c,
                      border: "1px solid #64748b",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                ))}
              </span>
            </>
          )}
          {flechasSel.length > 0 && (
            <>
              <span
                style={{
                  borderLeft: "1px solid var(--border-light)",
                  height: "18px",
                }}
              />
              {boton("🏷️ Texto", "Poner texto a la flecha", etiquetar)}
              {boton("┅ Punteada", "Alternar línea punteada", () =>
                cambiarFlechaSel((e) => ({
                  ...e,
                  style: {
                    ...e.style,
                    strokeDasharray: e.style?.strokeDasharray
                      ? undefined
                      : "6 4",
                  },
                })),
              )}
              {boton("✨ Animada", "Alternar animación", () =>
                cambiarFlechaSel((e) => ({ ...e, animated: !e.animated })),
              )}
              <span style={{ display: "inline-flex", gap: "3px" }}>
                {COLORES_LINEA.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color de la flecha ${c}`}
                    onClick={() =>
                      cambiarFlechaSel((e) => ({
                        ...e,
                        style: { ...e.style, stroke: c },
                        markerEnd: marcador(c),
                      }))
                    }
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: c,
                      border: "1px solid #64748b",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                ))}
              </span>
            </>
          )}
          <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
            Arrastra desde un punto azul hasta otra forma para unirlas. Doble
            clic en una forma para escribir.
          </span>
        </div>
      )}
      <div ref={lienzo} style={{ flex: 1, minHeight: "360px" }}>
        <ReactFlow
          nodes={nodosVista}
          edges={flechas}
          nodeTypes={TIPOS_NODO}
          onNodesChange={alCambiarNodos}
          onEdgesChange={alCambiarFlechas}
          onConnect={alConectar}
          onEdgeDoubleClick={() => !soloLeer && etiquetar()}
          onMove={(_e, v) => {
            vista.current = v;
          }}
          onMoveEnd={(_e, v) => {
            vista.current = v;
            if (!soloLeer) emitir(nodos, flechas);
          }}
          defaultViewport={inicial.viewport}
          fitView={
            !inicial.nodes || inicial.nodes.length === 0
              ? false
              : !inicial.viewport ||
                (inicial.viewport.x === 0 &&
                  inicial.viewport.y === 0 &&
                  inicial.viewport.zoom === 1)
          }
          fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
          connectionMode={ConnectionMode.Loose}
          nodesDraggable={!soloLeer}
          nodesConnectable={!soloLeer}
          elementsSelectable
          deleteKeyCode={soloLeer ? null : ["Backspace", "Delete"]}
          selectionOnDrag={false}
          multiSelectionKeyCode={["Shift", "Meta", "Control"]}
          minZoom={0.1}
          maxZoom={3}
          colorMode={tema}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            markerEnd: marcador("#64748b"),
            style: { stroke: "#64748b", strokeWidth: 2 },
          }}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable style={{ width: 130, height: 90 }} />
        </ReactFlow>
      </div>
    </div>
  );
}

/** Lienzo de diagramas: formas, flechas con texto, colores, zoom, copiar y pegar, deshacer. Se guarda como {nodes, edges, viewport}. */
export default function LienzoDiagrama({
  contenido,
  soloLeer,
  alCambiar,
}: {
  contenido: Record<string, unknown>;
  soloLeer: boolean;
  alCambiar: (c: Record<string, unknown>) => void;
}) {
  const inicial = contenido as unknown as ContenidoDiagrama;
  return (
    <ReactFlowProvider>
      <Interior
        inicial={inicial}
        soloLeer={soloLeer}
        alCambiar={(c) => alCambiar(c as unknown as Record<string, unknown>)}
      />
    </ReactFlowProvider>
  );
}
