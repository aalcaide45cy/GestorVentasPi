"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CLAVE_RETRASO_FOTO, RETRASO_FOTO_POR_DEFECTO, usePreferencia } from "@/lib/preferencias";

/**
 * Nombre de cliente que, al pasar el ratón por encima, enseña su foto (la cara recortada de su DNI).
 * Sin foto, se pinta el texto tal cual. La imagen se pide solo la primera vez que se pasa el ratón y se coloca con
 * posición fija, y se pinta fuera de la tabla (en el cuerpo de la página): dentro de una tabla con desplazamiento o de un panel con
 * efecto de cristal se recortaba y no se veía.
 */
export default function NombreConFoto({ fotoId, children }: { fotoId?: number | null; children: ReactNode }) {
  const [posicion, setPosicion] = useState<{ x: number; y: number } | null>(null);
  const [fallo, setFallo] = useState(false);
  const [retrasoGuardado] = usePreferencia(CLAVE_RETRASO_FOTO);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retraso = retrasoGuardado !== null && Number(retrasoGuardado) >= 0 ? Number(retrasoGuardado) : RETRASO_FOTO_POR_DEFECTO;
  useEffect(() => () => void (temporizador.current && clearTimeout(temporizador.current)), []);
  if (!fotoId || fallo) return <>{children}</>;

  const ocultar = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    setPosicion(null);
  };
  /** Espera los segundos configurados con el ratón encima antes de enseñar la foto. */
  const mostrar = (el: HTMLElement) => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => colocar(el), retraso * 1000);
  };
  const colocar = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const alto = 240 + 20;
    // Debajo del nombre; si no cabe, encima
    const y = r.bottom + 8 + alto > window.innerHeight ? Math.max(8, r.top - alto - 8) : r.bottom + 8;
    setPosicion({ x: Math.min(r.left, window.innerWidth - 220), y });
  };

  return (
    <span
      style={{ display: "inline-block", cursor: "help" }}
      onMouseEnter={(e) => mostrar(e.currentTarget)}
      onMouseLeave={ocultar}
      onFocus={(e) => mostrar(e.currentTarget)}
      onBlur={ocultar}
      tabIndex={0}
    >
      <span style={{ borderBottom: "1px dotted var(--text-muted)" }}>{children}</span>
      {posicion && typeof document !== "undefined" && createPortal(
        <span role="tooltip" style={{ position: "fixed", left: posicion.x, top: posicion.y, zIndex: 3000, padding: "6px", background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", boxShadow: "0 12px 32px rgba(0,0,0,0.35)", pointerEvents: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/adjuntos?id=${fotoId}&miniatura=1`} alt="Foto del cliente" width={190} height={240} style={{ display: "block", width: "190px", height: "240px", objectFit: "cover", borderRadius: "4px" }} onError={() => setFallo(true)} />
        </span>,
        document.body,
      )}
    </span>
  );
}
