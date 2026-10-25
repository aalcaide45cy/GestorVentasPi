// Aviso de memoria de intercambio (swap), sin dependencias del servidor para poder usarlo también en el navegador.

/** Umbral de swap (MB) a partir del cual se mira si es un problema. */
const SWAP_MB_AVISO = 300;
/** En macOS, memoria disponible (%) por debajo de la cual el swap sí preocupa. */
const MAC_MEM_LIBRE_PCT_AVISO = 15;

/**
 * ¿Usar swap es un problema real? En Linux (la Raspberry) sí, a partir de 300 MB. En macOS no por sí solo: el sistema deja el swap usado después de un
 * pico y no lo libera aunque sobre la memoria, así que solo se avisa si, además, la memoria disponible es baja.
 */
export function swapPreocupa(d: { plataforma: string; swapUsadoMb: number; memLibrePct: number }): boolean {
  if (d.swapUsadoMb < SWAP_MB_AVISO) return false;
  return d.plataforma === "darwin" ? d.memLibrePct < MAC_MEM_LIBRE_PCT_AVISO : true;
}

/** Consecuencia del swap según el equipo: en una Raspberry se escribe en la tarjeta SD; en otros equipos, en el disco. */
export function textoConsecuenciaSwap(tipoEquipo: string): string {
  return tipoEquipo === "Raspberry" ? "cuando la memoria se agota el sistema escribe en la tarjeta SD y todo se vuelve lentísimo" : "cuando la memoria se agota el sistema escribe en el disco y todo se vuelve más lento";
}
