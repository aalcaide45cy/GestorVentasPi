"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

interface Posicion {
  top: number;
  left: number;
  width: number;
  desplazamiento: number;
}

/**
 * Cabecera de la tabla que se queda a la vista al bajar la página: la tabla de Expedientes tiene su propio desplazamiento horizontal, así que el truco normal
 * (`position: sticky`) no funciona. Cuando la cabecera de verdad sale por arriba, se enseña una copia fija, alineada con la tabla y con su mismo desplazamiento lateral.
 * `children` es el `<colgroup>` y el `<thead>` de la tabla.
 */
export default function CabeceraFlotante({
  contenedor,
  fijaArriba,
  anchoTabla,
  claseTabla,
  children,
}: {
  contenedor: RefObject<HTMLDivElement | null>;
  fijaArriba?: RefObject<HTMLElement | null>;
  anchoTabla: number;
  claseTabla: string;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<Posicion | null>(null);

  useEffect(() => {
    let marco = 0;
    const calcular = () => {
      marco = 0;
      const c = contenedor.current;
      if (!c) return setPos(null);
      const r = c.getBoundingClientRect();
      // Arriba de todo: en pantallas de escritorio el contenido se desplaza dentro de <main>, así que la cabecera se queda en su borde superior
      const principal = document.querySelector<HTMLElement>(".app-main");
      const arriba =
        principal && getComputedStyle(principal).overflowY === "auto"
          ? Math.max(0, principal.getBoundingClientRect().top)
          : 0;
      // Si hay una parte fija encima (herramientas y filtros, que se pueden plegar y desplegar), la cabecera se queda justo debajo de ella
      const fija = fijaArriba?.current;
      const base = fija
        ? Math.max(arriba, fija.getBoundingClientRect().bottom)
        : arriba;
      const alto = 40;
      if (r.top < base && r.bottom > base + alto + 8 && r.width > 0) {
        setPos((p) =>
          p &&
          p.top === base &&
          p.left === r.left &&
          p.width === r.width &&
          p.desplazamiento === c.scrollLeft
            ? p
            : {
                top: base,
                left: r.left,
                width: r.width,
                desplazamiento: c.scrollLeft,
              },
        );
      } else setPos(null);
    };
    const pedir = () => {
      if (!marco) marco = window.requestAnimationFrame(calcular);
    };
    // En fase de captura se oyen los desplazamientos de cualquier contenedor (la página, <main> o la propia tabla)
    window.addEventListener("scroll", pedir, true);
    window.addEventListener("resize", pedir);
    // Plegar o desplegar los filtros cambia la altura de la parte fija sin que haya scroll: se vuelve a calcular
    const observador =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(pedir) : null;
    if (fijaArriba?.current) observador?.observe(fijaArriba.current);
    if (contenedor.current) observador?.observe(contenedor.current);
    pedir();
    return () => {
      window.removeEventListener("scroll", pedir, true);
      window.removeEventListener("resize", pedir);
      observador?.disconnect();
      if (marco) window.cancelAnimationFrame(marco);
    };
  }, [contenedor, fijaArriba]);

  if (!pos || typeof document === "undefined") return null;
  return createPortal(
    <div
      aria-hidden={false}
      className="cabecera-flotante"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        overflow: "hidden",
        padding: "0 2px",
        zIndex: 39,
        boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
        background: "var(--bg-card)",
        pointerEvents: "auto",
      }}
    >
      <table
        className={claseTabla}
        style={{
          width: anchoTabla,
          minWidth: "100%",
          transform: `translateX(${-pos.desplazamiento}px)`,
          margin: 0,
        }}
      >
        {children}
      </table>
    </div>,
    document.body,
  );
}
