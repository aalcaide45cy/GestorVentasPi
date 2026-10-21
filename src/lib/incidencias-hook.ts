import type { EventoIncidencia } from "@/lib/incidencias";

/**
 * Punto de enganche sin dependencias: quien detecta un fallo (la API, el medidor de rendimiento…) llama a `emitirIncidencia` y, si el servidor
 * ya instaló el receptor (al arrancar), el suceso se guarda. Así los módulos que usa la base de datos pueden avisar sin importarla (sin ciclos).
 */
const G = globalThis as unknown as { __receptorIncidencias?: (e: EventoIncidencia) => void };

export function instalarReceptorIncidencias(f: (e: EventoIncidencia) => void): void {
  G.__receptorIncidencias = f;
}

export function emitirIncidencia(e: EventoIncidencia): void {
  try {
    G.__receptorIncidencias?.(e);
  } catch {
    /* avisar de un fallo nunca debe causar otro */
  }
}
