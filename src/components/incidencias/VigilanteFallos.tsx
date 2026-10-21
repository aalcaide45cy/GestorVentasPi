"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { instalarVigilante, pasoDelVigilante } from "@/lib/incidencias-cliente";

/** Conecta el vigilante de fallos a la página mientras se usa la aplicación (no pinta nada). */
export default function VigilanteFallos({ version }: { version: string | null }) {
  const ruta = usePathname();
  useEffect(() => instalarVigilante(version), [version]);
  useEffect(() => {
    pasoDelVigilante(`Abre ${ruta}`);
  }, [ruta]);
  return null;
}
