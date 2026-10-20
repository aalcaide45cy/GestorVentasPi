import type { TareaDto } from "@/lib/servicios/tareas";

/**
 * Seguimiento, desde el navegador, de las tareas en segundo plano del servidor (purgas, compactar, limpiezas…): un almacén común que
 * consultan el indicador de la barra superior y las pantallas que lanzan tareas. Mientras haya alguna en marcha se consulta cada
 * segundo y medio; si no, no se consulta nada.
 */

let tareas: TareaDto[] = [];
const oyentes = new Set<() => void>();
const alTerminar = new Set<(t: TareaDto) => void>();
let temporizador: ReturnType<typeof setInterval> | null = null;
const vistasTerminadas = new Set<string>();

export const leerTareas = (): TareaDto[] => tareas;
export function suscribirTareas(cb: () => void): () => void {
  oyentes.add(cb);
  return () => oyentes.delete(cb);
}
/** Avisa cuando una tarea acaba (terminada, con error o cancelada); devuelve cómo dejar de avisar. */
export function alTerminarTarea(cb: (t: TareaDto) => void): () => void {
  alTerminar.add(cb);
  return () => alTerminar.delete(cb);
}
const emitir = () => oyentes.forEach((o) => o());
const activa = (t: TareaDto) => t.estado === "en_cola" || t.estado === "en_marcha";

function aplicar(nuevas: TareaDto[]): void {
  for (const t of nuevas) {
    const antes = tareas.find((x) => x.id === t.id);
    if (!activa(t) && !vistasTerminadas.has(t.id) && (antes ? activa(antes) : false)) {
      vistasTerminadas.add(t.id);
      alTerminar.forEach((cb) => cb(t));
    }
  }
  tareas = nuevas;
  emitir();
}

/** Consulta las tareas al servidor y, si hay alguna en marcha, sigue consultando hasta que acaben. */
export async function refrescarTareas(): Promise<void> {
  try {
    const r = await fetch("/api/tareas", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) return;
    const j = (await r.json()) as { data?: TareaDto[] };
    aplicar(j.data ?? []);
  } catch {
    /* un fallo puntual de red: se vuelve a intentar */
  }
  const hayActivas = tareas.some(activa);
  if (hayActivas && !temporizador) temporizador = setInterval(() => void refrescarTareas(), 1500);
  if (!hayActivas && temporizador) {
    clearInterval(temporizador);
    temporizador = null;
  }
}

/** Cancela una tarea en cola o en marcha. */
export async function cancelarTareaServidor(id: string): Promise<void> {
  await fetch("/api/tareas", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "cancelar", id }) });
  await refrescarTareas();
}

/** Quita de la lista una tarea terminada. */
export async function descartarTareaServidor(id: string): Promise<void> {
  await fetch("/api/tareas", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "descartar", id }) });
  tareas = tareas.filter((t) => t.id !== id);
  emitir();
}

/** Espera a que acabe una tarea y devuelve su resultado; si falla o se cancela, lanza un error con el motivo. `alAvance` recibe su ficha en cada paso. */
export function esperarTarea<T>(id: string, alAvance?: (t: TareaDto) => void): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    let vistaAlguna = false;
    const mirar = () => {
      const t = tareas.find((x) => x.id === id);
      if (!t) {
        if (vistaAlguna) {
          dejar();
          rechazar(new Error("La tarea ya no está en la lista (el servidor se habrá reiniciado)."));
        }
        return;
      }
      vistaAlguna = true;
      alAvance?.(t);
      if (t.estado === "terminada") {
        dejar();
        resolver(t.resultado as T);
      } else if (t.estado === "error") {
        dejar();
        rechazar(new Error(t.error ?? "La tarea ha fallado."));
      } else if (t.estado === "cancelada") {
        dejar();
        rechazar(new Error(t.texto || "La tarea se ha cancelado."));
      }
    };
    const dejar = suscribirTareas(mirar);
    void refrescarTareas().then(() => {
      // Si tras la primera consulta no aparece, el servidor no la conoce
      if (!tareas.some((x) => x.id === id)) {
        dejar();
        rechazar(new Error("El servidor no conoce esta tarea."));
      }
    });
  });
}

/**
 * Pone una operación larga del servidor en la cola de segundo plano (`?asincrono=1`) y vuelve enseguida con su ficha: no espera a que acabe. El
 * indicador de la barra superior enseña el avance y, al terminar, avisa con el resultado (aunque la persona haya cambiado de pantalla).
 */
export async function lanzarTarea(url: string, cuerpo: unknown): Promise<TareaDto> {
  const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}asincrono=1`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const json = (await r.json().catch(() => ({}))) as { tarea?: string; message?: string };
  if (!r.ok || !json.tarea) throw new Error(json.message ?? `Error ${r.status}`);
  await refrescarTareas();
  const t = tareas.find((x) => x.id === json.tarea);
  if (!t) throw new Error("La tarea no ha quedado en la cola.");
  return t;
}

/**
 * Lanza una operación larga del servidor como tarea en segundo plano (`?asincrono=1`) y espera su resultado. Mientras tanto la
 * aplicación se puede seguir usando y el indicador de la barra superior enseña el avance; el resultado es el mismo que devolvería la
 * llamada normal (`data` si lo hay).
 */
export async function llamarComoTarea<T>(url: string, cuerpo: unknown, alAvance?: (t: TareaDto) => void): Promise<T> {
  const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}asincrono=1`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const json = (await r.json().catch(() => ({}))) as { tarea?: string; message?: string };
  if (!r.ok || !json.tarea) throw new Error(json.message ?? `Error ${r.status}`);
  return esperarTarea<T>(json.tarea, alAvance);
}
