import { ajustarLecturas, sugerirMes, type CocheCotejo } from "@/lib/cotejo-pagos";
import type { MatriculaLeida } from "@/lib/servicios/ocr-rejilla";
import { avisarCambioDeDatos } from "@/lib/datos-version";
import { esperarTarea, refrescarTareas } from "@/lib/tareas-cliente";

/**
 * Lectura de las hojas (rejillas) de comisiones escaneadas, fuera de la pantalla: las hojas que se suben se ponen en la cola de segundo plano del
 * servidor (se leen de una en una, por orden) y esta pieza va recogiendo el resultado y guardando los borradores que salen. Como vive en el
 * navegador y no en el componente, sigue su curso aunque se cambie de pestaña o de pantalla, y al volver se ve en qué punto está cada hoja. Los
 * borradores (lo leído pendiente de revisar y guardar) se conservan también al recargar la página; los ficheros, solo mientras la página siga abierta.
 */

export type EstadoHoja = "en_cola" | "leyendo" | "leida" | "error";

export interface HojaEnCola {
  id: string;
  nombre: string;
  /** El fichero se guarda en memoria para poder releerlo (con otro motor, por ejemplo) sin volver a elegirlo. */
  archivo: File;
  estado: EstadoHoja;
  error?: string;
  /** Motor con el que se pidió esta lectura (vacío = el de Configuración). */
  motor?: string;
  /** Cuántas matrículas salieron en total. */
  matriculas?: number;
  /** Vendedor al que se subió la hoja (aunque luego se cambie el que se mira en pantalla). */
  idVendedor?: number;
}

export interface BorradorRejilla {
  clave: string;
  /** Hoja de la que sale (para releerla). Tras recargar la página ya no está en memoria. */
  idHoja: string;
  nombreArchivo: string;
  mes: string;
  filas: { matricula: string; confianza: number; corregidaDe?: string }[];
}

export interface EstadoRejillas {
  hojas: HojaEnCola[];
  borradores: BorradorRejilla[];
}

/** Lo que la pantalla sabe y la lectura necesita para proponer el mes y ajustar las matrículas dudosas. */
export interface ContextoRejillas {
  coches: CocheCotejo[];
  /** Mes que se está mirando: el que se propone si la hoja no deja adivinar el suyo. */
  mes: string;
  /** Vendedor cuyas rejillas se guardan. Sin él (o sin `avisar`) las hojas leídas se quedan como borrador. */
  idVendedor?: number;
  /** Para avisar con una notificación flotante de lo que se guarda solo. */
  avisar?: (texto: string, tipo?: "exito" | "aviso" | "error") => void;
}

const CLAVE_BORRADORES = "gv_borradores_rejillas";
export const SIN_ESTADO: EstadoRejillas = { hojas: [], borradores: [] };

let estado: EstadoRejillas = SIN_ESTADO;
let cargado = false;
let contexto: ContextoRejillas = { coches: [], mes: "" };
/** Meses cuya rejilla se está guardando sola ahora mismo (una segunda hoja del mismo mes se queda de borrador para decidir). */
const guardandoMes = new Set<string>();
const oyentes = new Set<() => void>();
let contador = 0;

function cargar(): void {
  if (cargado || typeof window === "undefined") return;
  cargado = true;
  try {
    const crudo = window.sessionStorage.getItem(CLAVE_BORRADORES);
    if (crudo) {
      const b = JSON.parse(crudo) as BorradorRejilla[];
      if (Array.isArray(b)) estado = { hojas: [], borradores: b.filter((x) => x && typeof x.clave === "string" && Array.isArray(x.filas)) };
    }
  } catch {
    /* sin almacenamiento: los borradores viven solo mientras la página esté abierta */
  }
}

function emitir(nuevo: EstadoRejillas): void {
  estado = nuevo;
  try {
    window.sessionStorage.setItem(CLAVE_BORRADORES, JSON.stringify(nuevo.borradores));
  } catch {
    /* sin almacenamiento */
  }
  oyentes.forEach((o) => o());
}

export function suscribirRejillas(cb: () => void): () => void {
  oyentes.add(cb);
  return () => void oyentes.delete(cb);
}

