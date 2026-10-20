import { randomUUID } from "node:crypto";

/**
 * Cola de tareas en segundo plano: lo que tarda (purgar documentos, compactar la base, limpiar…) se pone en cola, se ejecuta de una en una
 * en el servidor y va dejando su progreso, para poder seguir usando la aplicación mientras tanto y ver cómo avanza desde cualquier
 * pantalla. La cola vive en la memoria del servidor: si se reinicia, las tareas que quedaban se pierden (todas son repetibles).
 */

export type EstadoTarea = "en_cola" | "en_marcha" | "terminada" | "error" | "cancelada";

export interface TareaDto {
  id: string;
  /** Qué clase de tarea es (para agruparlas: «purga», «compactar»…). */
  tipo: string;
  titulo: string;
  estado: EstadoTarea;
  hecho: number;
  /** 0 = no se sabe el total (barra sin porcentaje). */
  total: number;
  /** Lo que está haciendo ahora, en una frase. */
  texto: string;
  /** Resultado al terminar (lo que habría devuelto la llamada normal). */
  resultado?: unknown;
  error?: string;
  creadaEn: string;
  iniciadaEn?: string;
  terminadaEn?: string;
  idUsuario: number;
  cancelable: boolean;
}

/** Lo que recibe cada tarea para contar su avance y saber si la han cancelado. */
export interface ContextoTarea {
  avance: (hecho: number, total: number, texto?: string) => void;
  cancelada: () => boolean;
}

/** Se lanza (o se espera) cuando una tarea nota que la han cancelado: termina como «cancelada», no como error. */
export class TareaCancelada extends Error {
  constructor(mensaje = "Tarea cancelada") {
    super(mensaje);
  }
}

interface Entrada {
  dto: TareaDto;
  fn: (ctx: ContextoTarea) => Promise<unknown>;
  cancelar: boolean;
}

interface Estado {
  tareas: Map<string, Entrada>;
  ejecutando: boolean;
}

const G = globalThis as unknown as { __tareasEnSegundoPlano?: Estado };
const estado = (): Estado => (G.__tareasEnSegundoPlano ??= { tareas: new Map(), ejecutando: false });

const MAX_TERMINADAS = 30;

function limpiarAntiguas(): void {
  const e = estado();
  const terminadas = [...e.tareas.values()].filter((t) => t.dto.estado === "terminada" || t.dto.estado === "error" || t.dto.estado === "cancelada");
  for (const t of terminadas.slice(0, Math.max(0, terminadas.length - MAX_TERMINADAS))) e.tareas.delete(t.dto.id);
}

async function procesar(): Promise<void> {
  const e = estado();
  if (e.ejecutando) return;
  e.ejecutando = true;
  try {
    for (;;) {
      const siguiente = [...e.tareas.values()].find((t) => t.dto.estado === "en_cola");
      if (!siguiente) break;
      const { dto } = siguiente;
      if (siguiente.cancelar) {
        dto.estado = "cancelada";
        dto.texto = "Cancelada antes de empezar";
        dto.terminadaEn = new Date().toISOString();
        continue;
      }
      dto.estado = "en_marcha";
      dto.iniciadaEn = new Date().toISOString();
      dto.texto = "Empezando…";
      try {
        dto.resultado = await siguiente.fn({
          avance: (hecho, total, texto) => {
            dto.hecho = hecho;
            dto.total = total;
            if (texto !== undefined) dto.texto = texto;
          },
          cancelada: () => siguiente.cancelar,
        });
        dto.estado = siguiente.cancelar ? "cancelada" : "terminada";
        dto.texto = siguiente.cancelar ? "Cancelada: se ha parado donde estaba" : "Terminada";
        if (dto.total > 0 && dto.estado === "terminada") dto.hecho = dto.total;
      } catch (err) {
        if (err instanceof TareaCancelada) {
          dto.estado = "cancelada";
          dto.texto = err.message;
        } else {
          dto.estado = "error";
          dto.error = err instanceof Error ? err.message : "Error desconocido";
          dto.texto = "Ha fallado";
          console.error(`Tarea «${dto.titulo}» fallida: ${dto.error}`);
        }
      }
      dto.terminadaEn = new Date().toISOString();
      limpiarAntiguas();
    }
  } finally {
    e.ejecutando = false;
  }
}

/** Pone una tarea en cola (se ejecuta cuando acaben las anteriores) y devuelve su ficha. */
export function encolar<T>(opciones: { tipo: string; titulo: string; idUsuario: number; cancelable?: boolean }, fn: (ctx: ContextoTarea) => Promise<T>): TareaDto {
  const dto: TareaDto = { id: randomUUID(), tipo: opciones.tipo, titulo: opciones.titulo, estado: "en_cola", hecho: 0, total: 0, texto: "En cola", creadaEn: new Date().toISOString(), idUsuario: opciones.idUsuario, cancelable: opciones.cancelable ?? true };
  estado().tareas.set(dto.id, { dto, fn, cancelar: false });
  void procesar();
  return { ...dto };
}

/** Las tareas de una persona (el administrador ve todas), las más recientes primero. */
export function listarTareas(idUsuario: number, verTodas: boolean): TareaDto[] {
  return [...estado().tareas.values()]
    .map((t) => ({ ...t.dto }))
    .filter((t) => verTodas || t.idUsuario === idUsuario)
    .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
}

export function obtenerTarea(id: string): TareaDto | null {
  const t = estado().tareas.get(id);
  return t ? { ...t.dto } : null;
}

/** Pide parar una tarea: la que está en marcha lo hace en cuanto termina su paso actual; la que espera, no llega a empezar. */
export function cancelarTarea(id: string): TareaDto | null {
  const t = estado().tareas.get(id);
  if (!t) return null;
  if (t.dto.estado === "en_cola" || t.dto.estado === "en_marcha") {
    if (t.dto.cancelable) {
      t.cancelar = true;
      if (t.dto.estado === "en_cola") {
        t.dto.estado = "cancelada";
        t.dto.texto = "Cancelada antes de empezar";
        t.dto.terminadaEn = new Date().toISOString();
      } else t.dto.texto = "Cancelando… (termina el paso actual)";
    }
  }
  return { ...t.dto };
}

/** Quita de la lista una tarea ya terminada. */
export function descartarTarea(id: string): void {
  const t = estado().tareas.get(id);
  if (t && (t.dto.estado === "terminada" || t.dto.estado === "error" || t.dto.estado === "cancelada")) estado().tareas.delete(id);
}

/** Para las pruebas: vacía la cola. */
export function reiniciarTareas(): void {
  G.__tareasEnSegundoPlano = { tareas: new Map(), ejecutando: false };
}
