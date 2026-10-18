"use client";

import { useState, type CSSProperties, type InputHTMLAttributes } from "react";

/** Campo de contraseña o clave con un ojo al final para ver lo que se escribe. */
export default function CampoSecreto({ style, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { style?: CSSProperties }) {
  const [visible, setVisible] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", width: "100%", ...style }}>
      <input {...props} className={props.className ?? "form-input"} type={visible ? "text" : "password"} style={{ width: "100%", paddingRight: "42px" }} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar" : "Mostrar"}
        title={visible ? "Ocultar" : "Mostrar lo que has escrito"}
        style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", padding: "4px", color: "var(--text-secondary)" }}
      >
        {visible ? "🙈" : "👁️"}
      </button>
    </span>
  );
}
