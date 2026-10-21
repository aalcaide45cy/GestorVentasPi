"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useVersionDatos } from "@/lib/datos-version";

/**
 * Pone al día lo que carga el servidor al pintar la página (listas de expedientes y clientes, contadores, avisos) cuando cambian los datos:
 * tras guardar, borrar o importar, o al terminar una tarea en segundo plano. Lo que se carga desde el navegador (`useCarga`) ya se vuelve a
 * pedir con la misma señal. Así no hace falta recargar la página ni se pierde el sitio donde se estaba.
 */
export default function RefrescoDeDatos() {
  const router = useRouter();
  const version = useVersionDatos();
  const inicial = useRef(version);
  useEffect(() => {
    if (version === inicial.current) return;
    router.refresh();
  }, [version, router]);
  return null;
}
