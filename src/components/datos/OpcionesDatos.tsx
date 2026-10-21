"use client";

import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import BotonBiblioteca from "@/components/biblioteca/BotonBiblioteca";
import type { CategoriaBiblioteca } from "@/lib/servicios/biblioteca";

/* Piezas de las ventanas «Importar y exportar» (Expedientes, Clientes…): mismo aspecto en todas las pantallas */

export function GrupoDatos({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap", borderBottom: "1px solid var(--border-light)", paddingBottom: "4px" }}>
        <b>{titulo}</b>
        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{ayuda}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "10px" }} className="rejilla-propia">
        {children}
      </div>
    </section>
  );
}

/** Una opción: botón (o selector de archivo) con su nombre y una frase que explica qué hace. */
export function OpcionDatos({ icono, titulo, texto, ayuda, archivo, deshabilitado, alElegir, alPulsar, biblioteca }: { icono: string; titulo: string; texto: string; ayuda: string; archivo?: string; deshabilitado?: boolean; alElegir?: (e: ChangeEvent<HTMLInputElement>) => void; alPulsar?: () => void; biblioteca?: { categorias: CategoriaBiblioteca[]; multiple?: boolean; alElegir: (archivos: File[]) => void | Promise<void> } }) {
  const estilo: CSSProperties = { display: "flex", gap: "10px", alignItems: "flex-start", textAlign: "left", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "12px 14px", background: "rgba(255, 255, 255, 0.03)", color: "var(--text-primary)", cursor: deshabilitado ? "not-allowed" : "pointer", opacity: deshabilitado ? 0.5 : 1, width: "100%" };
  const contenido = (
    <>
      <span style={{ fontSize: "1.3rem" }}>{icono}</span>
      <span>
        <b style={{ display: "block" }}>{titulo}</b>
        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{texto}</span>
      </span>
    </>
  );
  if (archivo) {
    const tarjeta = (
      <label style={estilo} title={ayuda}>
        {contenido}
        <input type="file" accept={archivo} onChange={alElegir} style={{ display: "none" }} disabled={deshabilitado} />
      </label>
    );
    // Con biblioteca, debajo de la tarjeta sale «Elegir de la biblioteca» (el mismo archivo ya guardado, sin buscarlo en el equipo)
    if (!biblioteca) return tarjeta;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start" }}>
        {tarjeta}
        <BotonBiblioteca categorias={biblioteca.categorias} multiple={biblioteca.multiple} deshabilitado={deshabilitado} alElegir={biblioteca.alElegir} />
      </div>
    );
  }
  return (
    <button type="button" style={estilo} title={ayuda} disabled={deshabilitado} onClick={alPulsar}>
      {contenido}
    </button>
  );
}

/** Tarjeta con título, explicación y los botones propios de una zona (copias internas, copia de datos básicos…). */
export function CajaDatos({ titulo, texto, children }: { titulo: string; texto: string; children: ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontWeight: 600 }}>{titulo}</div>
      <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{texto}</div>
      {children}
    </div>
  );
}
