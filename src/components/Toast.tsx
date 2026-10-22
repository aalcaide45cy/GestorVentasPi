"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import PanelRegistroNotificaciones from "@/components/PanelRegistroNotificaciones";
import { registrarNotificacion } from "@/lib/notificaciones-cliente";
import { avisoDeErrorMostrado } from "@/lib/incidencias-cliente";

type TipoToast = "exito" | "error" | "aviso";

/** Una notificación: título, mensaje y detalles opcionales. Con botón de cancelar es una confirmación (ventana); si no, un aviso flotante. */
export interface OpcionesNotificacion {
  titulo?: string;
  texto: string;
  /** Líneas con el detalle de lo ocurrido (se enseñan en una lista bajo el mensaje). */
  detalles?: string[];
  tipo?: TipoToast;
  aceptar?: string;
  /** Con texto, sale una ventana de confirmación con este botón de cancelar. */
  cancelar?: string;
  /** Botón de aceptar en rojo (acciones que borran). */
  peligro?: boolean;
  /** Milisegundos que se queda el aviso flotante (por defecto 6 s los de éxito, 10 s los avisos y 15 s los errores); con 0 no se cierra solo. Con 3 s o menos no se anota en el registro. */
  duracionMs?: number;
}

interface Item extends OpcionesNotificacion {
  id: number;
  tipo: TipoToast;
  resolver: (aceptada: boolean) => void;
}

interface ContextoToast {
  /** Aviso corto: sale flotando arriba y queda anotado en el registro de notificaciones. Es la forma de siempre de avisar. */
  mostrar: (texto: string, tipo?: TipoToast, duracionMs?: number) => void;
  /** Aviso con título y detalles. Sin «cancelar» sale flotando arriba (y se resuelve a true al cerrarse); con «cancelar» es una ventana que devuelve false si se cancela. */
  notificar: (opciones: OpcionesNotificacion) => Promise<boolean>;
  /** Pide confirmación antes de hacer algo: ventana con lo que va a pasar, «Aceptar» y «Cancelar». No se anota en el registro. */
  confirmar: (opciones: Omit<OpcionesNotificacion, "cancelar"> & { cancelar?: string }) => Promise<boolean>;
  /** Abre el registro con todas las notificaciones anteriores. */
  abrirRegistro: () => void;
}

const Contexto = createContext<ContextoToast>({ mostrar: () => undefined, notificar: async () => true, confirmar: async () => false, abrirRegistro: () => undefined });

const ESTILO: Record<TipoToast, { borde: string; fondo: string; icono: string; titulo: string }> = {
  exito: { borde: "var(--success)", fondo: "rgba(34, 197, 94, 0.15)", icono: "✅", titulo: "Hecho" },
  error: { borde: "var(--danger)", fondo: "rgba(239, 68, 68, 0.15)", icono: "🛑", titulo: "No se ha podido" },
  aviso: { borde: "var(--warning)", fondo: "rgba(234, 179, 8, 0.15)", icono: "⚠️", titulo: "Atención" },
};

const DURACION: Record<TipoToast, number> = { exito: 6000, aviso: 10000, error: 15000 };
const MAX_VISIBLES = 4;
const MAX_DETALLES = 4;

