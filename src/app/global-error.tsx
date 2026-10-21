"use client";

import PantallaError from "@/components/incidencias/PantallaError";

/** Último recurso: si falla hasta el diseño general de la aplicación, esta pantalla sustituye a toda la página. */
export default function ErrorGlobal({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0 }}>
        <PantallaError error={error} reset={reset} completa />
      </body>
    </html>
  );
}
