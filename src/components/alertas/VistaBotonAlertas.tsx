import type { CSSProperties } from "react";
import {
  animacionDeAlerta,
  estiloIcono,
  type AspectoAlertas,
} from "./aspecto-alertas";

/** El botón de alertas tal y como se ve (en la barra superior y en la vista previa de Configuración). Con `activo` lleva el número y la animación. */
export default function VistaBotonAlertas({
  aspecto,
  pendientes,
  activo,
  alPulsar,
  titulo,
}: {
  aspecto: AspectoAlertas;
  pendientes: number;
  activo: boolean;
  alPulsar?: () => void;
  titulo?: string;
}) {
  const animacion = animacionDeAlerta(aspecto);
  const estilo: CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "36px",
    height: "36px",
    padding: "0 6px",
    borderRadius: "var(--radius-sm)",
    cursor: alPulsar ? "pointer" : "default",
    flex: "0 0 auto",
  };
  if (activo) {
    estilo.border = `1px solid ${aspecto.color}`;
    estilo.background =
      aspecto.estilo === "solido"
        ? aspecto.color
        : aspecto.estilo === "suave"
          ? `${aspecto.color}33`
          : "transparent";
    if (animacion.enBoton) Object.assign(estilo, animacion.estilo);
  } else {
    estilo.border = "1px solid var(--border-light)";
    estilo.background = "transparent";
  }
  return (
    <button
      type="button"
      onClick={alPulsar}
      aria-label={titulo}
      title={titulo}
      className={activo && animacion.enBoton ? animacion.clase : undefined}
      style={estilo}
    >
      <span
        className={activo && !animacion.enBoton ? animacion.clase : undefined}
        style={{
          ...estiloIcono(aspecto),
          ...(activo && !animacion.enBoton
            ? animacion.estilo
            : { opacity: 0.6 }),
        }}
      >
        {aspecto.icono}
      </span>
      {activo && pendientes > 0 && (
        <span
          style={{
            position: "absolute",
            top: "-6px",
            right: "-6px",
            minWidth: "18px",
            height: "18px",
            padding: "0 5px",
            borderRadius: "9px",
            background: aspecto.color,
            color: aspecto.color.toLowerCase() === "#ffffff" ? "#000" : "#fff",
            border: "1px solid var(--bg-card)",
            fontSize: "0.68rem",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {pendientes > 99 ? "99+" : pendientes}
        </span>
      )}
    </button>
  );
}
