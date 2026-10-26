import { textoAsignaciones } from "./asignaciones-aviso";
import { permitirDuplicadosAhora } from "@/lib/preferencias";
import { abrirDeCola, anadirACola, fijarLectura, leerCola, quitarDeCola, type DniAsociado, type EleccionRapida } from "@/lib/pedidos-cola";
import type { DatosPedido } from "@/lib/documentos/pedido";
import type { LecturaDto, LecturaEnMarcha, ResumenLecturas } from "@/lib/servicios/lecturas-pedidos";

/**
 * Lectura de pedidos en lote desde el navegador: los ficheros se suben al servidor (que los guarda al momento y los lee en
 * paralelo en segundo plano) y esta pieza va recogiendo los pedidos leídos para ponerlos en la cola. Lo pendiente sigue en el
 * servidor aunque se cierre la página: al volver se recoge lo que haya terminado.
 */

interface Destino {
  eleccion?: EleccionRapida | null;
  idExpediente?: number | null;
  dni?: DniAsociado | null;
}

export type Aviso = (mensaje: string, tipo?: "error") => void;

let avisar: Aviso = () => undefined;
export function registrarAvisos(f: Aviso): void {
  avisar = f;
}

let resumen: ResumenLecturas | null = null;
let enMarcha: LecturaEnMarcha[] = [];
const oyentes = new Set<() => void>();
export const leerResumenLecturas = (): ResumenLecturas | null => resumen;
/** Lo que se está subiendo, esperando o leyendo (para cancelar cada pedido). */
export const leerEnMarcha = (): LecturaEnMarcha[] => enMarcha;
export function suscribirResumenLecturas(cb: () => void): () => void {
  oyentes.add(cb);
  return () => oyentes.delete(cb);
}
const emitir = () => oyentes.forEach((o) => o());

/** Progreso de la subida de ficheros al servidor (mientras dura, la pantalla se bloquea: si se corta, se perderían los que faltan). */
export interface ProgresoSubida {
  hechos: number;
  total: number;
}
let subida: ProgresoSubida | null = null;
const oyentesSubida = new Set<() => void>();
export const leerSubida = (): ProgresoSubida | null => subida;
export function suscribirSubida(cb: () => void): () => void {
  oyentesSubida.add(cb);
  return () => oyentesSubida.delete(cb);
}
function fijarSubida(p: ProgresoSubida | null): void {
  subida = p;
  oyentesSubida.forEach((o) => o());
  if (typeof window === "undefined") return;
  // Mientras se sube no se puede cerrar ni recargar la pestaña sin que el navegador pregunte
  window.removeEventListener("beforeunload", avisarAntesDeSalir);
  if (p) window.addEventListener("beforeunload", avisarAntesDeSalir);
}
function avisarAntesDeSalir(e: BeforeUnloadEvent): void {
  e.preventDefault();
  e.returnValue = "";
}

/** Diálogo «¿Cancelar?» (lo pintan las pantallas con el overlay de subida, que está siempre montado). */
let dialogoCancelar = false;
const oyentesDialogo = new Set<() => void>();
export const leerDialogoCancelar = (): boolean => dialogoCancelar;
export function suscribirDialogoCancelar(cb: () => void): () => void {
  oyentesDialogo.add(cb);
  return () => oyentesDialogo.delete(cb);
}
function fijarDialogoCancelar(v: boolean): void {
  dialogoCancelar = v;
  oyentesDialogo.forEach((o) => o());
}
/** Cualquier botón «Cancelar» de subida o lectura abre este diálogo, donde se elige qué hacer con lo ya subido. */
export const solicitarCancelacion = (): void => fijarDialogoCancelar(true);
export const cerrarDialogoCancelar = (): void => fijarDialogoCancelar(false);

/** Ids (de la lista de lecturas del servidor) de lo subido en la tanda en curso: lo que «Eliminar lo subido» borra. */
let idsTanda: number[] = [];

