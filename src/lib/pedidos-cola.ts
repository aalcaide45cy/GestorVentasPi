import type { TipoVentaDto } from "@/lib/dto";
import type { ResultadoPedido } from "@/lib/servicios/documentos";

/**
 * Cola de pedidos leídos que aún no se han aplicado. Vive en el navegador (se conserva al cerrar la ventana de un pedido, al
 * recargar la página y al leer varios pedidos de golpe); los ficheros ya están guardados en el servidor como adjuntos pendientes.
 */

export interface EleccionRapida {
  idModelo: number | null;
  nombreModelo: string;
  tipo: TipoVentaDto;
  estadoNombre?: string;
}

export interface ItemCola {
  id: string;
  nombre: string;
  leidoEn: string;
  pedido: ResultadoPedido;
  /** Modelo y forma de pago elegidos al soltarlo sobre un botón de acceso rápido. */
  eleccion: EleccionRapida | null;
  /** Expediente al que se soltó (para completarlo) o null si se creará uno nuevo. */
  idExpediente: number | null;
  /** Lectura del servidor de la que viene (para anotar en el registro qué se hizo con el pedido). */
  idLectura?: number;
}

export interface EstadoCola {
  items: ItemCola[];
  /** Pedido cuya ventana está abierta. */
  abierto: string | null;
}

const CLAVE = "gv_cola_pedidos";
/** Pedidos que caben a la vez en la cola. */
export const MAXIMO_COLA = 300;
const MAXIMO = MAXIMO_COLA;
const VACIO: EstadoCola = { items: [], abierto: null };

let estado: EstadoCola = VACIO;
let cargado = false;
const oyentes = new Set<() => void>();

function cargar(): void {
  if (cargado || typeof window === "undefined") return;
  cargado = true;
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (crudo) {
      const items = JSON.parse(crudo) as ItemCola[];
      if (Array.isArray(items)) estado = { items: items.filter((i) => i && i.id && i.pedido?.datos), abierto: null };
    }
  } catch {
    /* sin almacenamiento: la cola solo vive mientras la página esté abierta */
  }
}

function emitir(nuevo: EstadoCola): void {
  estado = nuevo;
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(nuevo.items));
  } catch {
    /* sin almacenamiento */
  }
  oyentes.forEach((o) => o());
}

export function suscribirCola(cb: () => void): () => void {
  oyentes.add(cb);
  const alCambiarOtraPestana = (e: StorageEvent) => {
    if (e.key !== CLAVE) return;
    try {
      estado = { items: e.newValue ? (JSON.parse(e.newValue) as ItemCola[]) : [], abierto: estado.abierto };
      cb();
    } catch {
      /* ignorar */
    }
  };
  window.addEventListener("storage", alCambiarOtraPestana);
  return () => {
    oyentes.delete(cb);
    window.removeEventListener("storage", alCambiarOtraPestana);
  };
}

export function leerCola(): EstadoCola {
  cargar();
  return estado;
}

export const colaVacia = (): EstadoCola => VACIO;

let contador = 0;
export function anadirACola(nuevos: Omit<ItemCola, "id" | "leidoEn">[]): ItemCola[] {
  cargar();
  const items = nuevos.map((n) => ({ ...n, id: `p${Date.now().toString(36)}${(contador++).toString(36)}`, leidoEn: new Date().toISOString() }));
  emitir({ ...estado, items: [...estado.items, ...items].slice(-MAXIMO) });
  return items;
}

export function quitarDeCola(id: string): void {
  cargar();
  emitir({ items: estado.items.filter((i) => i.id !== id), abierto: estado.abierto === id ? null : estado.abierto });
}

export function vaciarCola(): void {
  cargar();
  emitir({ items: [], abierto: null });
}

export function abrirDeCola(id: string | null): void {
  cargar();
  estado = { ...estado, abierto: id };
  oyentes.forEach((o) => o());
}

/** Huecos libres en la cola (para no perder pedidos ya leídos al soltar más de golpe). */
export function huecosEnCola(): number {
  cargar();
  return Math.max(0, MAXIMO_COLA - estado.items.length);
}

/** Progreso de la lectura en curso (visible en la cola aunque se esté trabajando con otro pedido). */
export interface ProgresoLectura {
  hechos: number;
  total: number;
}
let lectura: ProgresoLectura | null = null;
const oyentesLectura = new Set<() => void>();

export function fijarLectura(p: ProgresoLectura | null): void {
  lectura = p;
  oyentesLectura.forEach((o) => o());
}
export function suscribirLectura(cb: () => void): () => void {
  oyentesLectura.add(cb);
  return () => oyentesLectura.delete(cb);
}
export const leerLectura = (): ProgresoLectura | null => lectura;

/** Cancelación de la lectura en curso: corta la petición que está leyendo y no empieza las siguientes. */
let canceladaLectura = false;
let controladorLectura: AbortController | null = null;
export const lecturaCancelada = (): boolean => canceladaLectura;
export function iniciarLectura(): void {
  canceladaLectura = false;
}
export function nuevoControladorLectura(): AbortController {
  controladorLectura = new AbortController();
  return controladorLectura;
}
export function cancelarLectura(): void {
  canceladaLectura = true;
  controladorLectura?.abort();
}
