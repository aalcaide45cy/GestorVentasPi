import { z } from "zod";
import type { ExpedienteDto } from "./dto";
import { COMBINACIONES, cumpleRegla, esquemaCondicion, esquemaGrupo } from "./reglas-color";

/**
 * Alertas: reglas que avisan cuando un expediente pasa a cumplir unas condiciones (las mismas que las reglas de color: fechas, estados, matrícula,
 * estado de un semáforo…). Se comprueban cada vez que se guarda un expediente, se importa un Excel o se aplica un pago de RCI.
 */
export const esquemaDefinicionAlerta = z.object({
  combinar: z.enum(COMBINACIONES),
  condiciones: z.array(esquemaCondicion).max(12),
  grupos: z.array(esquemaGrupo).max(10).optional(),
  unir: z.enum(["y", "o"]).optional(),
});
export type DefinicionAlerta = z.infer<typeof esquemaDefinicionAlerta>;

export const esquemaReglaAlerta = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(80),
  activa: z.boolean().default(true),
  mensaje: z.string().trim().min(1, "Falta el mensaje del aviso").max(500),
  avisar_admin: z.boolean().default(false),
  definicion: esquemaDefinicionAlerta,
});
export type EntradaReglaAlerta = z.infer<typeof esquemaReglaAlerta>;

export const definicionNueva = (): DefinicionAlerta => ({ combinar: "todas", condiciones: [{ campo: "fecha_rci", operador: "tiene", valor: "" }] });

/** Si el expediente cumple las condiciones de la alerta (una alerta sin condiciones no salta nunca). */
export const cumpleAlerta = (e: ExpedienteDto, d: DefinicionAlerta, hoy: string): boolean => cumpleRegla(e, d, hoy);

/** El texto del aviso con los datos del expediente: {cliente}, {matricula}, {vendedor} y {expediente}. */
export function textoDeAlerta(plantilla: string, e: Pick<ExpedienteDto, "id_expediente" | "matricula" | "cliente" | "usuario">): string {
  return plantilla
    .replaceAll("{cliente}", e.cliente?.nombre ?? "(sin cliente)")
    .replaceAll("{matricula}", e.matricula ?? "(sin matrícula)")
    .replaceAll("{vendedor}", e.usuario?.nombre ?? "")
    .replaceAll("{expediente}", `#EXP-${String(e.id_expediente).padStart(4, "0")}`);
}

export interface AlertaDto {
  id: number;
  /** Nulo en un aviso del calendario sin expediente. */
  id_expediente: number | null;
  /** La nota del calendario que lo generó (si viene del calendario). */
  id_evento: number | null;
  mensaje: string;
  estado: "pendiente" | "pospuesta" | "resuelta";
  /** Si está pospuesta, hasta cuándo (ISO). */
  pospuesta_hasta: string | null;
  creada_en: string;
  resuelta_en: string | null;
  motivo: "hecho" | "automatica" | null;
  /** Nombre de la regla que la generó. */
  regla: string;
  /** Cliente y matrícula del expediente, para reconocerlo de un vistazo. */
  cliente: string | null;
  matricula: string | null;
}

export interface ReglaAlertaDto {
  id: number;
  nombre: string;
  activa: boolean;
  mensaje: string;
  avisar_admin: boolean;
  definicion: DefinicionAlerta;
}
