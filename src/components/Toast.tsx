"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type TipoToast = "exito" | "error" | "aviso";

/** Una notificación en forma de ventana: título, mensaje, detalles opcionales y botones (Aceptar y, si se pide, Cancelar). */
export interface OpcionesNotificacion {
  titulo?: string;
  texto: string;
  /** Líneas con el detalle de lo ocurrido (se enseñan en una lista bajo el mensaje). */
  detalles?: string[];
  tipo?: TipoToast;
  aceptar?: string;
  /** Con texto, sale también el botón de cancelar. */
  cancelar?: string;
  /** Botón de aceptar en rojo (acciones que borran). */
  peligro?: boolean;
  /** Si es una notificación de éxito, se cierra sola a los tantos milisegundos (por defecto 8 s); con 0 no se cierra sola. */
  duracionMs?: number;
}

interface Item extends OpcionesNotificacion {
  id: number;
  tipo: TipoToast;
  resolver: (aceptada: boolean) => void;
}

interface ContextoToast {
  /** Aviso corto: sale como ventana con «Aceptar» (los de éxito se cierran solos). Es la forma de siempre de avisar. */
  mostrar: (texto: string, tipo?: TipoToast, duracionMs?: number) => void;
  /** Ventana de aviso con título y detalles; devuelve true si se acepta y false si se cancela (o se cierra con Esc). */
  notificar: (opciones: OpcionesNotificacion) => Promise<boolean>;
  /** Pide confirmación antes de hacer algo: ventana con lo que va a pasar, «Aceptar» y «Cancelar». */
  confirmar: (opciones: Omit<OpcionesNotificacion, "cancelar"> & { cancelar?: string }) => Promise<boolean>;
}

const Contexto = createContext<ContextoToast>({ mostrar: () => undefined, notificar: async () => true, confirmar: async () => false });

const ESTILO: Record<TipoToast, { borde: string; fondo: string; icono: string; titulo: string }> = {
  exito: { borde: "var(--success)", fondo: "rgba(34, 197, 94, 0.15)", icono: "✅", titulo: "Hecho" },
  error: { borde: "var(--danger)", fondo: "rgba(239, 68, 68, 0.15)", icono: "🛑", titulo: "No se ha podido" },
  aviso: { borde: "var(--warning)", fondo: "rgba(234, 179, 8, 0.15)", icono: "⚠️", titulo: "Atención" },
};

