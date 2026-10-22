import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hostname } from "node:os";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { incidencias, incidenciasCapturas } from "@/db/schema";
import { cifrar, cifrarBuffer, descifrar, descifrarBuffer } from "@/lib/auth/cifrado";
import { HttpError } from "@/lib/auth/sesion";
import { prepararEvento } from "@/lib/incidencias";
import { guardarAjuste, leerAjustes } from "./catalogos";
import { MAX_CAPTURA_BYTES } from "./incidencias";

/**
 * Reportes de fallo desde otros equipos. Una instalación manda: el servidor principal (el PC) recibe, en «Incidencias», los reportes que se hacen
 * desde los demás equipos (el Mac, la Raspberry…). Cada equipo secundario guarda la dirección del principal y una clave; cada reporte manual (con su
 * captura) se reenvía solo, y si no hay conexión se queda en cola y se reintenta cada minuto hasta que llega. El principal ya no necesita estar
 * en la misma red: basta que su dirección (por ejemplo la de Tailscale Funnel) sea accesible desde Internet; la clave evita que cualquiera mande reportes.
 */

const K_RECIBIR = "incidencias_clave_recepcion";
const K_URL = "incidencias_principal_url";
const K_CLAVE = "incidencias_principal_clave";
const K_EQUIPO = "incidencias_equipo_nombre";
const K_DESDE = "incidencias_reenvio_desde";

export const RUTA_RECEPCION = "/api/incidencias/remota";

const G = globalThis as unknown as { __reenvioEstado?: { ultimoError: string | null; ultimoEnvio: string | null; enCurso: boolean } };
const estadoEnvio = () => (G.__reenvioEstado ??= { ultimoError: null, ultimoEnvio: null, enCurso: false });

export interface EstadoReenvio {
  /** Este servidor admite reportes de otros equipos (tiene una clave de recepción). */
  recibe: boolean;
  /** La clave de recepción, para copiarla en el otro equipo (solo la ve el administrador). */
  claveRecepcion: string | null;
  /** Este equipo reenvía sus reportes a un servidor principal. */
  envia: boolean;
  urlPrincipal: string;
  nombreEquipo: string;
  /** Reportes manuales de este equipo que aún no han llegado al principal. */
  pendientes: number;
  ultimoError: string | null;
  ultimoEnvio: string | null;
}

const hostEquipo = (): string => hostname().replace(/\.local$/i, "");

async function ajustes(ej: Ejecutor): Promise<Record<string, string>> {
  return leerAjustes(ej);
}

const abrir = (v: string | undefined): string | null => {
  if (!v) return null;
  try {
    return descifrar(v);
  } catch {
    return null;
  }
};

async function contarPendientes(ej: Ejecutor, desde: Date | null): Promise<number> {
  if (!desde) return 0;
  const filas = await ej.select({ id: incidencias.id }).from(incidencias).where(and(eq(incidencias.origen, "manual"), isNull(incidencias.enviadaEn), isNull(incidencias.equipo), gte(incidencias.primeraVez, desde)));
  return filas.length;
}

export async function estadoReenvio(ej: Ejecutor): Promise<EstadoReenvio> {
  const a = await ajustes(ej);
  const desde = a[K_DESDE] ? new Date(a[K_DESDE]) : null;
  const url = a[K_URL] ?? "";
  const clave = abrir(a[K_CLAVE]);
  const envia = !!url && !!clave;
  return {
    recibe: !!abrir(a[K_RECIBIR]),
    claveRecepcion: abrir(a[K_RECIBIR]),
    envia,
    urlPrincipal: url,
    nombreEquipo: a[K_EQUIPO] || hostEquipo(),
    pendientes: envia ? await contarPendientes(ej, desde) : 0,
    ultimoError: estadoEnvio().ultimoError,
    ultimoEnvio: estadoEnvio().ultimoEnvio,
  };
}

/** Crea (o cambia) la clave con la que este servidor acepta reportes de otros equipos. */
export async function generarClaveRecepcion(ej: Ejecutor): Promise<string> {
  const clave = randomBytes(24).toString("base64url");
  await guardarAjuste(ej, K_RECIBIR, cifrar(clave));
  return clave;
}

