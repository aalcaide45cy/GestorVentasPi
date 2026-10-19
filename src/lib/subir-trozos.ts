/**
 * Subida de un fichero grande por trozos (para copias .dump de uno o varios gigas): cada trozo es una petición corta, así que no
 * depende de que una conexión dure minutos (los túneles y los navegadores las cortan: «Load failed» / «Failed to fetch»), y si un
 * trozo falla se repite, retomando donde el servidor se quedó.
 */

export const TAMANO_TROZO = 32 * 1024 * 1024;
const REINTENTOS = 8;

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function identificador(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface OpcionesSubida {
  url: string;
  alProgreso?: (hechos: number, total: number) => void;
  /** Ajusta el tamaño del trozo (para pruebas). */
  tamanoTrozo?: number;
}

/** Sube el fichero; devuelve el cuerpo JSON de la última respuesta (el servidor lo registra al recibir el último trozo). */
export async function subirPorTrozos(f: File, opciones: OpcionesSubida): Promise<Record<string, unknown>> {
  const id = identificador();
  const trozo = opciones.tamanoTrozo ?? TAMANO_TROZO;
  let desde = 0;
  for (;;) {
    const hasta = Math.min(f.size, desde + trozo);
    const fin = hasta >= f.size;
    const q = new URLSearchParams({ id, desde: String(desde) });
    if (fin) {
      q.set("fin", "1");
      q.set("total", String(f.size));
      q.set("nombre", encodeURIComponent(f.name));
    }
    let respuesta: Response | null = null;
    let ultimoError = "Sin conexión con el servidor";
    for (let intento = 0; intento <= REINTENTOS; intento++) {
      if (intento > 0) await dormir(Math.min(30_000, 1000 * 2 ** (intento - 1)));
      try {
        const r = await fetch(`${opciones.url}?${q.toString()}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: f.slice(desde, hasta), credentials: "same-origin" });
        if (r.status === 409) {
          // El servidor lleva otra cantidad (un trozo se cortó a medias): se sigue desde ahí
          const j = (await r.json().catch(() => ({}))) as { recibidos?: number };
          if (typeof j.recibidos === "number" && j.recibidos !== desde && j.recibidos <= f.size) {
            desde = j.recibidos;
            respuesta = r;
            break;
          }
        }
        if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 409 && r.status !== 429)) {
          respuesta = r;
          break;
        }
        ultimoError = `El servidor respondió ${r.status}`;
      } catch (e) {
        ultimoError = e instanceof Error ? e.message : ultimoError;
      }
    }
    if (!respuesta) throw new Error(`No se pudo subir el fichero (${ultimoError}). Vuelve a intentarlo.`);
    // Reanudación tras un 409: se repite desde la posición que dijo el servidor
    if (respuesta.status === 409) {
      opciones.alProgreso?.(desde, f.size);
      continue;
    }
    const json = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
    if (!respuesta.ok) throw new Error(typeof json.message === "string" ? json.message : "No se pudo subir el fichero");
    if (fin) {
      opciones.alProgreso?.(f.size, f.size);
      return json;
    }
    desde = hasta;
    opciones.alProgreso?.(desde, f.size);
  }
}
