"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { mensajeDeError } from "@/components/expedientes/comun";

/** Estado de ordenación por columna (primer clic ascendente, segundo descendente). */
export function useOrden(campoInicial = "id") {
  const [campo, setCampo] = useState(campoInicial);
  const [asc, setAsc] = useState(true);
  const ordenar = (c: string) => {
    if (campo === c) setAsc(!asc);
    else {
      setCampo(c);
      setAsc(true);
    }
  };
  const flecha = (c: string) => (campo === c ? (asc ? " ▲" : " ▼") : " ↕");
  return { campo, asc, ordenar, flecha };
}

/** Compara dos valores (texto o número) respetando el sentido de ordenación. */
export function comparar(a: string | number, b: string | number, asc: boolean): number {
  const r = typeof a === "string" && typeof b === "string" ? a.localeCompare(b, "es") : a < b ? -1 : a > b ? 1 : 0;
  return asc ? r : -r;
}

export function Cabecera({ etiqueta, campo, orden, ancho }: { etiqueta: string; campo: string; orden: ReturnType<typeof useOrden>; ancho?: string }) {
  return (
    <th onClick={() => orden.ordenar(campo)} style={{ cursor: "pointer", userSelect: "none", ...(ancho ? { width: ancho } : {}) }}>
      {etiqueta}
      {orden.flecha(campo)}
    </th>
  );
}

/** Peticiones JSON a la API de administración con aviso de éxito/error y refresco de datos. */
export function usePeticion() {
  const router = useRouter();
  const { mostrar, confirmar, notificar } = useToast();
  const [cargando, setCargando] = useState(false);

  async function llamar<T = unknown>(url: string, metodo: "POST" | "PUT" | "DELETE", cuerpo: object, porDefecto: string): Promise<T> {
    const res = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    if (!res.ok) throw new Error(await mensajeDeError(res, porDefecto));
    return ((await res.json()) as { data?: T }).data as T;
  }

  /** Ejecuta una acción mostrando el aviso de éxito o el error; devuelve `true` si fue bien. */
  async function ejecutar(accion: () => Promise<void>, exito: string): Promise<boolean> {
    setCargando(true);
    try {
      await accion();
      mostrar(exito);
      router.refresh();
      return true;
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Ha ocurrido un error.", "error");
      return false;
    } finally {
      setCargando(false);
    }
  }

  return { cargando, llamar, ejecutar, mostrar, confirmar, notificar };
}

export const estiloPanel = { padding: "28px", display: "flex", flexDirection: "column", gap: "24px" } as const;
export const estiloBotonPeligro = { padding: "6px 10px", color: "var(--danger)", border: "1px solid var(--border-light)" } as const;
export const estiloEtiquetaCheck = { cursor: "pointer", fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: 500 } as const;
export const estiloCheck = { width: "18px", height: "18px", cursor: "pointer" } as const;