/** Quita la clave: este servidor deja de aceptar reportes de otros equipos. */
export async function quitarClaveRecepcion(ej: Ejecutor): Promise<void> {
  await guardarAjuste(ej, K_RECIBIR, "");
}

export const esquemaDestino = z.object({
  url: z.string().trim().max(300).refine((u) => /^https?:\/\/[^\s]+$/i.test(u) || u === "", "La dirección debe empezar por https:// (o http://)"),
  clave: z.string().trim().max(200),
  nombreEquipo: z.string().trim().max(80).optional(),
});

/** Guarda a dónde reenviar los reportes de este equipo. Con la dirección vacía, se deja de reenviar. */
export async function guardarDestino(ej: Ejecutor, entrada: z.infer<typeof esquemaDestino>): Promise<void> {
  const url = entrada.url.replace(/\/+$/, "");
  await guardarAjuste(ej, K_URL, url);
  if (entrada.clave) await guardarAjuste(ej, K_CLAVE, cifrar(entrada.clave));
  if (!url) await guardarAjuste(ej, K_CLAVE, "");
  if (entrada.nombreEquipo !== undefined) await guardarAjuste(ej, K_EQUIPO, entrada.nombreEquipo);
  // Solo se reenvía lo que se reporte a partir de ahora (lo anterior queda en este equipo)
  const a = await ajustes(ej);
  if (url && !a[K_DESDE]) await guardarAjuste(ej, K_DESDE, new Date().toISOString());
}

interface Cuerpo {
  prueba?: boolean;
  equipo: string;
  idRemoto: number;
  titulo: string;
  detalle: string | null;
  ruta: string | null;
  contexto: Record<string, unknown> | null;
  version: string | null;
  creadaEn: string;
  captura?: { mime: string; base64: string } | null;
}

export const esquemaRemota = z.object({
  prueba: z.boolean().optional(),
  equipo: z.string().trim().min(1).max(80),
  idRemoto: z.number().int().nonnegative(),
  titulo: z.string().min(1).max(2000),
  detalle: z.string().max(20000).nullish(),
  ruta: z.string().max(500).nullish(),
  contexto: z.record(z.string(), z.unknown()).nullish(),
  version: z.string().max(20).nullish(),
  creadaEn: z.string().max(40),
  captura: z.object({ mime: z.enum(["image/png", "image/jpeg", "image/webp"]), base64: z.string().max(MAX_CAPTURA_BYTES * 2) }).nullish(),
});

const iguales = (a: string, b: string): boolean => {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
};

/** Recibe un reporte de otro equipo (lo llama la ruta pública, ya con la clave). Es idempotente: si el mismo reporte llega dos veces, no se duplica. */
export async function recibirReporteRemoto(ej: Ejecutor, claveRecibida: string, entrada: z.infer<typeof esquemaRemota>): Promise<{ id: number | null; repetido: boolean }> {
  const a = await ajustes(ej);
  const clave = abrir(a[K_RECIBIR]);
  if (!clave) throw new HttpError(404, "Este servidor no recibe reportes de otros equipos.");
  if (!claveRecibida || !iguales(claveRecibida, clave)) throw new HttpError(401, "Clave no válida.");
  if (entrada.prueba) return { id: null, repetido: false };
  const huella = createHash("sha1").update(`remoto|${entrada.equipo}|${entrada.idRemoto}`).digest("hex");
  const [ya] = await ej.select({ id: incidencias.id }).from(incidencias).where(eq(incidencias.huella, huella));
  if (ya) return { id: ya.id, repetido: true };
  const p = prepararEvento({ origen: "manual", nivel: "error", titulo: entrada.titulo, detalle: entrada.detalle ?? null, ruta: entrada.ruta ?? null, contexto: { ...(entrada.contexto ?? {}), equipo: entrada.equipo, creadaEn: entrada.creadaEn }, idUsuario: null, version: entrada.version ?? null });
  let captura: { mime: string; datos: Buffer } | null = null;
  if (entrada.captura) {
    const datos = Buffer.from(entrada.captura.base64, "base64");
    if (datos.length > MAX_CAPTURA_BYTES) throw new HttpError(413, "La captura es demasiado grande (máximo 4 MB).");
    captura = { mime: entrada.captura.mime, datos };
  }
  const id = await ej.transaction(async (tx) => {
    const [f] = await tx
      .insert(incidencias)
      .values({ huella, origen: "manual", nivel: "error", titulo: p.titulo, detalle: p.detalle ?? null, ruta: p.ruta ?? null, contexto: p.contexto ?? null, version: p.version ?? null, equipo: entrada.equipo, primeraVez: new Date(entrada.creadaEn) })
      .returning({ id: incidencias.id });
    if (captura) await tx.insert(incidenciasCapturas).values({ idIncidencia: f.id, mime: captura.mime, datos: cifrarBuffer(captura.datos) });
    return f.id;
  });
  return { id, repetido: false };
}

