"use client";

import { CLAVE_ABIERTO, CLAVE_MOSTRAR_LABORATORIO } from "@/components/LaboratorioComisiones";
import { usePreferencia } from "@/lib/preferencias";

/** Botón 🧪 de la barra de arriba: abre o cierra el laboratorio de comisiones (se puede ocultar en el perfil). */
export default function BotonLaboratorio() {
  const [abierto, fijarAbierto] = usePreferencia(CLAVE_ABIERTO);
  const [mostrar] = usePreferencia(CLAVE_MOSTRAR_LABORATORIO);
  if (mostrar === "false") return null;
  const activo = abierto === "true";
  return (
    <button
      type="button"
      onClick={() => fijarAbierto(activo ? "false" : "true")}
      aria-pressed={activo}
      title="Laboratorio de comisiones: toca reglas y mira cómo se mueven los puntos, el tramo y la comisión sin guardar nada"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", flexShrink: 0, border: `1px solid ${activo ? "var(--primary)" : "var(--border-light)"}`, borderRadius: "var(--radius-sm)", background: activo ? "rgba(59,130,246,0.18)" : "var(--bg-card)", color: "var(--text-primary)", cursor: "pointer", fontSize: "1.05rem" }}
    >
      🧪
    </button>
  );
}
