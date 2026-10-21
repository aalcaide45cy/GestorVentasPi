/**
 * Anotación de lo lento: peticiones de la API y consultas a la base de datos. Sin dependencias (lo usan `http.ts` y `db/index.ts`).
 * Guarda en memoria las últimas peticiones y las consultas lentas para la pestaña «Rendimiento», y deja una línea en el registro del
 * servidor cuando algo tarda demasiado o falla. Nunca guarda valores de parámetros ni cuerpos de petición, solo rutas y texto de SQL.
 */

import { emitirIncidencia } from "@/lib/incidencias-hook";

export interface Peticion {
  en: number;
  metodo: string;
  ruta: string;
  estado: number;
  ms: number;
}

export interface ConsultaLenta {
  en: number;
  ms: number;
  sql: string;
}

interface Estado {
  peticiones: Peticion[];
  consultas: ConsultaLenta[];
}

const G = globalThis as unknown as { __rendimientoRegistro?: Estado };
const estado = (): Estado => (G.__rendimientoRegistro ??= { peticiones: [], consultas: [] });

const MAX_PETICIONES = 3000;
const MAX_CONSULTAS = 100;
/** A partir de cuántos ms se anota una petición o una consulta en el registro del servidor. */
export const UMBRAL_PETICION_LENTA_MS = 2000;
export const UMBRAL_CONSULTA_LENTA_MS = 500;

/** Las rutas con identificadores se agrupan: `/api/expedientes/123` y `/api/expedientes/456` son la misma. */
export const normalizarRuta = (ruta: string): string => ruta.replace(/\/\d+(?=\/|$)/g, "/:id").replace(/\/[0-9a-f]{32}(?=\/|$)/g, "/:id");

export function registrarPeticion(metodo: string, ruta: string, estadoHttp: number, ms: number): void {
  const e = estado();
  e.peticiones.push({ en: Date.now(), metodo, ruta: normalizarRuta(ruta), estado: estadoHttp, ms: Math.round(ms) });
  if (e.peticiones.length > MAX_PETICIONES) e.peticiones.splice(0, e.peticiones.length - MAX_PETICIONES);
  if (estadoHttp >= 500) console.error(`Petición con error ${estadoHttp}: ${metodo} ${normalizarRuta(ruta)} (${Math.round(ms)} ms)`);
  else if (ms >= UMBRAL_PETICION_LENTA_MS) {
    console.warn(`Petición lenta (${Math.round(ms)} ms): ${metodo} ${normalizarRuta(ruta)} → ${estadoHttp}`);
    emitirIncidencia({ origen: "rendimiento", nivel: "aviso", titulo: `Petición lenta: ${metodo} ${normalizarRuta(ruta)}`, ruta: `${metodo} ${normalizarRuta(ruta)}`, contexto: { ms: Math.round(ms), estado: estadoHttp } });
  }
}

export function registrarConsulta(ms: number, texto: string): void {
  if (ms < UMBRAL_CONSULTA_LENTA_MS) return;
  const sql = texto.replace(/\s+/g, " ").trim().slice(0, 400);
  const e = estado();
  e.consultas.push({ en: Date.now(), ms: Math.round(ms), sql });
  if (e.consultas.length > MAX_CONSULTAS) e.consultas.splice(0, e.consultas.length - MAX_CONSULTAS);
  console.warn(`Consulta lenta (${Math.round(ms)} ms): ${sql.slice(0, 250)}`);
  emitirIncidencia({ origen: "rendimiento", nivel: "aviso", titulo: `Consulta lenta: ${sql.slice(0, 160)}`, contexto: { ms: Math.round(ms) } });
}

export interface ResumenRuta {
  ruta: string;
  metodo: string;
  veces: number;
  mediaMs: number;
  maxMs: number;
  errores: number;
}

/** Peticiones de los últimos `minutos`, agrupadas por método y ruta, las más lentas (por tiempo total) primero. */
export function resumenPeticiones(minutos = 30, limite = 15): { total: number; rutas: ResumenRuta[]; lentas: Peticion[] } {
  const desde = Date.now() - minutos * 60_000;
  const lista = estado().peticiones.filter((p) => p.en >= desde);
  const grupos = new Map<string, { metodo: string; ruta: string; ms: number[]; errores: number }>();
  for (const p of lista) {
    const k = `${p.metodo} ${p.ruta}`;
    const g = grupos.get(k) ?? { metodo: p.metodo, ruta: p.ruta, ms: [], errores: 0 };
    g.ms.push(p.ms);
    if (p.estado >= 500) g.errores++;
    grupos.set(k, g);
  }
  const rutas = [...grupos.values()]
    .map((g) => ({ ruta: g.ruta, metodo: g.metodo, veces: g.ms.length, mediaMs: Math.round(g.ms.reduce((a, b) => a + b, 0) / g.ms.length), maxMs: Math.max(...g.ms), errores: g.errores }))
    .sort((a, b) => b.mediaMs * b.veces - a.mediaMs * a.veces)
    .slice(0, limite);
  return { total: lista.length, rutas, lentas: [...lista].sort((a, b) => b.ms - a.ms).slice(0, 10) };
}

export const consultasLentas = (): ConsultaLenta[] => [...estado().consultas].reverse();

/** Para pruebas. */
export function olvidarRendimiento(): void {
  delete G.__rendimientoRegistro;
}
