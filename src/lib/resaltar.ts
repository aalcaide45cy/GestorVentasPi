"use client";

/**
 * Señalar un campo que falta o hay que revisar: hace scroll hasta él, lo enfoca y le pone un marco con un resplandor animado
 * (clase `campo-falta`) hasta que se toca o pasan unos segundos. Los campos se marcan en el HTML con `data-campo="clave"`
 * (en el propio control o en el contenedor que lo envuelve).
 */
const SEGUNDOS_MAXIMOS = 12;

export function señalarCampo(clave: string): boolean {
  if (typeof document === "undefined") return false;
  const marcado = document.querySelector<HTMLElement>(`[data-campo="${clave}"]`);
  if (!marcado) return false;
  const control = marcado.matches("input, select, textarea, button") ? marcado : (marcado.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea") ?? marcado);
  control.scrollIntoView({ behavior: "smooth", block: "center" });
  control.classList.add("campo-falta");
  // Se espera a que acabe el scroll suave para enfocar sin que la página salte
  window.setTimeout(() => control.focus({ preventScroll: true }), 450);
  const quitar = () => {
    control.classList.remove("campo-falta");
    control.removeEventListener("input", quitar);
    control.removeEventListener("change", quitar);
    window.clearTimeout(temporizador);
  };
  const temporizador = window.setTimeout(quitar, SEGUNDOS_MAXIMOS * 1000);
  control.addEventListener("input", quitar);
  control.addEventListener("change", quitar);
  return true;
}

/** Señala el primero de los campos de la lista que exista en la pantalla; devuelve cuál. */
export function señalarPrimero(claves: string[]): string | null {
  for (const c of claves) if (señalarCampo(c)) return c;
  return null;
}
