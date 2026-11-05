"use client";

import { useSyncExternalStore } from "react";

/** Qué expedientes ya tienen enviado el correo de cada fecha (botón ✉️ de la lista): se pide una vez por fecha y se refresca al volver a la pestaña. */
const datos = new Map<string, Map<number, string>>();
const pedidas = new Set<string>();
const oyentes = new Set<() => void>();
let version = 0;
const avisar = () => {
  version++;
  oyentes.forEach((f) => f());
};

async function pedir(campo: string): Promise<void> {
  try {
    const r = await fetch(`/api/correo/enviados?campo=${campo}`);
    if (!r.ok) return;
    const j = (await r.json()) as {
      data?: { id: number; enviado_en: string }[];
    };
    datos.set(campo, new Map((j.data ?? []).map((x) => [x.id, x.enviado_en])));
    avisar();
  } catch {
    /* sin datos: el sobre se queda como está */
  }
}

if (typeof window !== "undefined")
  window.addEventListener("focus", () => pedidas.forEach((c) => void pedir(c)));

/** Cuándo se envió el correo de esa fecha para ese expediente (ISO), o null si no se ha enviado. */
export function useCorreoEnviado(
  campo: string,
  idExpediente: number,
  activo: boolean,
): string | null {
  useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => version,
    () => 0,
  );
  if (activo && !pedidas.has(campo)) {
    pedidas.add(campo);
    queueMicrotask(() => void pedir(campo));
  }
  return datos.get(campo)?.get(idExpediente) ?? null;
}

/** Se acaba de enviar el correo de esa fecha: el sobre se pone verde enseguida. */
export function marcarCorreoEnviado(campo: string, idExpediente: number): void {
  const m = datos.get(campo) ?? new Map<number, string>();
  m.set(idExpediente, new Date().toISOString());
  datos.set(campo, m);
  avisar();
}
