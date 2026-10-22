"use client";

import { claveMostrarAnulados, claveMostrarDeshabilitados } from "@/lib/anulados";
import { usePreferencia } from "@/lib/preferencias";

/** Preferencia «mostrar anulados» de una pantalla: se recuerda en este navegador y por defecto está desactivada. */
export function useMostrarAnulados(pantalla: string, porDefecto = false): [boolean, (valor: boolean) => void] {
  const [guardado, guardar] = usePreferencia(claveMostrarAnulados(pantalla));
  return [guardado === null ? porDefecto : guardado === "true", (v) => guardar(String(v))];
}

/** Preferencia «mostrar deshabilitados» de una pantalla (se recuerda en este navegador; por defecto, desactivada). */
export function useMostrarDeshabilitados(pantalla: string, porDefecto = false): [boolean, (valor: boolean) => void] {
  const [guardado, guardar] = usePreferencia(claveMostrarDeshabilitados(pantalla));
  return [guardado === null ? porDefecto : guardado === "true", (v) => guardar(String(v))];
}

interface PropsCasilla {
  activa: boolean;
  alCambiar: (v: boolean) => void;
  /** Cuántos hay ocultos (o que se mostrarían). */
  ocultos: number;
  /** Se enseña aunque no se sepa cuántos hay (listados que no los cargan hasta pedirlos). */
  siempre?: boolean;
  estilo?: React.CSSProperties;
}

function CasillaOculta({ activa, alCambiar, ocultos, siempre, estilo, etiqueta, ayuda }: PropsCasilla & { etiqueta: string; ayuda: string }) {
  if (ocultos === 0 && !activa && !siempre) return null;
  return (
    <label
      title={ayuda}
      style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, padding: "5px 10px", borderRadius: "var(--radius-sm)", border: `1px solid ${activa ? "var(--primary)" : "var(--border-light)"}`, background: activa ? "rgba(var(--primary-rgb), 0.12)" : "rgba(255, 255, 255, 0.05)", ...estilo }}
    >
      <input type="checkbox" checked={activa} onChange={(e) => alCambiar(e.target.checked)} style={{ width: "15px", height: "15px", accentColor: "var(--primary)", cursor: "pointer" }} />
      <span>
        {etiqueta}
        {ocultos > 0 ? ` (${ocultos}${activa ? "" : " ocultos"})` : ""}
      </span>
    </label>
  );
}

/**
 * Casilla «🚫 Mostrar anulados» de un listado de expedientes. Dice cuántos hay ocultos para que no pasen desapercibidos; si no hay ninguno anulado,
 * no se enseña.
 */
export default function CasillaAnulados({ activa, alCambiar, anulados, siempre, estilo }: Omit<PropsCasilla, "ocultos"> & { anulados: number }) {
  return (
    <CasillaOculta activa={activa} alCambiar={alCambiar} ocultos={anulados} siempre={siempre} estilo={estilo} etiqueta="🚫 Mostrar anulados" ayuda="Los expedientes anulados en el listado de la intranet del fabricante no son ventas, así que salen ocultos. Activa la casilla para verlos." />
  );
}

/**
 * Casilla «⏸ Mostrar deshabilitados»: los expedientes deshabilitados no cuentan (ni en las comisiones, la tasa y las liquidaciones, ni en los totales y
 * listados) salvo que se active. Si no hay ninguno, no se enseña.
 */
export function CasillaDeshabilitados({ activa, alCambiar, deshabilitados, siempre, estilo }: Omit<PropsCasilla, "ocultos"> & { deshabilitados: number }) {
  return (
    <CasillaOculta activa={activa} alCambiar={alCambiar} ocultos={deshabilitados} siempre={siempre} estilo={estilo} etiqueta="⏸ Mostrar deshabilitados" ayuda="Los expedientes deshabilitados no cuentan en las comisiones, la tasa ni las liquidaciones, y tampoco en los totales y listados. Activa la casilla para verlos y contarlos." />
  );
}
