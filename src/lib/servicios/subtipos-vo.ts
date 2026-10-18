import { and, eq, isNull, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { ajustes, commissionUsedRates, estadoVehiculo } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";

const CLAVE = "subtipos_vo";
const POR_DEFECTO = ["USADO", "KM0", "DEMO", "BUYBACK"];

export interface SubtipoVo {
  nombre: string;
  /** Estados del vehículo que lo usan. */
  estados: number;
  /** Tarifas de planes que lo usan. */
  tarifas: number;
}

export const normalizarSubtipo = (n: string): string => n.trim().toUpperCase();

function validar(n: string): string {
  const v = normalizarSubtipo(n);
  if (v.length < 1 || v.length > 30) throw new HttpError(400, "El nombre del subtipo debe tener entre 1 y 30 caracteres.");
  return v;
}

async function leerGuardados(ej: Ejecutor): Promise<string[]> {
  const [f] = await ej.select().from(ajustes).where(eq(ajustes.clave, CLAVE));
  if (!f) return POR_DEFECTO;
  try {
    const l: unknown = JSON.parse(f.valor);
    return Array.isArray(l) ? l.filter((x): x is string => typeof x === "string") : POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
}

async function guardar(ej: Ejecutor, lista: string[]): Promise<void> {
  const valor = JSON.stringify([...new Set(lista)]);
  await ej.insert(ajustes).values({ clave: CLAVE, valor }).onConflictDoUpdate({ target: ajustes.clave, set: { valor } });
}

/** Subtipos de usados: los guardados más los que ya usa algún estado o tarifa, con cuántos los usan. */
export async function listarSubtipos(ej: Ejecutor): Promise<SubtipoVo[]> {
  const guardados = await leerGuardados(ej);
  const porEstado = await ej
    .select({ n: estadoVehiculo.subtipoVo, c: sql<number>`count(*)::int` })
    .from(estadoVehiculo)
    .where(and(isNull(estadoVehiculo.eliminadoEn), eq(estadoVehiculo.clase, "VO")))
    .groupBy(estadoVehiculo.subtipoVo);
  const porTarifa = await ej.select({ n: commissionUsedRates.subtipo, c: sql<number>`count(*)::int` }).from(commissionUsedRates).groupBy(commissionUsedRates.subtipo);
  const nombres = new Set<string>(guardados);
  for (const f of porEstado) if (f.n) nombres.add(f.n);
  for (const f of porTarifa) nombres.add(f.n);
  return [...nombres].map((nombre) => ({
    nombre,
    estados: porEstado.find((f) => f.n === nombre)?.c ?? 0,
    tarifas: porTarifa.filter((f) => f.n === nombre).reduce((s, f) => s + f.c, 0),
  }));
}

export async function crearSubtipo(ej: Ejecutor, nombre: string): Promise<void> {
  const v = validar(nombre);
  const actuales = await listarSubtipos(ej);
  if (actuales.some((s) => s.nombre === v)) throw new HttpError(409, `Ya existe el subtipo ${v}.`);
  await guardar(ej, [...actuales.map((s) => s.nombre), v]);
}

/** Cambia el nombre en todas partes: estados del vehículo y tarifas de los planes. */
export async function renombrarSubtipo(ej: Ejecutor, de: string, a: string): Promise<void> {
  const nuevo = validar(a);
  const actuales = await listarSubtipos(ej);
  if (!actuales.some((s) => s.nombre === de)) throw new HttpError(404, "Ese subtipo no existe.");
  if (nuevo !== de && actuales.some((s) => s.nombre === nuevo)) throw new HttpError(409, `Ya existe el subtipo ${nuevo}.`);
  await ej.update(estadoVehiculo).set({ subtipoVo: nuevo }).where(eq(estadoVehiculo.subtipoVo, de));
  await ej.update(commissionUsedRates).set({ subtipo: nuevo }).where(eq(commissionUsedRates.subtipo, de));
  await guardar(ej, actuales.map((s) => (s.nombre === de ? nuevo : s.nombre)));
}

export async function eliminarSubtipo(ej: Ejecutor, nombre: string): Promise<void> {
  const actuales = await listarSubtipos(ej);
  const s = actuales.find((x) => x.nombre === nombre);
  if (!s) throw new HttpError(404, "Ese subtipo no existe.");
  if (s.estados > 0) throw new HttpError(409, `No se puede borrar: lo usan ${s.estados} estado(s) del vehículo. Cámbialos de subtipo antes.`);
  if (s.tarifas > 0) throw new HttpError(409, `No se puede borrar: tiene ${s.tarifas} tarifa(s) en planes de comisiones.`);
  await guardar(ej, actuales.filter((x) => x.nombre !== nombre).map((x) => x.nombre));
}
