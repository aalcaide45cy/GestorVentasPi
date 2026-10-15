"use client";

import type { ReactNode } from "react";

interface ModalProps {
  titulo: ReactNode;
  children?: ReactNode;
  /** Botones del pie (Cancelar / Aceptar…). El teclado global pulsa el que corresponda con Esc / Enter. */
  pie?: ReactNode;
  ancho?: string;
  /** Borde izquierdo rojo para acciones destructivas. */
  peligro?: boolean;
  tamanoTitulo?: string;
}

/**
 * Contenedor `fixed` a pantalla completa con z-index alto (lo reconoce GlobalModalKeyboardHandler).
 * Valores del original: velo con desenfoque, panel de cristal con 32 px de relleno.
 */
export default function Modal({ titulo, children, pie, ancho = "400px", peligro = false, tamanoTitulo = "1.2rem" }: ModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "var(--bg-overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
        backdropFilter: "blur(4px)",
        padding: "20px",
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: ancho,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "32px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          background: "var(--bg-card)",
          ...(peligro ? { borderLeft: "4px solid var(--danger)" } : {}),
        }}
      >
        <h3 style={{ fontSize: tamanoTitulo, color: "var(--text-primary)", margin: 0 }}>{titulo}</h3>
        {children && <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>{children}</div>}
        {pie && <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px", flexWrap: "wrap" }}>{pie}</div>}
      </div>
    </div>
  );
}

interface ConfirmarProps {
  titulo: ReactNode;
  mensaje: ReactNode;
  textoConfirmar?: string;
  textoOcupado?: string;
  ocupado?: boolean;
  alConfirmar: () => void;
  alCancelar: () => void;
  children?: ReactNode;
  confirmarDeshabilitado?: boolean;
  ancho?: string;
}

/** Confirmación de acción destructiva (borde rojo, botón rojo). */
export function ModalConfirmar({
  titulo,
  mensaje,
  textoConfirmar = "Eliminar",
  textoOcupado = "Eliminando...",
  ocupado = false,
  alConfirmar,
  alCancelar,
  children,
  confirmarDeshabilitado = false,
  ancho = "450px",
}: ConfirmarProps) {
  return (
    <Modal
      titulo={titulo}
      ancho={ancho}
      peligro
      tamanoTitulo="1.25rem"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCancelar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn"
            onClick={alConfirmar}
            disabled={ocupado || confirmarDeshabilitado}
            style={{
              backgroundColor: "var(--danger)",
              color: "white",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "10px 20px",
              cursor: ocupado || confirmarDeshabilitado ? "not-allowed" : "pointer",
              fontWeight: 600,
              opacity: confirmarDeshabilitado ? 0.5 : 1,
            }}
          >
            {ocupado ? textoOcupado : textoConfirmar}
          </button>
        </>
      }
    >
      <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: "1.6", margin: 0 }}>{mensaje}</p>
      {children}
    </Modal>
  );
}