/** Para saber cuánto falta de la tanda en curso. */
let subidosEnTanda = 0;
let subiendo = 0;
let cancelada = false;
let controladores: AbortController[] = [];
let temporizador: ReturnType<typeof setInterval> | null = null;
let consultando = false;
let abrirElPrimero = false;
let recogidosEnTanda = 0;
/** A dónde irá cada pedido leído de la tanda (expediente existente o nuevo), para decirlo en el aviso final. */
let asignadosEnTanda: string[] = [];

const limpiar = (a: string | null | undefined): string => (a ? a.replace(/[\s.-]/g, "").toUpperCase() : "");

type DatosDePedido = DatosPedido;

/**
 * Qué pedidos ya hay en la cola, para no recoger dos veces el mismo: por número de pedido, bastidor, matrícula o, juntos, DNI + fecha + modelo.
 * Se construye una vez por tanda y se va completando, así recoger cientos de pedidos no recorre la cola entera en cada uno.
 */
function huellasDeLaCola() {
  const pedidos = new Set<string>();
  const vins = new Set<string>();
  const matriculas = new Set<string>();
  const personas = new Set<string>();
  // Mismo cliente y modelo el mismo día; si el pedido no trae fecha (el OCR no la leyó) vale mismo cliente y modelo: son copias del mismo pedido
  const clavePersona = (d: DatosDePedido) => (d.dni && d.fechaExpediente ? `${limpiar(d.dni)}|${d.fechaExpediente}|${d.idModelo}` : d.dni && d.idModelo ? `${limpiar(d.dni)}|sin fecha|${d.idModelo}` : "");
  const anadir = (d: DatosDePedido) => {
    if (limpiar(d.numeroPedido)) pedidos.add(limpiar(d.numeroPedido));
    if (limpiar(d.vin)) vins.add(limpiar(d.vin));
    if (limpiar(d.matricula)) matriculas.add(limpiar(d.matricula));
    if (clavePersona(d)) personas.add(clavePersona(d));
  };
  for (const x of leerCola().items) anadir(x.pedido.datos);
  return {
    anadir,
    /** Por qué este pedido ya está en la cola (null si no lo está). */
    motivo: (d: DatosDePedido): string | null => {
      if (limpiar(d.numeroPedido) && pedidos.has(limpiar(d.numeroPedido))) return `Repetido: ya hay en la cola un pedido con el mismo número (${d.numeroPedido})`;
      if (limpiar(d.vin) && vins.has(limpiar(d.vin))) return `Repetido: ya hay en la cola un pedido con el mismo bastidor (${d.vin})`;
      if (limpiar(d.matricula) && matriculas.has(limpiar(d.matricula))) return `Repetido: ya hay en la cola un pedido con la misma matrícula (${d.matricula})`;
      if (clavePersona(d)) return personas.has(clavePersona(d)) ? `Repetido: ya hay en la cola un pedido del mismo cliente y modelo${d.fechaExpediente ? " y fecha" : ""} (${d.cliente ?? d.dni})` : null;
      return null;
    },
  };
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin", ...init });
  const json = (await r.json().catch(() => ({}))) as { message?: string; data?: T };
  if (!r.ok || json.data === undefined) throw new Error(json.message ?? `Error ${r.status}`);
  return json.data;
}