/** Separa un mensaje en una frase principal y el resto como detalles («Hecho. Copia previa: x. Otra cosa.» → frase + 2 líneas). */
export function partir(texto: string): { frase: string; detalles: string[] } {
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
 * Notificaciones de la aplicación. Los avisos (éxito, error, atención) salen como tarjetas flotantes arriba, sin pedir que se acepten:
 * se cierran solas (más tarde los errores), se pueden cerrar a mano y se detienen mientras se tiene el ratón encima. Todos quedan anotados
 * en el registro de notificaciones (campana de la barra superior) para poder repasarlos otro día. Solo las confirmaciones («¿Seguro?»)
 * siguen siendo una ventana, porque hay que decidir algo: Enter acepta y Esc cancela.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [flotantes, setFlotantes] = useState<Item[]>([]);
  const [ventanas, setVentanas] = useState<Item[]>([]);
  const [registroAbierto, setRegistroAbierto] = useState(false);
  const contador = useRef(0);

  const notificar = useCallback(
    (o: OpcionesNotificacion) =>
      new Promise<boolean>((resolver) => {
        const id = ++contador.current;
        const item: Item = { ...o, id, tipo: o.tipo ?? "exito", resolver };
        if (o.cancelar) {
          setVentanas((prev) => [...prev, item]);
          return;
        }
        const { frase, detalles } = partir(o.texto);
        // Un aviso de error es lo que la persona vio fallar: también se anota en el centro de incidencias
        if (item.tipo === "error") avisoDeErrorMostrado(frase);
        // Los toques fugaces (3 s o menos, como «Copiado») no tienen nada que repasar y no se anotan
        if (o.duracionMs === undefined || o.duracionMs === 0 || o.duracionMs > 3000) registrarNotificacion({ tipo: item.tipo, titulo: o.titulo ?? null, texto: frase, detalles: [...(o.detalles ?? []), ...detalles] });
        setFlotantes((prev) => [...prev, item]);
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
  const abrirRegistro = useCallback(() => setRegistroAbierto(true), []);

  const valor = useMemo(() => ({ mostrar, notificar, confirmar, abrirRegistro }), [mostrar, notificar, confirmar, abrirRegistro]);
  const ventana = ventanas[0] ?? null;

  const cerrarVentana = useCallback((aceptada: boolean) => {
    setVentanas((prev) => {
      prev[0]?.resolver(aceptada);
      return prev.slice(1);
    });
  }, []);
  const cerrarFlotante = useCallback((id: number) => {
    setFlotantes((prev) => {
      prev.find((x) => x.id === id)?.resolver(true);
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const visibles = flotantes.slice(-MAX_VISIBLES);
  return (
    <Contexto.Provider value={valor}>
      {children}
      {visibles.length > 0 && (
        <div
          aria-live="polite"
          style={{ position: "fixed", top: "12px", left: "50%", transform: "translateX(-50%)", width: "min(440px, calc(calc(100 * var(--uvw)) - 24px))", display: "flex", flexDirection: "column", gap: "10px", zIndex: 7000, pointerEvents: "none" }}
        >
          {visibles.map((item) => (
            <Tarjeta key={item.id} item={item} alCerrar={cerrarFlotante} alVerRegistro={abrirRegistro} />
          ))}
        </div>
      )}
      {ventana && <Ventana key={ventana.id} item={ventana} pendientes={ventanas.length} alCerrar={cerrarVentana} />}
      {registroAbierto && <PanelRegistroNotificaciones alCerrar={() => setRegistroAbierto(false)} />}
    </Contexto.Provider>
  );
}

/** Aviso flotante: se cierra solo (salvo duración 0), con una barra que se vacía; el ratón encima lo detiene. */
function Tarjeta({ item, alCerrar, alVerRegistro }: { item: Item; alCerrar: (id: number) => void; alVerRegistro: () => void }) {
  const estilo = ESTILO[item.tipo];
  const { frase, detalles: deTexto } = partir(item.texto);
  const detalles = [...(item.detalles ?? []), ...deTexto];
  const duracion = item.duracionMs ?? DURACION[item.tipo];
  const [pausado, setPausado] = useState(false);
  // Tiempo que le queda: al quitar el ratón sigue por donde iba
  const quedan = useRef(duracion);
  const desde = useRef(0);

  useEffect(() => {
    if (!duracion || pausado) return;
    desde.current = Date.now();
    const t = setTimeout(() => alCerrar(item.id), quedan.current);
    return () => {
      clearTimeout(t);
      quedan.current = Math.max(500, quedan.current - (Date.now() - desde.current));
    };
  }, [duracion, pausado, alCerrar, item.id]);

  return (
    <div
      role={item.tipo === "error" ? "alert" : "status"}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      className="glass-panel"
      style={{ pointerEvents: "auto", position: "relative", overflow: "hidden", padding: "12px 38px 12px 14px", display: "flex", gap: "12px", alignItems: "flex-start", backgroundColor: "var(--bg-app)", backgroundImage: "linear-gradient(var(--bg-card), var(--bg-card))", backdropFilter: "none", borderLeft: `4px solid ${estilo.borde}`, boxShadow: "0 8px 28px rgba(0, 0, 0, 0.35)", borderRadius: "var(--radius-sm)", animation: "notificacion-entra 0.22s ease-out" }}
    >
      <div aria-hidden style={{ width: "30px", height: "30px", borderRadius: "50%", background: estilo.fondo, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", flexShrink: 0 }}>
        {estilo.icono}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0, flex: 1 }}>
        {item.titulo && <div style={{ fontSize: "0.78rem", fontWeight: 700, color: estilo.borde, textTransform: "uppercase", letterSpacing: "0.03em" }}>{item.titulo}</div>}
        <div style={{ fontSize: "0.92rem", fontWeight: 600, lineHeight: 1.4, color: "var(--text-primary)", overflowWrap: "anywhere" }}>{frase}</div>
        {detalles.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: "16px", display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
            {detalles.slice(0, MAX_DETALLES).map((d, i) => (
              <li key={i} style={{ overflowWrap: "anywhere" }}>
                {d}
              </li>
            ))}
          </ul>
        )}
        {detalles.length > MAX_DETALLES && (
          <button type="button" onClick={alVerRegistro} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: "var(--primary)", cursor: "pointer", fontSize: "0.78rem" }}>
            Y {detalles.length - MAX_DETALLES} más: ver en el registro
          </button>
        )}
      </div>
      <button type="button" aria-label="Cerrar el aviso" title="Cerrar (queda guardado en el registro de notificaciones)" onClick={() => alCerrar(item.id)} style={{ position: "absolute", top: "6px", right: "8px", width: "26px", height: "26px", border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.05rem", lineHeight: 1 }}>
        ✕
      </button>
      {duracion > 0 && (
        <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "3px", background: "var(--border-light)" }}>
          <div style={{ height: "100%", background: estilo.borde, animation: `notificacion-cuenta-atras ${duracion}ms linear forwards`, animationPlayState: pausado ? "paused" : "running" }} />
        </div>
      )}
      <style>{`@keyframes notificacion-cuenta-atras { from { width: 100%; } to { width: 0%; } } @keyframes notificacion-entra { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

/** Ventana de confirmación: lo que va a pasar y los botones Aceptar y Cancelar. */
function Ventana({ item, pendientes, alCerrar }: { item: Item; pendientes: number; alCerrar: (aceptada: boolean) => void }) {
  const estilo = ESTILO[item.tipo];
  const { frase, detalles: deTexto } = partir(item.texto);
  const detalles = [...(item.detalles ?? []), ...deTexto];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-live="assertive"
      className="modal-fondo"
      style={{ position: "fixed", top: 0, left: 0, width: "calc(100 * var(--uvw))", height: "calc(100 * var(--uvh))", background: "var(--bg-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 6000, backdropFilter: "blur(4px)", padding: "20px" }}
    >
      <div className="glass-panel modal-panel" style={{ width: "100%", maxWidth: "520px", maxHeight: "calc(85 * var(--uvh))", overflow: "hidden", padding: "26px 28px 22px", display: "flex", flexDirection: "column", gap: "16px", background: "var(--bg-card)", borderLeft: `4px solid ${estilo.borde}`, position: "relative" }}>
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
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{pendientes > 1 ? `Hay ${pendientes - 1} pregunta(s) más después de esta` : ""}</span>
          <div style={{ display: "flex", gap: "10px" }}>
            {item.cancelar && (
              <button type="button" className="btn btn-secondary" data-tecla="escape" onClick={() => alCerrar(false)}>
                {item.cancelar}
              </button>
            )}
            <button type="button" className="btn btn-primary" data-tecla="enter" autoFocus style={item.peligro ? { background: "var(--danger)", borderColor: "var(--danger)" } : undefined} onClick={() => alCerrar(true)}>
              {item.aceptar ?? "Aceptar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useToast(): ContextoToast {
  return useContext(Contexto);
}
