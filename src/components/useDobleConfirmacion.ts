"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Doble verificación para acciones que borran o cambian muchos datos, sin escribir ninguna palabra: el primer clic «arma» el botón (que
 * cambia de texto y de color) y el segundo, dentro de unos segundos, confirma. Si no se pulsa otra vez, el botón se desarma solo.
 */
export function useDobleConfirmacion(alConfirmar: () => void, ms = 7000) {
  const [armado, setArmado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accion = useRef(alConfirmar);
  useEffect(() => {
    accion.current = alConfirmar;
  });
  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const desarmar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    setArmado(false);
  }, []);

  const pulsar = useCallback(() => {
    if (armado) {
      desarmar();
      accion.current();
      return;
    }
    setArmado(true);
    temporizador.current = setTimeout(() => setArmado(false), ms);
  }, [armado, desarmar, ms]);

  return { armado, pulsar, desarmar };
}

/** Texto del botón mientras espera la segunda confirmación. */
export const TEXTO_SEGUNDO_CLIC = "⚠️ ¿Seguro? Pulsa otra vez para confirmar";