async function enviar(url: string, clave: string, cuerpo: Cuerpo): Promise<void> {
  const r = await fetch(`${url}${RUTA_RECEPCION}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(25_000) });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(j.message ?? `El servidor principal respondió ${r.status}`);
  }
}

/** Comprueba la dirección y la clave mandando un reporte de prueba (no queda nada anotado en el principal). */
export async function probarDestino(ej: Ejecutor): Promise<void> {
  const a = await ajustes(ej);
  const clave = abrir(a[K_CLAVE]);
  if (!a[K_URL] || !clave) throw new HttpError(400, "Falta la dirección o la clave del servidor principal.");
  try {
    await enviar(a[K_URL], clave, { prueba: true, equipo: a[K_EQUIPO] || hostEquipo(), idRemoto: 0, titulo: "prueba", detalle: null, ruta: null, contexto: null, version: null, creadaEn: new Date().toISOString() });
  } catch (e) {
    throw new HttpError(502, `No se pudo conectar con el servidor principal: ${e instanceof Error ? e.message : "error desconocido"}`);
  }
}

/**
 * Manda al servidor principal los reportes manuales de este equipo que aún no han llegado (de más antiguo a más reciente). Si uno falla, se para y
 * se reintenta en la siguiente ronda (cada minuto). Nunca lanza: lo importante es que el reporte ya está guardado aquí.
 */
export async function reenviarPendientes(ej: Ejecutor): Promise<{ enviados: number; pendientes: number }> {
  const est = estadoEnvio();
  if (est.enCurso) return { enviados: 0, pendientes: -1 };
  est.enCurso = true;
  let enviados = 0;
  try {
    const a = await ajustes(ej);
    const clave = abrir(a[K_CLAVE]);
    const desde = a[K_DESDE] ? new Date(a[K_DESDE]) : null;
    if (!a[K_URL] || !clave || !desde) return { enviados: 0, pendientes: 0 };
    const equipo = a[K_EQUIPO] || hostEquipo();
    const lista = await ej.select().from(incidencias).where(and(eq(incidencias.origen, "manual"), isNull(incidencias.enviadaEn), isNull(incidencias.equipo), gte(incidencias.primeraVez, desde))).orderBy(asc(incidencias.id)).limit(10);
    for (const f of lista) {
      const [cap] = await ej.select().from(incidenciasCapturas).where(eq(incidenciasCapturas.idIncidencia, f.id));
      try {
        await enviar(a[K_URL], clave, {
          equipo,
          idRemoto: f.id,
          titulo: f.titulo,
          detalle: f.detalle,
          ruta: f.ruta,
          contexto: f.contexto,
          version: f.version,
          creadaEn: f.primeraVez.toISOString(),
          captura: cap ? { mime: cap.mime, base64: descifrarBuffer(cap.datos).toString("base64") } : null,
        });
        await ej.update(incidencias).set({ enviadaEn: new Date() }).where(eq(incidencias.id, f.id));
        enviados++;
        est.ultimoEnvio = new Date().toISOString();
        est.ultimoError = null;
      } catch (e) {
        est.ultimoError = e instanceof Error ? e.message : "error desconocido";
        break;
      }
    }
  } catch (e) {
    est.ultimoError = e instanceof Error ? e.message : "error desconocido";
  } finally {
    est.enCurso = false;
  }
  const a = await ajustes(ej).catch(() => ({}) as Record<string, string>);
  return { enviados, pendientes: await contarPendientes(ej, a[K_DESDE] ? new Date(a[K_DESDE]) : null).catch(() => 0) };
}