/** Recoge los pedidos leídos y los pone en la cola; devuelve si aún hay lecturas por terminar. */
async function consultar(): Promise<boolean> {
  if (consultando) return true;
  // Mientras se sube no se pregunta al servidor: la lectura no empieza hasta que termine la subida
  if (subiendo > 0) return true;
  consultando = true;
  try {
    const { resumen: r, lecturas, enMarcha: marcha } = await pedir<{ resumen: ResumenLecturas; lecturas: LecturaDto[]; enMarcha?: LecturaEnMarcha[] }>("/api/documentos/lecturas");
    resumen = r;
    enMarcha = marcha ?? [];
    const listos = lecturas.filter((l) => l.estado === "pedido" && l.resultado);
    const recogidos: number[] = [];
    const repetidos: { id: number; motivo: string }[] = [];
    // Lo ya recogido se indexa una sola vez (no se recorre la cola entera por cada pedido leído) y todo lo nuevo entra en un solo cambio
    const huellas = huellasDeLaCola();
    const nuevosItems: Parameters<typeof anadirACola>[0] = [];
    for (const l of listos) {
      const pedido = l.resultado!;
      const d = pedido.datos;
      const motivoRepetido = huellas.motivo(d);
      if (motivoRepetido) {
        // No se pierde en silencio: queda anotado como ignorado, con el motivo, y se cuenta en «Ver cuáles»
        repetidos.push({ id: l.id, motivo: motivoRepetido });
        continue;
      }
      huellas.anadir(d);
      // Si ya existe un expediente de este pedido, la lectura sirve para completarlo: nunca se crea uno duplicado
      const yaExiste = l.destino?.idExpediente ? null : (pedido.similares[0]?.idExpediente ?? null);
      nuevosItems.push({ nombre: l.nombre, pedido, eleccion: yaExiste ? null : ((l.destino?.eleccion as EleccionRapida | null | undefined) ?? null), idExpediente: l.destino?.idExpediente ?? yaExiste, dni: l.destino?.dni ?? null, idLectura: l.id });
      recogidosEnTanda++;
      recogidos.push(l.id);
      const destino = l.destino?.idExpediente ?? yaExiste;
      const similar = pedido.similares.find((x) => x.idExpediente === destino);
      asignadosEnTanda.push(`${d.cliente ?? d.dni ?? "Sin cliente"} → ${destino ? `completa el expediente nº ${destino}${similar?.cliente ? ` de ${similar.cliente}` : ""}` : "expediente nuevo"}`);
    }
    if (nuevosItems.length > 0) {
      const nuevos = anadirACola(nuevosItems);
      if (abrirElPrimero && nuevos[0]) {
        abrirElPrimero = false;
        abrirDeCola(nuevos[0].id);
      }
    }
    if (recogidos.length > 0) await pedir("/api/documentos/lecturas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "recoger", ids: recogidos }) });
    if (repetidos.length > 0) await pedir("/api/documentos/lecturas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "repetido", repetidos }) });

    // En lectura manual, lo subido que espera a «Iniciar lectura» no cuenta como trabajo en marcha
    const trabajando = r.pendientes + r.leyendo + (r.manual ? 0 : r.subiendo);
    // Al recargar la página se pierde la cuenta de la tanda (vive en memoria): el total no puede ser menor que lo que el servidor aún tiene en marcha
    if (subidosEnTanda < trabajando + recogidosEnTanda) subidosEnTanda = trabajando + recogidosEnTanda;
    if (trabajando > 0 || subiendo > 0) fijarLectura({ hechos: Math.max(0, subidosEnTanda - trabajando - subiendo), total: Math.max(subidosEnTanda, 1) });
    else {
      fijarLectura(null);
      if (subidosEnTanda > 0 && !cancelada) {
        avisar(`${recogidosEnTanda} pedido${recogidosEnTanda === 1 ? "" : "s"} leído${recogidosEnTanda === 1 ? "" : "s"}${recogidosEnTanda > 0 ? " (están en la cola de pedidos)" : ""}${r.descartados + repetidos.length > 0 ? `, ${r.descartados + repetidos.length} ignorados (${r.descartados + repetidos.length - r.repetidos - repetidos.length} no eran pedidos y ${r.repetidos + repetidos.length} estaban repetidos)` : ""}${r.errores > 0 ? ` y ${r.errores} con error (puedes reintentarlos desde la cola)` : ""}.${textoAsignaciones(asignadosEnTanda)}`);
      }
      subidosEnTanda = 0;
      recogidosEnTanda = 0;
      asignadosEnTanda = [];
    }
    emitir();
    return trabajando > 0 || subiendo > 0 || listos.length > recogidos.length + repetidos.length;
  } catch {
    return true; // sin conexión un momento: se vuelve a intentar
  } finally {
    consultando = false;
  }
}

/** Empieza (o sigue) a consultar el servidor cada poco mientras haya lecturas en marcha. */
export function iniciarSondeo(): void {
  if (typeof window === "undefined" || temporizador) return;
  const vuelta = async () => {
    const sigue = await consultar();
    if (!sigue && temporizador) {
      clearInterval(temporizador);
      temporizador = null;
    }
  };
  void vuelta();
  temporizador = setInterval(() => void vuelta(), 1500);
}

/** Consulta una vez (por ejemplo al abrir la pantalla): recoge lo que se leyó mientras no estabas y sigue si hay algo en marcha. */
export async function recogerPendientes(): Promise<void> {
  if (await consultar()) iniciarSondeo();
}

/** Sube los ficheros al servidor (varios a la vez) y deja el resto en manos de los lectores. */
export async function subirPedidos(ficheros: File[], destino: Destino): Promise<void> {
  cancelada = false;
  if (subiendo === 0 && subida === null) idsTanda = [];
  abrirElPrimero = true;
  subidosEnTanda += ficheros.length;
  iniciarSondeo();
  let siguiente = 0;
  let subidos = 0;
  let fallosSeguidos = 0;
  let detenida = false;
  fijarSubida({ hechos: 0, total: ficheros.length });
  const dest = { eleccion: destino.eleccion ?? null, idExpediente: destino.idExpediente ?? null, dni: destino.dni ?? null };
  const subirUno = async (f: File, senal: AbortSignal) => {
    const q = new URLSearchParams({ nombre: f.name, lote: "1" });
    if (permitirDuplicadosAhora()) q.set("duplicados", "permitir");
    if (dest.eleccion || dest.idExpediente || dest.dni) q.set("destino", JSON.stringify(dest));
    const r = await pedir<{ id?: number }>(`/api/documentos/lecturas?${q.toString()}`, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f, signal: senal });
    if (typeof r?.id === "number") idsTanda.push(r.id);
  };
  const subir = async () => {
    while (siguiente < ficheros.length && !cancelada && !detenida) {
      const f = ficheros[siguiente++];
      const c = new AbortController();
      controladores.push(c);
      subiendo++;
      try {
        try {
          await subirUno(f, c.signal);
        } catch (e) {
          if (c.signal.aborted) throw e;
          // Un reintento por si fue un fallo puntual
          await new Promise((r) => setTimeout(r, 1000));
          await subirUno(f, c.signal);
        }
        fallosSeguidos = 0;
      } catch (e) {
        subidosEnTanda--;
        fallosSeguidos++;
        if (!cancelada) {
          // Con el servidor caído no se avisa de cada fichero: tras unos cuantos fallos seguidos se detiene la subida
          if (fallosSeguidos >= 5) {
            detenida = true;
            avisar(`La subida se ha detenido: el servidor no responde (${e instanceof Error ? e.message : "sin conexión"}). Se habían subido ${subidos} pedidos; vuelve a cargar cuando el servidor responda.`, "error");
          } else if (fallosSeguidos <= 2) avisar(`${f.name}: ${e instanceof Error ? e.message : "no se pudo subir"}`, "error");
        }
      } finally {
        subiendo--;
        subidos++;
        fijarSubida({ hechos: subidos, total: ficheros.length });
        controladores = controladores.filter((x) => x !== c);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(6, ficheros.length) }, subir));
    // Terminada la subida (y solo entonces) empieza la lectura de todo lo subido
    // (en lectura manual el servidor no hace nada: la lectura la inicia el usuario con «Iniciar lectura»)
    if (!cancelada) await pedir("/api/documentos/lecturas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "iniciar", automatico: true }) }).catch(() => undefined);
  } finally {
    fijarSubida(null);
  }
  iniciarSondeo();
}
/**
 * Para la subida en curso (corta las peticiones que van) y decide qué pasa con lo ya subido:
 * - `eliminar: true`: se borra todo lo subido en esta tanda (lo que esperaba, lo que se estaba leyendo, y lo ya leído que aún está en la
 *   cola de pedidos, con sus documentos). No queda nada a medias.
 * - `eliminar: false`: se deja lo subido tal cual (en lectura manual espera a «Iniciar lectura»; si no, se lee como siempre).
 */
export async function cancelarLecturas(opciones: { eliminar?: boolean } = {}): Promise<void> {
  const eliminar = opciones.eliminar ?? true;
  cancelada = true;
  controladores.forEach((c) => c.abort());
  fijarSubida(null);
  fijarDialogoCancelar(false);
  if (!eliminar) {
    avisar("Subida parada. Lo que ya estaba subido se queda subido.");
    subidosEnTanda = 0;
    await consultar();
    return;
  }
  const ids = [...idsTanda];
  try {
    // Con ids, solo lo de esta tanda; sin ellos (cancelar desde la lista de lo que falta), todo lo que esté en marcha
    await pedir("/api/documentos/lecturas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "cancelar", ...(ids.length > 0 ? { ids } : {}) }) });
  } catch {
    /* si no hay conexión, lo pendiente sigue y se puede cancelar luego */
  }
  // Lo ya leído de esta tanda que está en la cola de pedidos también se quita (y sus documentos se marcan como eliminados)
  const deLaTanda = new Set(ids);
  let quitados = 0;
  for (const item of leerCola().items) {
    if (item.idLectura === undefined || !deLaTanda.has(item.idLectura)) continue;
    for (const id of [item.pedido.adjunto.id, ...(item.dni?.adjuntos ?? [])]) void fetch(`/api/adjuntos?id=${id}`, { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
    anotarResolucion(item.idLectura, "quitado");
    quitarDeCola(item.id);
    quitados++;
  }
  idsTanda = [];
  avisar(`Cancelado y eliminado lo subido en esta tanda${quitados > 0 ? ` (también ${quitados} ya leído${quitados === 1 ? "" : "s"} de la cola)` : ""}. No ha quedado ningún documento a medias.`);
  subidosEnTanda = 0;
  await consultar();
}

/** Empieza a leer lo que está subido y esperando (en lectura manual, el botón «Iniciar lectura»). */
export async function iniciarLectura(): Promise<void> {
  try {
    await pedir("/api/documentos/lecturas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "iniciar" }) });
  } catch {
    avisar("No se pudo iniciar la lectura: inténtalo de nuevo.", "error");
    return;
  }
  await consultar();
  iniciarSondeo();
}

/**
 * Cancela solo estos pedidos (que se estén subiendo, esperando o leyendo): el servidor los deja como «cancelados», borra sus ficheros y,
 * si ya se estaban leyendo, tira el resultado. Lo demás de la tanda sigue.
 */
export async function cancelarPedidos(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await pedir("/api/documentos/lecturas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "cancelar", ids }) });
  } catch {
    avisar("No se pudo cancelar ahora mismo: inténtalo de nuevo.", "error");
  }
  await consultar();
}

/** Anota en el registro de lecturas qué se hizo con un pedido de la cola (expediente creado o completado, o quitado). */
export function anotarResolucion(idLectura: number | undefined, resolucion: "creado" | "completado" | "quitado", idExpediente?: number | null): void {
  if (!idLectura) return;
  void pedir("/api/documentos/lecturas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "resolver", ids: [idLectura], resolucion, idExpediente: idExpediente ?? null }) }).catch(() => undefined);
}

export async function accionSobreLecturas(accion: "reintentar" | "limpiar" | "rescatar", ids?: number[]): Promise<void> {
  await pedir("/api/documentos/lecturas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion, ids }) });
  await consultar();
  iniciarSondeo();
}

/** Los descartados y con error, para que se vea qué pasó con cada documento. */
export async function listarNoPedidos(): Promise<LecturaDto[]> {
  const { lecturas } = await pedir<{ lecturas: LecturaDto[] }>("/api/documentos/lecturas?otros=1");
  return lecturas;
}