export function leerRejillas(): EstadoRejillas {
  cargar();
  return estado;
}

/** La pantalla avisa de los coches que conoce y del mes que está viendo (la lectura los usa al terminar). */
export function usarContextoRejillas(c: ContextoRejillas): void {
  contexto = c;
}

const cambiarHoja = (id: string, cambio: Partial<HojaEnCola>) => emitir({ ...estado, hojas: estado.hojas.map((h) => (h.id === id ? { ...h, ...cambio } : h)) });

/** `mes`: el de la fecha que lleva escrita la rejilla abajo a la izquierda (AAAA-MM), si se ha podido leer. */
type PaginaLeida = { matriculas: MatriculaLeida[]; mes?: string | null };

/** Pone la hoja en la cola del servidor y espera su turno: al terminar, deja sus borradores (uno por página). */
async function leerHoja(id: string): Promise<void> {
  const hoja = estado.hojas.find((h) => h.id === id);
  if (!hoja) return;
  try {
    const q = new URLSearchParams({ asincrono: "1", nombre: hoja.nombre });
    if (hoja.motor) q.set("motor", hoja.motor);
    const r = await fetch(`/api/cotejo/leer?${q}`, { method: "POST", headers: { "Content-Type": hoja.archivo.type || "application/pdf" }, body: hoja.archivo, credentials: "same-origin" });
    const json = (await r.json().catch(() => ({}))) as { message?: string; tarea?: string };
    if (!r.ok || !json.tarea) throw new Error(json.message ?? `Error ${r.status}`);
    await refrescarTareas();
    const { paginas } = await esperarTarea<{ paginas: PaginaLeida[] }>(json.tarea, (t) => {
      if (estado.hojas.some((h) => h.id === id)) cambiarHoja(id, { estado: t.estado === "en_marcha" ? "leyendo" : "en_cola" });
    });
    // Si la hoja se quitó mientras se leía, el resultado se tira
    if (!estado.hojas.some((h) => h.id === id)) return;
    const conocidas = contexto.coches.map((c) => c.matricula);
    const nuevos: BorradorRejilla[] = paginas.map((p, i) => ({
      clave: `${id}-${i}`,
      idHoja: id,
      nombreArchivo: paginas.length > 1 ? `${hoja.nombre} (pág. ${i + 1})` : hoja.nombre,
      // El mes que pone la propia hoja; si no se ha podido leer, el que cuadra con sus coches; y si tampoco, el que se estaba mirando
      mes: p.mes ?? sugerirMes(p.matriculas.map((m) => m.matricula), contexto.coches) ?? contexto.mes,
      filas: ajustarLecturas(p.matriculas.map((m) => ({ matricula: m.matricula, confianza: m.valida ? m.confianza : 0 })), conocidas),
    }));
    const total = paginas.reduce((n, p) => n + p.matriculas.length, 0);
    emitir({ hojas: estado.hojas.map((h) => (h.id === id ? { ...h, estado: total > 0 ? "leida" : "error", error: total > 0 ? undefined : "No se ha podido leer ninguna matrícula: puedes escribirlas a mano o releerla con otro motor", matriculas: total } : h)), borradores: [...estado.borradores.filter((b) => b.idHoja !== id), ...nuevos] });
    // Las hojas cuyo mes se ha adivinado por sus coches se guardan solas (si ese mes aún no tiene rejilla)
    nuevos.forEach((b, i) => {
      if (paginas[i].mes || sugerirMes(paginas[i].matriculas.map((m) => m.matricula), contexto.coches)) void guardarSola(b, hoja.idVendedor);
    });
  } catch (e) {
    if (estado.hojas.some((h) => h.id === id)) cambiarHoja(id, { estado: "error", error: e instanceof Error ? e.message : "No se ha podido leer la hoja" });
  }
}

/**
 * Guarda sola la rejilla de un borrador cuyo mes es seguro, siempre que ese mes no tenga ya una rejilla guardada (nunca sustituye una existente:
 * en ese caso se queda como borrador para decidir). Las matrículas dudosas se resuelven después en «Mi mes», con la rejilla ya guardada.
 */
