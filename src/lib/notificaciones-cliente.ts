/**
 * Registro de notificaciones de la interfaz: cada aviso que se enseña (éxito, error o aviso) queda anotado para poder repasarlo otro día.
 * Se guarda en este navegador (localStorage), con un máximo de entradas y de días, y se comparte entre pestañas. No lleva datos del
 * servidor: es lo mismo que la persona vio en pantalla.
 */

export type TipoNotificacion = "exito" | "error" | "aviso";

export interface NotificacionRegistrada {
  id: string;
  /** Instante en formato ISO. */
  fecha: string;
  tipo: TipoNotificacion;
  titulo: string | null;
  texto: string;
  detalles: string[];
  leida: boolean;
}

const CLAVE = "gv-notificaciones";
export const MAX_NOTIFICACIONES = 300;
export const MAX_DIAS = 60;

/** Almacén mínimo (el de localStorage o uno de pruebas). */
export interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

let almacen: Almacen | null | undefined;
let cache: NotificacionRegistrada[] | null = null;
const oyentes = new Set<() => void>();
const SIN_REGISTRO: NotificacionRegistrada[] = [];

function almacenActual(): Almacen | null {
  if (almacen !== undefined) return almacen;
  try {
    almacen = typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    almacen = null;
  }
  return almacen;
}

/** Solo para pruebas: cambia el almacén y vacía la memoria. */
export function usarAlmacen(a: Almacen | null): void {
  almacen = a;
  cache = null;
}

/** Descarta lo corrupto, lo demasiado viejo y lo que sobra del máximo (se queda con lo más reciente). */
export function depurar(lista: unknown, ahora = Date.now()): NotificacionRegistrada[] {
  if (!Array.isArray(lista)) return [];
  const limite = ahora - MAX_DIAS * 86_400_000;
  const validas = lista.filter((n): n is NotificacionRegistrada => {
    if (!n || typeof n !== "object") return false;
    const o = n as Record<string, unknown>;
    return typeof o.id === "string" && typeof o.fecha === "string" && typeof o.texto === "string" && (o.tipo === "exito" || o.tipo === "error" || o.tipo === "aviso") && Array.isArray(o.detalles) && Date.parse(o.fecha) >= limite;
  });
  return validas.slice(-MAX_NOTIFICACIONES);
}

function cargar(): NotificacionRegistrada[] {
  if (cache) return cache;
  let lista: NotificacionRegistrada[] = [];
  try {
    const crudo = almacenActual()?.getItem(CLAVE);
    if (crudo) lista = depurar(JSON.parse(crudo));
  } catch {
    lista = [];
  }
  cache = lista;
  return cache;
}

function guardar(lista: NotificacionRegistrada[]): void {
  cache = lista;
  try {
    almacenActual()?.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    // Sin almacenamiento (ventana privada o lleno): el registro vive solo mientras la página está abierta
  }
  oyentes.forEach((o) => o());
}

/** Anota una notificación y devuelve la entrada creada. */
export function registrarNotificacion(n: { tipo: TipoNotificacion; titulo?: string | null; texto: string; detalles?: string[] }, ahora = new Date()): NotificacionRegistrada {
  const entrada: NotificacionRegistrada = {
    id: `${ahora.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    fecha: ahora.toISOString(),
    tipo: n.tipo,
    titulo: n.titulo ?? null,
    texto: n.texto,
    detalles: n.detalles ?? [],
    leida: false,
  };
  guardar(depurar([...cargar(), entrada], ahora.getTime()));
  return entrada;
}

/** Registro completo, de la más antigua a la más reciente (referencia estable mientras no cambie). */
export function leerRegistro(): NotificacionRegistrada[] {
  return typeof window === "undefined" && !almacen ? SIN_REGISTRO : cargar();
}

export const registroServidor = (): NotificacionRegistrada[] => SIN_REGISTRO;

export function contarNoLeidas(lista: NotificacionRegistrada[]): number {
  return lista.reduce((n, x) => n + (x.leida ? 0 : 1), 0);
}

export function marcarTodasLeidas(): void {
  const lista = cargar();
  if (!lista.some((n) => !n.leida)) return;
  guardar(lista.map((n) => (n.leida ? n : { ...n, leida: true })));
}

export function quitarNotificacion(id: string): void {
  guardar(cargar().filter((n) => n.id !== id));
}

export function vaciarRegistro(): void {
  guardar([]);
}

export function suscribirRegistro(avisar: () => void): () => void {
  oyentes.add(avisar);
  // Otra pestaña ha cambiado el registro: se vuelve a leer
  const alAlmacenar = (e: StorageEvent) => {
    if (e.key !== CLAVE) return;
    cache = null;
    avisar();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", alAlmacenar);
  return () => {
    oyentes.delete(avisar);
    if (typeof window !== "undefined") window.removeEventListener("storage", alAlmacenar);
  };
}
