import { z } from "zod";
import type { ExpedienteDto } from "./dto";
import { cumpleRegla, esquemaCondicion, esquemaGrupo, COMBINACIONES } from "./reglas-color";

/**
 * Reglas que cambian solas el estado de un semáforo (como el del Seguro) cuando un expediente cumple unas condiciones (las mismas que las reglas de color).
 * Se revisan cada vez que se guarda un expediente; gana la primera regla activa, por orden, que se cumpla.
 */
export const esquemaReglaEstado = z.object({
  id: z.string().min(1).max(60),
  nombre: z.string().max(80),
  activa: z.boolean(),
  /** Estado al que pasa el semáforo (posición en los estados del predefinido). */
  estado: z.number().int().min(0).max(7),
  /** Solo actúa si el semáforo está ahora en alguno de estos estados; vacío = en cualquiera. */
  desde: z.array(z.number().int().min(0).max(7)).max(8).default([]),
  combinar: z.enum(COMBINACIONES),
  condiciones: z.array(esquemaCondicion).max(12),
  grupos: z.array(esquemaGrupo).max(10).optional(),
  unir: z.enum(["y", "o"]).optional(),
});
export type ReglaEstado = z.infer<typeof esquemaReglaEstado>;
export const esquemaReglasEstado = z.array(esquemaReglaEstado).max(30);

export function reglaEstadoNueva(estado: number): ReglaEstado {
  return { id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nombre: "Nueva regla", activa: true, estado, desde: [], combinar: "todas", condiciones: [{ campo: "fecha_facturacion", operador: "tiene", valor: "" }] };
}

/** El estado al que debe pasar el semáforo según las reglas (primera activa que se cumple), o `null` si ninguna manda cambiar nada. */
export function estadoPorReglas(e: ExpedienteDto, reglas: ReglaEstado[], estadoActual: number, numEstados: number, hoy: string): number | null {
  for (const r of reglas) {
    if (!r.activa || r.estado >= numEstados) continue;
    if (r.desde.length > 0 && !r.desde.includes(estadoActual)) continue;
    if (cumpleRegla(e, r, hoy)) return r.estado;
  }
  return null;
}
