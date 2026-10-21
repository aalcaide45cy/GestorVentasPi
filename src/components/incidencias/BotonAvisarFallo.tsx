"use client";

import { useState } from "react";
import AvisarFallo from "./AvisarFallo";

/** Botón 🐞 de la barra superior (junto a la campana): abre «Avisar de un fallo» desde cualquier pantalla. */
export default function BotonAvisarFallo({ version }: { version: string | null }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Avisar de un fallo"
        title="Avisar de un fallo: cuenta qué ha pasado y adjunta una captura; queda anotado con lo que estabas haciendo"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "var(--bg-card)", color: "var(--text-primary)", cursor: "pointer", fontSize: "1.05rem", flexShrink: 0 }}
      >
        🐞
      </button>
      {abierto && <AvisarFallo alCerrar={() => setAbierto(false)} version={version} />}
    </>
  );
}
