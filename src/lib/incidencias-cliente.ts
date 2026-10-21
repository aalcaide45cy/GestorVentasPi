import { limpiarSensible, recortar } from "@/lib/incidencias";

/**
 * Vigilante del navegador: recuerda los últimos pasos (pantallas visitadas, botones pulsados, peticiones y errores de consola) y avisa al servidor de
 * lo que falla (errores sin tratar, peticiones con error 5xx o sin respuesta, avisos de error mostrados en pantalla, pantallas rotas). Así cada
 * incidencia llega con «lo que se estaba haciendo» y no hace falta explicarlo. Nunca se envían valores de formularios ni cuerpos de peticiones.
 */

export interface EventoNavegador {
  origen: "navegador" | "peticion" | "aviso";
  nivel: "error" | "aviso";
  titulo: string;
  detalle?: string | null;
  ruta?: string | null;
  veces?: number;
  contexto?: Record<string, unknown> | null;
}

export interface OpcionesColector {
  /** Envía un lote de sucesos al servidor. */
  enviar: (eventos: EventoNavegador[]) => void;
  /** Datos técnicos que acompañan a cada suceso (pantalla, navegador, tamaño de ventana…). */
  contextoBase: () => Record<string, unknown>;
  ahora?: () => number;
  /** Cuánto se espera para juntar sucesos antes de enviarlos. */
  esperaMs?: number;
  /** Máximo de sucesos distintos que se envían en total en esta sesión de la página. */
  maxPorSesion?: number;
}

const MAX_PASOS = 30;

/** Todo lo que sucede mientras se usa la página, sin tocar el navegador: se prueba aparte y `instalarVigilante` lo conecta. */
export function crearColector(op: OpcionesColector) {
  const ahora = op.ahora ?? Date.now;
  const pasos: { en: number; texto: string }[] = [];
  const pendientes = new Map<string, EventoNavegador>();
  const enviados = new Map<string, number>();
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let total = 0;

  const paso = (texto: string): void => {
    const t = limpiarSensible(texto).slice(0, 160);
    const ultimo = pasos[pasos.length - 1];
    if (ultimo && ultimo.texto === t) return;
    pasos.push({ en: ahora(), texto: t });
    if (pasos.length > MAX_PASOS) pasos.shift();
  };

  /** Los últimos pasos, del más antiguo al más reciente, con la hora (HH:MM:SS). */
  const ultimosPasos = (n = 14): string[] =>
    pasos.slice(-n).map((p) => `${new Date(p.en).toLocaleTimeString("es-ES", { hour12: false })} ${p.texto}`);

  const volcar = (): void => {
    temporizador = null;
    if (pendientes.size === 0) return;
    const lote = [...pendientes.values()];
    pendientes.clear();
    op.enviar(lote);
  };

  /** Anota un fallo. Los iguales dentro de la misma sesión se juntan (con su número de veces) y se envían por lotes. */
  const fallo = (e: EventoNavegador): void => {
    const clave = `${e.origen}|${e.titulo}|${e.ruta ?? ""}`;
    const ya = pendientes.get(clave);
    if (ya) {
      ya.veces = (ya.veces ?? 1) + 1;
      return;
    }
    // Un fallo que ya se envió se vuelve a avisar como mucho una vez por minuto (para que la cuenta de veces no se pierda ni se sature)
    const ultimo = enviados.get(clave);
    if (ultimo !== undefined && ahora() - ultimo < 60_000) return;
    if (total >= (op.maxPorSesion ?? 60)) return;
    total++;
    enviados.set(clave, ahora());
    pendientes.set(clave, { ...e, titulo: recortar(e.titulo, 400), veces: 1, contexto: { ...op.contextoBase(), ...(e.contexto ?? {}), pasos: ultimosPasos() } });
    if (!temporizador) temporizador = setTimeout(volcar, op.esperaMs ?? 2500);
  };

  return { paso, fallo, ultimosPasos, volcar, pendientes: () => pendientes.size };
}

export type Colector = ReturnType<typeof crearColector>;

/** Texto corto de lo que se pulsó (etiqueta del botón, enlace o casilla), sin leer nunca lo que haya escrito la persona. */
export function textoDeElemento(el: Element | null): string | null {
  const c = el?.closest("button, a, [role=button], [role=tab], summary, label, select, input[type=checkbox], input[type=radio]");
  if (!c) return null;
  const tag = c.tagName.toLowerCase();
  // Se prefiere el texto visible del botón (corto); si no tiene, su etiqueta de accesibilidad o su ayuda
  const visible = tag === "select" || tag === "input" ? "" : (c.textContent ?? "").replace(/\s+/g, " ").trim();
  const nombre = (visible && visible.length <= 60 ? visible : (c.getAttribute("aria-label") ?? c.getAttribute("title") ?? visible)).replace(/\s+/g, " ").trim();
  if (!nombre && tag === "select") return "cambia un desplegable";
  if (!nombre && tag === "input") return `marca una casilla`;
  if (!nombre) return null;
  return `${tag === "a" ? "abre" : "pulsa"} «${nombre.slice(0, 50)}»`;
}

