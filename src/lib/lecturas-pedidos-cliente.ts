import { permitirDuplicadosAhora } from "@/lib/preferencias";
import { abrirDeCola, anadirACola, fijarLectura, huecosEnCola, leerCola, type DniAsociado, type EleccionRapida } from "@/lib/pedidos-cola";
import type { LecturaDto, ResumenLecturas } from "@/lib/servicios/lecturas-pedidos";

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
const oyentes = new Set<() => void>();
export const leerResumenLecturas = (): ResumenLecturas | null => resumen;
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

/** Para saber cuánto falta de la tanda en curso. */
let subidosEnTanda = 0;
let subiendo = 0;
let cancelada = false;
let controladores: AbortController[] = [];
let temporizador: ReturnType<typeof setInterval> | null = null;
let consultando = false;
let abrirElPrimero = false;
let recogidosEnTanda = 0;
let ignoradosEnTanda = 0;

const mismo = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.replace(/[\s.-]/g, "").toUpperCase() === b.replace(/[\s.-]/g, "").toUpperCase();

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
    const { resumen: r, lecturas } = await pedir<{ resumen: ResumenLecturas; lecturas: LecturaDto[] }>("/api/documentos/lecturas");
    resumen = r;
    const listos = lecturas.filter((l) => l.estado === "pedido" && l.resultado);
    const recogidos: number[] = [];
    for (const l of listos) {
      const pedido = l.resultado!;
      const d = pedido.datos;
      const repetido = leerCola().items.some(
        (x) =>
          mismo(x.pedido.datos.numeroPedido, d.numeroPedido) ||
          mismo(x.pedido.datos.vin, d.vin) ||
          mismo(x.pedido.datos.matricula, d.matricula) ||
          (!!d.dni && !!d.fechaExpediente && mismo(x.pedido.datos.dni, d.dni) && x.pedido.datos.fechaExpediente === d.fechaExpediente && x.pedido.datos.idModelo === d.idModelo),
      );
      if (repetido) {
        ignoradosEnTanda++;
        recogidos.push(l.id);
        continue;
      }
      if (huecosEnCola() === 0) break; // cola llena: se quedan en el servidor hasta que haya sitio
      // Si ya existe un expediente de este pedido, la lectura sirve para completarlo: nunca se crea uno duplicado
      const yaExiste = l.destino?.idExpediente ? null : (pedido.similares[0]?.idExpediente ?? null);
      const nuevos = anadirACola([{ nombre: l.nombre, pedido, eleccion: yaExiste ? null : ((l.destino?.eleccion as EleccionRapida | null | undefined) ?? null), idExpediente: l.destino?.idExpediente ?? yaExiste, dni: l.destino?.dni ?? null, idLectura: l.id }]);
      recogidosEnTanda++;
      recogidos.push(l.id);
      if (abrirElPrimero && nuevos[0]) {
        abrirElPrimero = false;
        abrirDeCola(nuevos[0].id);
      }
    }
    if (recogidos.length > 0) await pedir("/api/documentos/lecturas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "recoger", ids: recogidos }) });

    const trabajando = r.pendientes + r.leyendo + r.subiendo;
    // Al recargar la página se pierde la cuenta de la tanda (vive en memoria): el total no puede ser menor que lo que el servidor aún tiene en marcha
    if (subidosEnTanda < trabajando + recogidosEnTanda) subidosEnTanda = trabajando + recogidosEnTanda;
    if (trabajando > 0 || subiendo > 0) fijarLectura({ hechos: Math.max(0, subidosEnTanda - trabajando - subiendo), total: Math.max(subidosEnTanda, 1) });
    else {
      fijarLectura(null);
      if (subidosEnTanda > 0 && !cancelada) {
        avisar(`${recogidosEnTanda} pedido${recogidosEnTanda === 1 ? "" : "s"} leído${recogidosEnTanda === 1 ? "" : "s"}${recogidosEnTanda > 0 ? " (están en la cola de pedidos)" : ""}${r.descartados + ignoradosEnTanda > 0 ? `, ${r.descartados + ignoradosEnTanda} que no eran pedidos o estaban repetidos, ignorados` : ""}${r.errores > 0 ? ` y ${r.errores} con error (puedes reintentarlos desde la cola)` : ""}.`);
      }
      subidosEnTanda = 0;
      recogidosEnTanda = 0;
      ignoradosEnTanda = 0;
    }
    emitir();
    return trabajando > 0 || subiendo > 0 || listos.length > recogidos.length;
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
    await pedir(`/api/documentos/lecturas?${q.toString()}`, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f, signal: senal });
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
    if (!cancelada) await pedir("/api/documentos/lecturas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "iniciar" }) }).catch(() => undefined);
  } finally {
    fijarSubida(null);
  }
  iniciarSondeo();
}
/** Corta las subidas en curso y cancela lo que aún no ha empezado a leerse (lo que ya se está leyendo termina). */
export async function cancelarLecturas(): Promise<void> {
  cancelada = true;
  controladores.forEach((c) => c.abort());
  fijarSubida(null);
  try {
    await pedir("/api/documentos/lecturas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "cancelar" }) });
  } catch {
    /* si no hay conexión, lo pendiente sigue y se puede cancelar luego */
  }
  avisar("Lectura cancelada: lo que ya estaba leído se queda en la cola.");
  subidosEnTanda = 0;
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
