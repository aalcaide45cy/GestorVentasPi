"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AvisarFallo from "./AvisarFallo";
import { contextoDelNavegador, vigilanteActivo } from "@/lib/incidencias-cliente";

/**
 * Pantalla que sale cuando una página se rompe del todo: explica qué ha pasado, ya ha avisado sola del error y deja reintentar, ir al inicio
 * o contar qué se estaba haciendo. Si no hay vigilante (error fuera del panel), avisa directamente al servidor.
 */
export default function PantallaError({ error, reset, completa = false }: { error: Error & { digest?: string }; reset: () => void; completa?: boolean }) {
  const [avisando, setAvisando] = useState(false);

  useEffect(() => {
    const evento = { origen: "navegador" as const, nivel: "error" as const, titulo: `Pantalla rota: ${error.message || "error desconocido"}`, detalle: `${error.stack ?? ""}${error.digest ? `\ndigest: ${error.digest}` : ""}`, ruta: location.pathname };
    const colector = vigilanteActivo();
    if (colector) colector.fallo(evento);
    else void fetch("/api/incidencias", { method: "POST", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventos: [{ ...evento, contexto: contextoDelNavegador(null) }] }) }).catch(() => undefined);
  }, [error]);

  const contenido = (
    <div className="glass-panel" style={{ padding: "40px", maxWidth: "560px", margin: "60px auto", display: "flex", flexDirection: "column", gap: "16px", borderLeft: "4px solid var(--danger)", textAlign: "left" }}>
      <h2 style={{ fontSize: "1.4rem", margin: 0 }}>Algo ha fallado en esta pantalla</h2>
      <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
        La aplicación ha tenido un problema al mostrar esta página. Ya se ha anotado el error para revisarlo. Tus datos no se han tocado: puedes reintentar o volver al inicio.
      </p>
      <code style={{ fontSize: "0.8rem", color: "var(--text-muted)", wordBreak: "break-word" }}>{error.message}</code>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" onClick={reset}>
          Reintentar
        </button>
        <Link href="/dashboard" className="btn btn-secondary">
          Ir al inicio
        </Link>
        <button type="button" className="btn btn-secondary" onClick={() => setAvisando(true)} title="Cuenta qué estabas haciendo y adjunta una captura">
          🐞 Contar qué estaba haciendo
        </button>
      </div>
      {avisando && <AvisarFallo alCerrar={() => setAvisando(false)} version={null} textoInicial={`Se rompió la pantalla ${typeof location !== "undefined" ? location.pathname : ""}: `} />}
    </div>
  );
  return completa ? <div style={{ minHeight: "calc(100 * var(--uvh))", background: "var(--bg-app)", color: "var(--text-primary)", padding: "20px" }}>{contenido}</div> : contenido;
}
