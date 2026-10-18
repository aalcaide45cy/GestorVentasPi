import { permitirDuplicadosAhora } from "@/lib/preferencias";
import { abrirDeCola, anadirACola, fijarLectura, huecosEnCola, leerCola, type EleccionRapida } from "@/lib/pedidos-cola";
import type { LecturaDto, ResumenLecturas } from "@/lib/servicios/lecturas-pedidos";

/**
 * Lectura de pedidos en lote desde el navegador: los ficheros se suben al servidor (que los guarda al momento y los lee en
 * paralelo en segundo plano) y esta pieza va recogiendo los pedidos leídos para ponerlos en la cola. Lo pendiente sigue en el
 * servidor aunque se cierre la página: al volver se recoge lo que haya terminado.
 */

interface Destino {
  eleccion?: EleccionRapida | null;
  idExpediente?: number | null;
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
      const nuevos = anadirACola([{ nombre: l.nombre, pedido, eleccion: yaExiste ? null : ((l.destino?.eleccion as EleccionRapida | null | undefined) ?? null), idExpediente: l.destino?.idExpediente ?? yaExiste, idLectura: l.id }]);
      recogidosEnTanda++;
      recogidos.push(l.id);
      if (abrirElPrimero && nuevos[0]) {
        abrirElPrimero = false;
        abrirDeCola(nuevos[0].id);
      }
    }
    if (recogidos.length > 0) await pedir("/api/documentos/lecturas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "recoger", ids: recogidos }) });

    const trabajando = r.pendientes + r.leyendo;
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
  const subir = async () => {
    while (siguiente < ficheros.length && !cancelada) {
      const f = ficheros[siguiente++];
      const c = new AbortController();
      controladores.push(c);
      subiendo++;
      try {
        const q = new URLSearchParams({ nombre: f.name });
        if (permitirDuplicadosAhora()) q.set("duplicados", "permitir");
        const dest = { eleccion: destino.eleccion ?? null, idExpediente: destino.idExpediente ?? null };
        if (dest.eleccion || dest.idExpediente) q.set("destino", JSON.stringify(dest));
        await pedir(`/api/documentos/lecturas?${q.toString()}`, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f, signal: c.signal });
      } catch (e) {
        subidosEnTanda--;
        if (!cancelada) avisar(`${f.name}: ${e instanceof Error ? e.message : "no se pudo subir"}`, "error");
      } finally {
        subiendo--;
        controladores = controladores.filter((x) => x !== c);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, ficheros.length) }, subir));
  iniciarSondeo();
}

/** Corta las subidas en curso y cancela lo que aún no ha empezado a leerse (lo que ya se está leyendo termina). */
export async function cancelarLecturas(): Promise<void> {
  cancelada = true;
  controladores.forEach((c) => c.abort());
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
  const { lecturas } = await pedir<{ lecturas: LecturaDto[] }>("/api/documentos/lecturas");
  return lecturas.filter((l) => l.estado === "descartado" || l.estado === "error" || l.estado === "cancelado");
}
