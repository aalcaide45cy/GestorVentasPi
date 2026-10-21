import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { ajustes } from "@/db/schema";

/** Objetivo (en centésimas de punto) con el que entra un vendedor nuevo en un plan: 13 puntos hasta que se cambie. */
export const OBJETIVO_DEFECTO_INICIAL = 1300;
const CLAVE = "plan_objetivo_defecto";

export const esquemaObjetivoDefecto = z.object({ objetivo: z.number().int().min(0).max(100000) });

export async function leerObjetivoDefecto(ej: Ejecutor): Promise<number> {
  const [f] = await ej.select().from(ajustes).where(eq(ajustes.clave, CLAVE));
  const n = f ? Number(f.valor) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : OBJETIVO_DEFECTO_INICIAL;
}

export async function guardarObjetivoDefecto(ej: Ejecutor, entrada: unknown): Promise<number> {
  const { objetivo } = esquemaObjetivoDefecto.parse(entrada);
  await ej.insert(ajustes).values({ clave: CLAVE, valor: String(objetivo) }).onConflictDoUpdate({ target: ajustes.clave, set: { valor: String(objetivo) } });
  return objetivo;
}
