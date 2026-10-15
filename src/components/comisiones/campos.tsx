"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { aCentesimas, deCentesimas } from "@/lib/formato";

const estiloNum: CSSProperties = { textAlign: "right", minWidth: "90px" };

interface PropsNumero {
  valor: number | null;
  onChange: (v: number | null) => void;
  vacioEsNulo?: boolean;
  sufijo?: string;
  placeholder?: string;
  ancho?: string;
  disabled?: boolean;
}

/** Campo decimal («1.234,50») que guarda un entero ×100 (euros → céntimos, puntos → centésimas). */
export function InputCentesimas({ valor, onChange, vacioEsNulo = false, sufijo, placeholder, ancho, disabled }: PropsNumero) {
  const [texto, setTexto] = useState<string | null>(null);
  const mostrado = texto ?? deCentesimas(valor);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
      <input
        className="form-input"
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder}
        style={{ ...estiloNum, width: ancho, padding: "6px 8px" }}
        value={mostrado}
        onChange={(e) => {
          setTexto(e.target.value);
          const n = aCentesimas(e.target.value);
          if (n !== null) onChange(n);
          else if (e.target.value.trim() === "") onChange(vacioEsNulo ? null : 0);
        }}
        onBlur={() => setTexto(null)}
      />
      {sufijo && <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{sufijo}</span>}
    </span>
  );
}

export function InputEntero({ valor, onChange, ancho = "80px", min, max, disabled }: { valor: number; onChange: (v: number) => void; ancho?: string; min?: number; max?: number; disabled?: boolean }) {
  return (
    <input
      className="form-input"
      type="number"
      disabled={disabled}
      min={min}
      max={max}
      style={{ width: ancho, padding: "6px 8px", textAlign: "right" }}
      value={Number.isFinite(valor) ? valor : 0}
      onChange={(e) => onChange(Math.trunc(Number(e.target.value) || 0))}
    />
  );
}

export function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">{etiqueta}</label>
      {children}
      {ayuda && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>{ayuda}</div>}
    </div>
  );
}

export function Seccion({ titulo, children, acciones, ayuda }: { titulo: string; children: ReactNode; acciones?: ReactNode; ayuda?: string }) {
  return (
    <section className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <h3 style={{ fontSize: "1.05rem" }}>{titulo}</h3>
        {acciones}
      </div>
      {ayuda && <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0 }}>{ayuda}</p>}
      {children}
    </section>
  );
}

export function BotonMini({ onClick, children, peligro, titulo }: { onClick: () => void; children: ReactNode; peligro?: boolean; titulo?: string }) {
  return (
    <button type="button" title={titulo} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem", color: peligro ? "var(--danger)" : undefined }} onClick={onClick}>
      {children}
    </button>
  );
}
