import { createHash } from "node:crypto";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { incidencias, incidenciasCapturas } from "@/db/schema";
import { cifrarBuffer, descifrarBuffer } from "@/lib/auth/cifrado";
import { HttpError } from "@/lib/auth/sesion";
import { claveDeFallo, ESTADOS_INCIDENCIA, prepararEvento, type EstadoIncidencia, type EventoIncidencia, type IncidenciaParaInforme, type NivelIncidencia, type OrigenIncidencia } from "@/lib/incidencias";
import { emitirIncidencia, instalarReceptorIncidencias } from "@/lib/incidencias-hook";

/**
 * Centro de incidencias: guarda en un solo sitio todo lo que falla o va mal. Las repeticiones del mismo fallo se juntan (por huella) y suman
 * veces; una incidencia ya resuelta que vuelve a ocurrir pasa otra vez a «nueva». Los sucesos del propio servidor se agrupan en memoria y se
 * vuelcan cada pocos segundos, para que una avalancha de errores iguales no sature la base de datos.
 */

export const MAX_INCIDENCIAS = 3000;
export const DIAS_CONSERVAR_CERRADAS = 45;
export const MAX_CAPTURA_BYTES = 4 * 1024 * 1024;

export const huellaDe = (origen: string, titulo: string, ruta: string | null | undefined): string => createHash("sha1").update(claveDeFallo(origen, titulo, ruta)).digest("hex");

export interface IncidenciaDto extends IncidenciaParaInforme {
  idUsuario: number | null;
  capturas: number[];
}

type Fila = typeof incidencias.$inferSelect;
const aDto = (f: Fila, capturas: number[] = []): IncidenciaDto => ({
  id: f.id,
  origen: f.origen as OrigenIncidencia,
  nivel: f.nivel as NivelIncidencia,
  titulo: f.titulo,
  detalle: f.detalle,
  ruta: f.ruta,
  contexto: f.contexto,
  veces: f.veces,
  primeraVez: f.primeraVez.toISOString(),
  ultimaVez: f.ultimaVez.toISOString(),
  estado: f.estado as EstadoIncidencia,
  nota: f.nota,
  version: f.version,
  idUsuario: f.idUsuario,
  capturas,
});

/** Anota (o suma una vez más) una incidencia. Devuelve su id. */
export async function registrarIncidencia(ej: Ejecutor, e: EventoIncidencia, veces = 1): Promise<number> {
  const p = prepararEvento(e);
  const huella = huellaDe(p.origen, p.titulo, p.ruta);
  const [f] = await ej
    .insert(incidencias)
    .values({ huella, origen: p.origen, nivel: p.nivel ?? "error", titulo: p.titulo, detalle: p.detalle ?? null, ruta: p.ruta ?? null, contexto: p.contexto ?? null, veces, idUsuario: p.idUsuario ?? null, version: p.version ?? null })
    .onConflictDoUpdate({
      target: incidencias.huella,
      set: {
        veces: sql`${incidencias.veces} + ${veces}`,
        ultimaVez: new Date(),
        // Lo último que pasó (con su contexto) es lo más útil para revisarlo; la nota y el estado de quien lo revisó se conservan
        detalle: p.detalle ?? sql`${incidencias.detalle}`,
        contexto: p.contexto ?? sql`${incidencias.contexto}`,
        idUsuario: p.idUsuario ?? sql`${incidencias.idUsuario}`,
        version: p.version ?? sql`${incidencias.version}`,
        nivel: p.nivel === "error" ? "error" : sql`${incidencias.nivel}`,
        // Una incidencia resuelta que vuelve a ocurrir se reabre
        estado: sql`case when ${incidencias.estado} = 'resuelta' then 'nueva' else ${incidencias.estado} end`,
      },
    })
    .returning({ id: incidencias.id });
  return f.id;
}

/** Incidencia que una persona avisa a mano: siempre es una nueva (no se junta con otras), con su captura si la hay. */
export async function crearIncidenciaManual(
  ej: Ejecutor,
  e: { texto: string; ruta: string | null; contexto: Record<string, unknown>; idUsuario: number | null; version: string | null; captura?: { mime: string; datos: Buffer } | null },
): Promise<number> {
  const texto = e.texto.trim();
  if (!texto) throw new HttpError(400, "Cuenta qué ha pasado, aunque sea en una frase.");
  const p = prepararEvento({ origen: "manual", nivel: "error", titulo: texto.split(/\r?\n/)[0], detalle: texto.includes("\n") ? texto : null, ruta: e.ruta, contexto: e.contexto, idUsuario: e.idUsuario, version: e.version });
  if (e.captura && e.captura.datos.length > MAX_CAPTURA_BYTES) throw new HttpError(413, "La captura es demasiado grande (máximo 4 MB).");
  return ej.transaction(async (tx) => {
    const [f] = await tx
      .insert(incidencias)
      .values({ huella: createHash("sha1").update(`manual|${Date.now()}|${Math.random()}`).digest("hex"), origen: "manual", nivel: "error", titulo: p.titulo, detalle: p.detalle ?? null, ruta: p.ruta ?? null, contexto: p.contexto ?? null, idUsuario: p.idUsuario ?? null, version: p.version ?? null })
      .returning({ id: incidencias.id });
    if (e.captura) await tx.insert(incidenciasCapturas).values({ idIncidencia: f.id, mime: e.captura.mime, datos: cifrarBuffer(e.captura.datos) });
    return f.id;
  });
}