/** Separa un mensaje en una frase principal y el resto como detalles («Hecho. Copia previa: x. Otra cosa.» → frase + 2 líneas). */
function partir(texto: string): { frase: string; detalles: string[] } {
  const limpio = texto.replace(/^[✅🛑⚠️ℹ️\s]+/u, "").trim();
  const trozos = limpio
    .split(/\n+/)
    .flatMap((l) => l.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¡¿«“"(\d])/u))
    .map((t) => t.trim())
    .filter(Boolean);
  if (trozos.length <= 1) return { frase: limpio, detalles: [] };
  return { frase: trozos[0], detalles: trozos.slice(1) };
}

/**
 * Notificaciones en forma de ventana (no una tira arriba): título, lo que ha ocurrido bien estructurado y botones. Si llegan varias a la vez
 * se van enseñando una tras otra («1 de 3»). Los avisos de éxito se cierran solos tras unos segundos (con una barra que lo indica); los
 * errores y avisos esperan a que se acepten. Enter acepta y Esc cancela (o cierra).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const contador = useRef(0);

  const notificar = useCallback(
    (o: OpcionesNotificacion) =>
      new Promise<boolean>((resolver) => {
        const id = ++contador.current;
        setItems((prev) => [...prev, { ...o, id, tipo: o.tipo ?? "exito", resolver }]);
      }),
    [],
  );
  const mostrar = useCallback(
    (texto: string, tipo: TipoToast = "exito", duracionMs?: number) => {
      void notificar({ texto, tipo, duracionMs });
    },
    [notificar],
  );
  const confirmar = useCallback((o: Omit<OpcionesNotificacion, "cancelar"> & { cancelar?: string }) => notificar({ tipo: "aviso", titulo: "Confirma esta acción", aceptar: "Aceptar", cancelar: "Cancelar", ...o }), [notificar]);

  const valor = useMemo(() => ({ mostrar, notificar, confirmar }), [mostrar, notificar, confirmar]);
  const actual = items[0] ?? null;

  const cerrar = useCallback((aceptada: boolean) => {
    setItems((prev) => {
      prev[0]?.resolver(aceptada);
      return prev.slice(1);
    });
  }, []);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {actual && <Ventana key={actual.id} item={actual} pendientes={items.length} alCerrar={cerrar} />}
    </Contexto.Provider>
  );
}

function Ventana({ item, pendientes, alCerrar }: { item: Item; pendientes: number; alCerrar: (aceptada: boolean) => void }) {
  const estilo = ESTILO[item.tipo];
  const { frase, detalles: deTexto } = partir(item.texto);
  const detalles = [...(item.detalles ?? []), ...deTexto];
  // Los de éxito sin botón de cancelar se cierran solos (con una barra que se vacía); el resto espera
  const auto = item.tipo === "exito" && !item.cancelar && item.duracionMs !== 0 ? (item.duracionMs ?? 8000) : 0;
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => alCerrar(true), auto);
    return () => clearTimeout(t);
  }, [auto, alCerrar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-live="assertive"
      className="modal-fondo"
      style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "var(--bg-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 6000, backdropFilter: "blur(4px)", padding: "20px" }}
    >
      <div className="glass-panel modal-panel" style={{ width: "100%", maxWidth: "520px", maxHeight: "85vh", overflow: "hidden", padding: "26px 28px 22px", display: "flex", flexDirection: "column", gap: "16px", background: "var(--bg-card)", borderLeft: `4px solid ${estilo.borde}`, position: "relative" }}>
        <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
          <div aria-hidden style={{ width: "42px", height: "42px", borderRadius: "50%", background: estilo.fondo, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", flexShrink: 0 }}>
            {estilo.icono}
          </div>
          <h3 style={{ margin: 0, fontSize: "1.15rem", color: "var(--text-primary)" }}>{item.titulo ?? estilo.titulo}</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto", minHeight: 0 }}>
          <div style={{ fontSize: "0.98rem", fontWeight: 600, lineHeight: 1.45, color: "var(--text-primary)", overflowWrap: "anywhere" }}>{frase}</div>
          {detalles.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
              {detalles.map((d, i) => (
                <li key={i} style={{ overflowWrap: "anywhere" }}>
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{pendientes > 1 ? `Hay ${pendientes - 1} aviso(s) más después de este` : ""}</span>
          <div style={{ display: "flex", gap: "10px" }}>
            {item.cancelar && (
              <button type="button" className="btn btn-secondary" data-tecla="escape" onClick={() => alCerrar(false)}>
                {item.cancelar}
              </button>
            )}
            <button type="button" className="btn btn-primary" data-tecla={item.cancelar ? "enter" : undefined} autoFocus style={item.peligro ? { background: "var(--danger)", borderColor: "var(--danger)" } : undefined} onClick={() => alCerrar(true)}>
              {item.aceptar ?? "Aceptar"}
            </button>
          </div>
        </div>
        {auto > 0 && (
          <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "3px", background: "var(--border-light)" }}>
            <div style={{ height: "100%", background: estilo.borde, animation: `notificacion-cuenta-atras ${auto}ms linear forwards` }} />
          </div>
        )}
        <style>{`@keyframes notificacion-cuenta-atras { from { width: 100%; } to { width: 0%; } }`}</style>
      </div>
    </div>
  );
}

export function useToast(): ContextoToast {
  return useContext(Contexto);
}
