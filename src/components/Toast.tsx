"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type TipoToast = "exito" | "error" | "aviso";

interface ToastItem {
  id: number;
  texto: string;
  tipo: TipoToast;
}

interface ContextoToast {
  mostrar: (texto: string, tipo?: TipoToast) => void;
}

const Contexto = createContext<ContextoToast>({ mostrar: () => undefined });

const COLORES: Record<TipoToast, { borde: string; fondo: string }> = {
  exito: { borde: "var(--success)", fondo: "rgba(34, 197, 94, 0.15)" },
  error: { borde: "var(--danger)", fondo: "rgba(239, 68, 68, 0.15)" },
  aviso: { borde: "var(--warning)", fondo: "rgba(234, 179, 8, 0.15)" },
};

/** Mensajes flotantes arriba y centrados: no desplazan el contenido y desaparecen solos. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const contador = useRef(0);

  const mostrar = useCallback((texto: string, tipo: TipoToast = "exito") => {
    const id = ++contador.current;
    setItems((prev) => [...prev, { id, texto, tipo }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tipo === "error" ? 6000 : 4000);
  }, []);

  const valor = useMemo(() => ({ mostrar }), [mostrar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 5000,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="glass-panel"
            style={{
              padding: "14px 24px",
              borderLeft: `4px solid ${COLORES[t.tipo].borde}`,
              background: COLORES[t.tipo].fondo,
              backdropFilter: "blur(16px)",
              color: "var(--text-primary)",
              fontWeight: 600,
              fontSize: "0.95rem",
              boxShadow: "var(--shadow-lg)",
              maxWidth: "90vw",
            }}
          >
            {t.texto}
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useToast(): ContextoToast {
  return useContext(Contexto);
}