export interface FiltroIncidencias {
  estados?: EstadoIncidencia[];
  origen?: OrigenIncidencia;
  nivel?: NivelIncidencia;
  limite?: number;
}

export async function listarIncidencias(ej: Ejecutor, filtro: FiltroIncidencias = {}): Promise<IncidenciaDto[]> {
  const cond = [
    filtro.estados && filtro.estados.length > 0 ? inArray(incidencias.estado, filtro.estados) : undefined,
    filtro.origen ? eq(incidencias.origen, filtro.origen) : undefined,
    filtro.nivel ? eq(incidencias.nivel, filtro.nivel) : undefined,
  ].filter((c) => c !== undefined);
  const filas = await ej
    .select()
    .from(incidencias)
    .where(cond.length > 0 ? and(...cond) : undefined)
    .orderBy(desc(incidencias.ultimaVez))
    .limit(Math.min(filtro.limite ?? 1000, 3000));
  if (filas.length === 0) return [];
  const caps = await ej.select({ id: incidenciasCapturas.id, idIncidencia: incidenciasCapturas.idIncidencia }).from(incidenciasCapturas).where(inArray(incidenciasCapturas.idIncidencia, filas.map((f) => f.id)));
  return filas.map((f) => aDto(f, caps.filter((c) => c.idIncidencia === f.id).map((c) => c.id)));
}

export async function leerIncidencia(ej: Ejecutor, id: number): Promise<IncidenciaDto | null> {
  const [f] = await ej.select().from(incidencias).where(eq(incidencias.id, id));
  if (!f) return null;
  const caps = await ej.select({ id: incidenciasCapturas.id }).from(incidenciasCapturas).where(eq(incidenciasCapturas.idIncidencia, id));
  return aDto(f, caps.map((c) => c.id));
}

export async function leerCaptura(ej: Ejecutor, id: number): Promise<{ mime: string; datos: Buffer } | null> {
  const [c] = await ej.select().from(incidenciasCapturas).where(eq(incidenciasCapturas.id, id));
  return c ? { mime: c.mime, datos: descifrarBuffer(c.datos) } : null;
}

export async function cambiarIncidencias(ej: Ejecutor, ids: number[], cambios: { estado?: EstadoIncidencia; nota?: string | null }): Promise<number> {
  if (cambios.estado && !ESTADOS_INCIDENCIA.includes(cambios.estado)) throw new HttpError(400, "Estado no válido");
  const set: Partial<typeof incidencias.$inferInsert> = {};
  if (cambios.estado) set.estado = cambios.estado;
  if (cambios.nota !== undefined) set.nota = cambios.nota?.trim().slice(0, 2000) || null;
  if (Object.keys(set).length === 0) throw new HttpError(400, "No hay nada que cambiar.");
  const filas = await ej.update(incidencias).set(set).where(inArray(incidencias.id, ids)).returning({ id: incidencias.id });
  return filas.length;
}

export async function eliminarIncidencias(ej: Ejecutor, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  return (await ej.delete(incidencias).where(inArray(incidencias.id, ids)).returning({ id: incidencias.id })).length;
}

export interface ResumenIncidencias {
  /** Errores nuevos (sin mirar): lo que enciende el aviso rojo del menú. */
  nuevasErrores: number;
  nuevasAvisos: number;
  ultimas24h: number;
  total: number;
}

