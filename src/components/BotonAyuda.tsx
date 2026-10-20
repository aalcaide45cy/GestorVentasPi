"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { GUIAS } from "@/lib/guias";

/**
 * Circulito con una «i» que se pone junto al nombre de una pestaña: al pulsarlo sale una ventana con la guía de cómo usarla (para qué
 * sirve, los pasos y lo que conviene saber). El texto de cada guía está en `lib/guias.ts`.
 */
export default function BotonAyuda({ guia }: { guia: string }) {
  const [abierta, setAbierta] = useState(false);
  const g = GUIAS[guia];
  if (!g) return null;
  return (
    <>
      <button
        type="button"
        aria-label={`Guía de uso: ${g.titulo}`}
        title={`Cómo usar «${g.titulo}»`}
        onClick={(e) => {
          e.stopPropagation();
          setAbierta(true);
        }}
        style={{ width: "20px", height: "20px", flexShrink: 0, borderRadius: "50%", border: "1.5px solid var(--primary)", background: "transparent", color: "var(--primary)", fontSize: "0.72rem", fontWeight: 800, fontStyle: "italic", fontFamily: "Georgia, serif", lineHeight: 1, cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      >
        i
      </button>
      {abierta && (
        <Modal
          titulo={`ℹ️ ${g.titulo}: cómo se usa`}
          ancho="640px"
          pie={
            <button type="button" className="btn btn-primary" data-tecla="escape" autoFocus onClick={() => setAbierta(false)}>
              Entendido
            </button>
          }
        >
          <p style={{ margin: 0, lineHeight: 1.55 }}>{g.queEs}</p>
          <div>
            <h4 style={{ margin: "0 0 8px 0", fontSize: "0.95rem" }}>Paso a paso</h4>
            <ol style={{ margin: 0, paddingLeft: "22px", display: "flex", flexDirection: "column", gap: "6px", lineHeight: 1.5, fontSize: "0.92rem" }}>
              {g.pasos.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </div>
          {g.ojo && g.ojo.length > 0 && (
            <div style={{ borderLeft: "3px solid var(--warning)", background: "var(--bg-surface-tint)", padding: "10px 14px", borderRadius: "var(--radius-sm)" }}>
              <h4 style={{ margin: "0 0 6px 0", fontSize: "0.92rem" }}>Conviene saber</h4>
              <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {g.ojo.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
