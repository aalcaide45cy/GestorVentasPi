"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useVersionDatos } from "@/lib/datos-version";
import { llamar, textoError } from "./api";

/**
 * Carga un recurso JSON de la API y permite recargarlo. Los errores salen como aviso.
 * Con `url = null` no hace nada.
 */
export function useCarga<T>(url: string | null, inicial: T): { datos: T; recargar: () => void } {
  const { mostrar } = useToast();
  const [datos, setDatos] = useState<T>(inicial);
  const [version, setVersion] = useState(0);
  const versionDatos = useVersionDatos();

  useEffect(() => {
    if (url === null) return;
    let vivo = true;
    llamar<T>(url)
      .then((r) => {
        if (vivo) setDatos(r.data);
      })
      .catch((e: unknown) => {
        if (vivo) mostrar(textoError(e), "error");
      });
    return () => {
      vivo = false;
    };
  }, [url, version, versionDatos, mostrar]);

  return { datos, recargar: () => setVersion((v) => v + 1) };
}
