import { z } from "zod";
import { esquemaPlanBase, esquemaRegla } from "@/lib/servicios/planes";

/** Esquema Zod de un fragmento de plan (solo servidor: la pantalla usa `fragmentos.ts`, que no importa nada del servidor). */

const nombre = z.string().trim().min(1).max(200);
const marcaNull = z.string().trim().min(1).max(100).nullable().default(null);
const sh = esquemaPlanBase.shape;
const reglaPorNombre = esquemaRegla.omit({ idMarca: true, idModelo: true }).extend({ marca: marcaNull, modelo: marcaNull });

export const esquemaFragmento = z.object({
  resumen: z.object({ tramoMin: sh.tramoMin, tramoMax: sh.tramoMax, puntosPorPedido: sh.puntosPorPedido }).optional(),
  vendedores: z.array(z.object({ nombre, objetivoBase: z.number().int().min(0), arrastre: z.number().int() })).max(500).optional(),
  tasas: z.array(z.object({ marca: nombre, tipoTasa: z.enum(["porcentaje", "unidades"]), objetivo: z.number().int().min(0), puntosDefecto: z.number().int().min(0) })).max(500).optional(),
  promociones: z.array(z.object({ nombre, puntosEspeciales: z.number().int().min(0), minimoUnidades: z.number().int().min(1), puntosSiNoCumple: z.number().int().min(0) })).max(500).optional(),
  puntosModelo: z.array(z.object({ marca: nombre, modelo: nombre, puntos: z.number().int().min(0) })).max(5000).optional(),
  tarifasVN: z.array(z.object({ marca: nombre, modelo: nombre, tasaCumplida: z.boolean(), importes: z.record(z.string().regex(/^-?\d+$/), z.number().int()), activo: z.boolean(), orden: z.number().int() })).max(5000).optional(),
  opcionesUsados: z.object({ voPuntosModo: sh.voPuntosModo, voPuntos: sh.voPuntos }).optional(),
  usados: sh.usados.unwrap().max(500).optional(),
  patrones: sh.patrones.unwrap().max(500).optional(),
  financiacion: z.array(z.object({ marca: nombre, tipoFinanciacion: z.enum(["CONTADO", "CREDITO", "PREFERENCE", "RENTING"]), aplicaA: z.enum(["VN", "VO", "TODOS"]).default("VN"), importe: z.number().int() })).max(2000).optional(),
  preference: z.array(z.object({ nombre: z.string().max(200).nullable().default(null), marca: marcaNull, modelo: marcaNull, tipoFinanciacion: z.enum(["CONTADO", "CREDITO", "PREFERENCE", "RENTING"]).nullable().default(null), aplicaA: z.enum(["VN", "VO", "TODOS"]).default("VN"), importe: z.number().int(), activa: z.boolean().default(true) })).max(2000).optional(),
  reglas: z.array(reglaPorNombre).max(2000).optional(),
  bonus: z.array(reglaPorNombre).max(2000).optional(),
  penalizacion: z.object({ importe: sh.penalizacionImporte, titulo: sh.penalizacionTitulo, descripcion: sh.penalizacionDescripcion }).optional(),
  notas: z.object({ texto: z.string().max(5000).nullable() }).optional(),
});
export type Fragmento = z.infer<typeof esquemaFragmento>;