export async function resumenIncidencias(ej: Ejecutor): Promise<ResumenIncidencias> {
  const hace24 = new Date(Date.now() - 24 * 3600_000);
  const [r] = await ej
    .select({
      nuevasErrores: sql<number>`count(*) filter (where ${incidencias.estado} = 'nueva' and ${incidencias.nivel} = 'error')::int`,
      nuevasAvisos: sql<number>`count(*) filter (where ${incidencias.estado} = 'nueva' and ${incidencias.nivel} = 'aviso')::int`,
      ultimas24h: sql<number>`count(*) filter (where ${incidencias.ultimaVez} >= ${hace24})::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(incidencias);
  return r;
}

/** Borra las cerradas (resueltas o ignoradas) con más de `DIAS_CONSERVAR_CERRADAS` días y, si se pasa de `MAX_INCIDENCIAS`, las más antiguas ya vistas. */
export async function depurarIncidencias(ej: Ejecutor, ahora = new Date()): Promise<number> {
  const limite = new Date(ahora.getTime() - DIAS_CONSERVAR_CERRADAS * 24 * 3600_000);
  let n = (await ej.delete(incidencias).where(and(inArray(incidencias.estado, ["resuelta", "ignorada"]), lt(incidencias.ultimaVez, limite))).returning({ id: incidencias.id })).length;
  const [{ total }] = await ej.select({ total: sql<number>`count(*)::int` }).from(incidencias);
  if (total > MAX_INCIDENCIAS) {
    const sobran = await ej.select({ id: incidencias.id }).from(incidencias).where(inArray(incidencias.estado, ["revisada", "resuelta", "ignorada"])).orderBy(incidencias.ultimaVez).limit(total - MAX_INCIDENCIAS);
    n += await eliminarIncidencias(ej, sobran.map((s) => s.id));
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Recogida en el servidor: agrupa en memoria y vuelca cada pocos segundos */
/* ------------------------------------------------------------------ */

interface Pendiente {
  evento: EventoIncidencia;
  veces: number;
}
const G = globalThis as unknown as { __incidenciasPendientes?: Map<string, Pendiente>; __incidenciasTemporizador?: ReturnType<typeof setTimeout> | null; __incidenciasEn?: Ejecutor };
const MAX_PENDIENTES = 200;

/** Vuelca ya lo acumulado (se llama solo cada pocos segundos; las pruebas lo llaman a mano). Devuelve cuántas incidencias distintas escribió. */
export async function volcarIncidencias(ej?: Ejecutor): Promise<number> {
  const mapa = G.__incidenciasPendientes;
  if (!mapa || mapa.size === 0) return 0;
  const lote = [...mapa.values()];
  mapa.clear();
  const destino = ej ?? G.__incidenciasEn;
  if (!destino) return 0;
  let n = 0;
  for (const p of lote) {
    try {
      await registrarIncidencia(destino, p.evento, p.veces);
      n++;
    } catch (e) {
      // Si falla la propia base de datos solo se anota en el registro (nunca se vuelve a registrar: sería un bucle)
      console.warn("No se pudo guardar una incidencia:", e instanceof Error ? e.message : e);
    }
  }
  return n;
}

/** Recibe un suceso del servidor: lo prepara, lo junta con los iguales y programa el volcado. */
export function anotarIncidencia(e: EventoIncidencia): void {
  const p = prepararEvento(e);
  const mapa = (G.__incidenciasPendientes ??= new Map());
  const clave = huellaDe(p.origen, p.titulo, p.ruta);
  const ya = mapa.get(clave);
  if (ya) {
    ya.veces++;
    ya.evento = { ...p, contexto: p.contexto ?? ya.evento.contexto };
  } else if (mapa.size < MAX_PENDIENTES) mapa.set(clave, { evento: p, veces: 1 });
  if (!G.__incidenciasTemporizador && G.__incidenciasEn) {
    G.__incidenciasTemporizador = setTimeout(() => {
      G.__incidenciasTemporizador = null;
      void volcarIncidencias();
    }, 4000);
    G.__incidenciasTemporizador.unref?.();
  }
}

/**
 * Deja listo el servidor para recoger incidencias: engancha el receptor (lo que emiten la API, el medidor de rendimiento…) y los errores que
 * nadie trata (promesas rechazadas, excepciones). Una sola vez por proceso.
 */
export function instalarIncidencias(ej: Ejecutor, version: string | null): void {
  if (G.__incidenciasEn) return;
  G.__incidenciasEn = ej;
  instalarReceptorIncidencias((e) => anotarIncidencia({ version, ...e }));
  process.on("unhandledRejection", (m) => emitirIncidencia({ origen: "servidor", titulo: `Promesa rechazada sin tratar: ${m instanceof Error ? m.message : String(m)}`, detalle: m instanceof Error ? m.stack : null }));
  process.on("uncaughtException", (e) => emitirIncidencia({ origen: "servidor", titulo: `Error sin tratar: ${e instanceof Error ? e.message : String(e)}`, detalle: e instanceof Error ? e.stack : null }));
  // Se limpia lo viejo al arrancar y una vez al día
  const limpiar = () => void depurarIncidencias(ej).catch(() => undefined);
  setTimeout(limpiar, 30_000).unref?.();
  setInterval(limpiar, 24 * 3600_000).unref?.();
}

