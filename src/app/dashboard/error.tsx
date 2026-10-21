"use client";

import PantallaError from "@/components/incidencias/PantallaError";

export default function ErrorDelPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PantallaError error={error} reset={reset} />;
}
