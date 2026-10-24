import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { preferenciasUsuario } from "@/db/schema";
import { MAX_PREFERENCIAS_POR_PETICION, MAX_VALOR_PREFERENCIA, esPreferenciaSincronizada } from "@/lib/preferencias-sincronizadas";

/** Cuerpo de `PUT /api/preferencias`: claves y valores (texto) que se guardan para el usuario de la sesión. */
export const esquemaGuardarPreferencias = z.object({
  valores: z.record(z.string(), z.string().max(MAX_VALOR_PREFERENCIA)).refine((v) => Object.keys(v).length <= MAX_PREFERENCIAS_POR_PETICION, "Demasiadas preferencias de golpe"),
});

/** Todas las preferencias guardadas de un usuario. */
export async function leerPreferencias(ej: Ejecutor, idUsuario: number): Promise<Record<string, string>> {
  const filas = await ej.select({ clave: preferenciasUsuario.clave, valor: preferenciasUsuario.valor }).from(preferenciasUsuario).where(eq(preferenciasUsuario.idUsuario, idUsuario));
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
}

/** Guarda (o cambia) preferencias de un usuario. Solo las claves permitidas; devuelve cuántas se guardaron. */
export async function guardarPreferencias(ej: Ejecutor, idUsuario: number, valores: Record<string, string>): Promise<number> {
  const filas = Object.entries(valores)
    .filter(([clave]) => esPreferenciaSincronizada(clave))
    .map(([clave, valor]) => ({ idUsuario, clave, valor }));
  if (filas.length === 0) return 0;
  await ej
    .insert(preferenciasUsuario)
    .values(filas)
    .onConflictDoUpdate({ target: [preferenciasUsuario.idUsuario, preferenciasUsuario.clave], set: { valor: sql`excluded.valor`, actualizadoEn: sql`now()` } });
  return filas.length;
}
