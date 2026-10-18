"use client";

import { useCallback, useEffect, useState } from "react";
import { guardarPreferencia, usePreferencia } from "./preferencias";

/** Preferencias del navegador: cuándo se activó cada modo de la lista de expedientes y cuántos minutos dura (0 = hasta que se desactive). */
export const CLAVE_SELECCION_DESDE = "exp-seleccion-desde";
export const CLAVE_BORRADO_DESDE = "exp-borrado-desde";
export const CLAVE_SELECCION_MINUTOS = "exp-seleccion-minutos";
export const CLAVE_BORRADO_MINUTOS = "exp-borrado-minutos";

/** Minutos configurados para un modo (0 = sin límite). */
export function leerMinutos(valor: string | null): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 24 * 60) : 0;
}

/** «4:32» o «1:02:10» a partir de los segundos que faltan. */
export function formatoCuentaAtras(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

export interface ModoTemporal {
  activo: boolean;
  /** Segundos que faltan para que se desactive solo; `null` si no tiene límite o está inactivo. */
  restante: number | null;
  alternar: () => void;
  desactivar: () => void;
}

/**
 * Un modo que se activa a mano y se queda activado (aunque se recargue la página o se cambie de pestaña) hasta que se desactive.
 * Si hay un tiempo configurado, pasado ese tiempo desde que se activó se desactiva solo.
 */
export function useModoTemporal(claveDesde: string, claveMinutos: string): ModoTemporal {
  const [desdeTexto] = usePreferencia(claveDesde);
  const [minutosTexto] = usePreferencia(claveMinutos);
  const [ahora, setAhora] = useState(() => Date.now());
  const desde = desdeTexto !== null && Number(desdeTexto) > 0 ? Number(desdeTexto) : null;
  const limite = leerMinutos(minutosTexto) * 60_000;
  const caduca = desde !== null && limite > 0 ? desde + limite : null;
  const activo = desde !== null && (caduca === null || ahora < caduca);

  useEffect(() => {
    const t = setInterval(() => {
      const ya = Date.now();
      setAhora(ya);
      // Pasado el tiempo, el modo se desactiva de verdad (también en las demás pestañas)
      if (caduca !== null && ya >= caduca) guardarPreferencia(claveDesde, "");
    }, 1000);
    return () => clearInterval(t);
  }, [caduca, claveDesde]);

  const desactivar = useCallback(() => guardarPreferencia(claveDesde, ""), [claveDesde]);
  const alternar = useCallback(() => {
    if (activo) guardarPreferencia(claveDesde, "");
    else {
      setAhora(Date.now());
      guardarPreferencia(claveDesde, String(Date.now()));
    }
  }, [activo, claveDesde]);

  return { activo, restante: activo && caduca !== null ? (caduca - ahora) / 1000 : null, alternar, desactivar };
}