async function guardarSola(b: BorradorRejilla, idVendedor: number | undefined): Promise<void> {
  const { avisar } = contexto;
  const matriculas = b.filas.map((f) => f.matricula.trim()).filter(Boolean);
  if (!idVendedor || !avisar || matriculas.length === 0 || guardandoMes.has(b.mes)) return;
  guardandoMes.add(b.mes);
  try {
    const lista = await fetch(`/api/cotejo?usuario=${idVendedor}`, { credentials: "same-origin" });
    const datos = (await lista.json().catch(() => null)) as { data?: { rejillas?: { mes: string }[] } } | null;
    const rejillas = datos?.data?.rejillas;
    if (!lista.ok || !rejillas) return;
    if (rejillas.some((r) => r.mes === b.mes)) {
      avisar(`«${b.nombreArchivo}» se ha leído, pero ya hay una rejilla guardada de ${b.mes}: revisa la nueva en «Mi mes» y decide si la sustituye.`, "aviso");
      return;
    }
    if (!estado.borradores.some((x) => x.clave === b.clave)) return;
    const guardar = await fetch(`/api/cotejo/rejillas?usuario=${idVendedor}`, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mes: b.mes, nombreArchivo: b.nombreArchivo, origen: "pdf", matriculas }) });
    if (!guardar.ok) throw new Error(`Error ${guardar.status}`);
    quitarBorrador(b.clave);
    avisarCambioDeDatos();
    avisar(`Rejilla de ${b.mes} guardada sola (${matriculas.length} matrículas). Puedes verla y corregirla en «Mis rejillas».`, "exito");
  } catch {
    avisar(`«${b.nombreArchivo}» se ha leído pero no se ha podido guardar sola: queda como borrador para guardarla a mano.`, "aviso");
  } finally {
    guardandoMes.delete(b.mes);
  }
}

/** Pone una o varias hojas en la cola de lectura (el servidor las lee de una en una, por orden). */
export function subirHojas(archivos: File[], motor?: string): string[] {
  cargar();
  const nuevas: HojaEnCola[] = archivos.map((archivo) => ({ id: `h${Date.now().toString(36)}${(contador++).toString(36)}`, nombre: archivo.name, archivo, estado: "en_cola", motor, idVendedor: contexto.idVendedor }));
  emitir({ ...estado, hojas: [...estado.hojas, ...nuevas] });
  for (const h of nuevas) void leerHoja(h.id);
  return nuevas.map((h) => h.id);
}

/** Vuelve a leer una hoja (con otro motor, si se indica): sus borradores anteriores se sustituyen por los nuevos. */
export function releerHoja(id: string, motor?: string): void {
  const h = estado.hojas.find((x) => x.id === id);
  if (!h || h.estado === "en_cola" || h.estado === "leyendo") return;
  emitir({ ...estado, hojas: estado.hojas.map((x) => (x.id === id ? { ...x, estado: "en_cola", error: undefined, motor, matriculas: undefined } : x)) });
  void leerHoja(id);
}

/** Saca una hoja de la lista (sus borradores se quedan, si los hay). */
export function quitarHoja(id: string): void {
  emitir({ ...estado, hojas: estado.hojas.filter((h) => h.id !== id) });
}

export function editarBorrador(clave: string, cambio: Partial<Omit<BorradorRejilla, "clave">>): void {
  emitir({ ...estado, borradores: estado.borradores.map((b) => (b.clave === clave ? { ...b, ...cambio } : b)) });
}

/** Descarta o da por guardado un borrador; su hoja sale también de la lista si ya no le quedan más. */
export function quitarBorrador(clave: string): void {
  const b = estado.borradores.find((x) => x.clave === clave);
  const quedan = estado.borradores.filter((x) => x.clave !== clave);
  emitir({ hojas: b && !quedan.some((x) => x.idHoja === b.idHoja) ? estado.hojas.filter((h) => h.id !== b.idHoja) : estado.hojas, borradores: quedan });
}

/** Solo para pruebas: deja la cola vacía. */
export function reiniciarRejillas(): void {
  estado = SIN_ESTADO;
  cargado = false;
  contexto = { coches: [], mes: "" };
}
