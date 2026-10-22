"use client";

import { usePreferencia } from "@/lib/preferencias";
import { claveMostrarAnulados } from "@/lib/anulados";

/** Preferencia «mostrar anulados» de una pantalla: se recuerda en este navegador y por defecto está desactivada. */
export function useMostrarAnulados(pantalla: string): [boolean, (valor: boolean) => void] {
  const [guardado, guardar] = usePreferencia(claveMostrarAnulados(pantalla));
  return [guardado === "true", (v) => guardar(String(v))];
}

/**
 * Casilla «🚫 Mostrar anulados» de un listado de expedientes. Dice cuántos hay ocultos para que no pasen desapercibidos; si no hay ninguno anulado,
 * no se enseña.
 */
export default function CasillaAnulados({ activa, alCambiar, anulados, siempre, estilo }: { activa: boolean; alCambiar: (v: boolean) => void; anulados: number; /** Se enseña aunque no se sepa cuántos hay (listados que no los cargan hasta pedirlos). */ siempre?: boolean; estilo?: React.CSSProperties }) {
  if (anulados === 0 && !activa && !siempre) return null;
  return (
    <label
      title="Los expedientes anulados en el listado de la intranet del fabricante no son ventas, así que salen ocultos. Activa la casilla para verlos."
      style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, padding: "5px 10px", borderRadius: "var(--radius-sm)", border: `1px solid ${activa ? "var(--primary)" : "var(--border-light)"}`, background: activa ? "rgba(var(--primary-rgb), 0.12)" : "rgba(255, 255, 255, 0.05)", ...estilo }}
    >
      <input type="checkbox" checked={activa} onChange={(e) => alCambiar(e.target.checked)} style={{ width: "15px", height: "15px", accentColor: "var(--primary)", cursor: "pointer" }} />
      <span>
        🚫 Mostrar anulados{anulados > 0 ? ` (${anulados}${activa ? "" : " ocultos"})` : ""}
      </span>
    </label>
  );
}
