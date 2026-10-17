"use client";

import { useRef, useState } from "react";

interface Props {
  icono: string;
  titulo: string;
  ayuda: string;
  /** Acepta varios ficheros a la vez. */
  multiple?: boolean;
  /** Muestra «trabajando…» y no admite más ficheros. */
  ocupado?: boolean;
  /** Texto que se ve mientras está ocupado (por defecto «Leyendo…»). */
  textoOcupado?: string;
  disabled?: boolean;
  /** Franja baja de una sola línea (para fichas), en vez del cuadro grande. */
  compacta?: boolean;
  alSoltar: (ficheros: File[]) => void | Promise<void>;
}

/** Cuadro para arrastrar ficheros encima o pulsar para elegirlos (imágenes y PDF). */
export default function ZonaSoltar({ icono, titulo, ayuda, multiple = false, ocupado = false, textoOcupado = "Leyendo…", disabled = false, compacta = false, alSoltar }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const inactivo = disabled || ocupado;

  const recibir = (lista: FileList | null) => {
    if (!lista || lista.length === 0 || inactivo) return;
    const ficheros = Array.from(lista).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf" || /\.(pdf|jpe?g|png|webp)$/i.test(f.name));
    if (ficheros.length > 0) void alSoltar(multiple ? ficheros : ficheros.slice(0, 1));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      title={ayuda}
      onClick={() => !inactivo && entrada.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!inactivo) entrada.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!inactivo) setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        recibir(e.dataTransfer.files);
      }}
      style={{
        ...(compacta ? { flex: "0 0 auto", padding: "6px 14px", flexDirection: "row", gap: "10px", justifyContent: "center" } : { flex: "1 1 180px", minWidth: "160px", padding: "14px 12px" }),
        textAlign: "center",
        borderRadius: "var(--radius-sm)",
        border: `2px dashed ${encima ? "var(--primary)" : "var(--border-light)"}`,
        background: encima ? "var(--bg-surface-hover)" : "var(--bg-surface-tint)",
        cursor: inactivo ? "wait" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "var(--transition)",
        display: "flex",
        ...(compacta ? {} : { flexDirection: "column", gap: "4px" }),
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: compacta ? "1.2rem" : "1.6rem" }}>{ocupado ? "⏳" : icono}</span>
      <strong style={{ fontSize: "0.85rem" }}>{ocupado ? textoOcupado : titulo}</strong>
      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{compacta ? "Arrastra o pulsa" : "Arrastra aquí o pulsa para elegir"}</span>
      <input
        ref={entrada}
        type="file"
        multiple={multiple}
        accept="image/*,.pdf,application/pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          recibir(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