/** Líneas de la consola o errores del navegador que no merecen aviso (ruido de extensiones o del propio navegador). */
export function esRuidoDelNavegador(mensaje: string): boolean {
  return /ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:|safari-extension:|Non-Error promise rejection captured|AbortError|The operation was aborted|Load failed$|NetworkError when attempting to fetch resource.*favicon/i.test(mensaje);
}

let activo: Colector | null = null;
export const vigilanteActivo = (): Colector | null => activo;

/** Un aviso de error que se le enseña a la persona en pantalla (los «toasts» rojos) también es una incidencia: es lo que ella vio fallar. */
export function avisoDeErrorMostrado(texto: string): void {
  activo?.fallo({ origen: "aviso", nivel: "aviso", titulo: texto.slice(0, 300), ruta: typeof location !== "undefined" ? location.pathname : null });
}

/** Un paso a mano (por ejemplo, un cambio de pantalla). */
export function pasoDelVigilante(texto: string): void {
  activo?.paso(texto);
}

export const contextoDelNavegador = (version: string | null): Record<string, unknown> => ({
  pantalla: typeof location !== "undefined" ? location.pathname : null,
  navegador: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 160) : null,
  ventana: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : null,
  enLinea: typeof navigator !== "undefined" ? navigator.onLine : null,
  version,
});

/**
 * Conecta el vigilante a la página (una sola vez): errores sin tratar, promesas rechazadas, clics, peticiones `fetch` y `console.error`.
 * Devuelve la función que lo desconecta (para pruebas y recarga en caliente).
 */
export function instalarVigilante(version: string | null): () => void {
  if (activo || typeof window === "undefined") return () => undefined;
  const fetchOriginal = window.fetch.bind(window);
  const colector = crearColector({
    contextoBase: () => contextoDelNavegador(version),
    // Se envía con el fetch original (sin vigilar) para que un fallo al avisar no provoque otro aviso
    enviar: (eventos) => {
      void fetchOriginal("/api/incidencias", { method: "POST", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version, eventos }) }).catch(() => undefined);
    },
  });
  activo = colector;
  colector.paso(`Abre ${location.pathname}`);

  const alError = (ev: ErrorEvent) => {
    const m = ev.message || String(ev.error ?? "Error desconocido");
    if (esRuidoDelNavegador(m)) return;
    colector.fallo({ origen: "navegador", nivel: "error", titulo: m, detalle: ev.error instanceof Error ? ev.error.stack : `${ev.filename ?? ""}:${ev.lineno ?? ""}:${ev.colno ?? ""}`, ruta: location.pathname });
  };
  const alRechazo = (ev: PromiseRejectionEvent) => {
    const r = ev.reason;
    const m = r instanceof Error ? r.message : typeof r === "string" ? r : "Promesa rechazada sin tratar";
    if (esRuidoDelNavegador(m)) return;
    colector.fallo({ origen: "navegador", nivel: "error", titulo: `Promesa rechazada: ${m}`, detalle: r instanceof Error ? r.stack : null, ruta: location.pathname });
  };
  const alClic = (ev: MouseEvent) => {
    const t = textoDeElemento(ev.target instanceof Element ? ev.target : null);
    if (t) colector.paso(t);
  };
  window.addEventListener("error", alError);
  window.addEventListener("unhandledrejection", alRechazo);
  document.addEventListener("click", alClic, true);

  window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const ruta = url.replace(location.origin, "").split("?")[0];
    const metodo = (init?.method ?? (typeof entrada === "object" && "method" in entrada ? entrada.method : "GET")).toUpperCase();
    const propia = ruta.startsWith("/api/") && !ruta.startsWith("/api/incidencias");
    const inicio = performance.now();
    try {
      const r = await fetchOriginal(entrada, init);
      if (propia) {
        // Las lecturas que salen bien (la mayoría, sondeos de fondo) no cuentan como paso: solo lo que cambia datos o falla
        if (metodo !== "GET" || r.status >= 400) colector.paso(`${metodo} ${ruta} → ${r.status}`);
        if (r.status >= 500) colector.fallo({ origen: "peticion", nivel: "error", titulo: `${metodo} ${ruta} respondió ${r.status}`, ruta: `${metodo} ${ruta}`, contexto: { ms: Math.round(performance.now() - inicio) } });
      }
      return r;
    } catch (e) {
      // Cancelar a propósito (AbortError) o cerrar la página no son fallos
      const cancelado = e instanceof DOMException && e.name === "AbortError";
      if (propia && !cancelado) {
        colector.paso(`${metodo} ${ruta} → sin respuesta`);
        colector.fallo({ origen: "peticion", nivel: "aviso", titulo: `${metodo} ${ruta} no obtuvo respuesta (sin conexión con el servidor)`, ruta: `${metodo} ${ruta}`, contexto: { ms: Math.round(performance.now() - inicio) } });
      }
      throw e;
    }
  };

  const consolaOriginal = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    consolaOriginal(...args);
    try {
      const texto = args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" ").slice(0, 300);
      if (texto && !esRuidoDelNavegador(texto)) colector.paso(`consola: ${texto}`);
    } catch {
      /* anotar nunca debe romper la consola */
    }
  };

  return () => {
    window.removeEventListener("error", alError);
    window.removeEventListener("unhandledrejection", alRechazo);
    document.removeEventListener("click", alClic, true);
    window.fetch = fetchOriginal;
    console.error = consolaOriginal;
    activo = null;
  };
}
