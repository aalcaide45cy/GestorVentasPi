"use client";

import PantallaError from "@/components/incidencias/PantallaError";

export default function ErrorDeLaAplicacion({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PantallaError error={error} reset={reset} completa />;
}
