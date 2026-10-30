import { z } from "zod";

/** Calendario: notas y eventos de cada persona, con repetición opcional y recordatorios que salen como alertas. */

export const REPETICIONES = [
  { id: "ninguna", etiqueta: "No se repite" },
  { id: "diaria", etiqueta: "Cada día" },
  { id: "semanal", etiqueta: "Cada semana" },
  { id: "mensual", etiqueta: "Cada mes" },
  { id: "anual", etiqueta: "Cada año" },
] as const;
export type Repeticion = (typeof REPETICIONES)[number]["id"];

/** Los recordatorios que se pueden pedir: minutos antes del evento (0 = a la hora). */
export const RECORDATORIOS = [
  { min: 0, etiqueta: "A la hora" },
  { min: 5, etiqueta: "5 min antes" },
  { min: 15, etiqueta: "15 min antes" },
  { min: 30, etiqueta: "30 min antes" },
  { min: 60, etiqueta: "1 hora antes" },
  { min: 120, etiqueta: "2 horas antes" },
  { min: 1440, etiqueta: "1 día antes" },
  { min: 2880, etiqueta: "2 días antes" },
  { min: 10080, etiqueta: "1 semana antes" },
] as const;

/** Hora a la que cuenta un evento de todo el día para los recordatorios. */
export const HORA_TODO_EL_DIA = "09:00";

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida");
export const esquemaEvento = z.object({
  titulo: z.string().trim().min(1, "Falta el título").max(120),
  notas: z.string().max(4000).default(""),
  fecha: fechaIso,
  /** Sin hora = todo el día. */
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida").nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3b82f6"),
  id_expediente: z.number().int().positive().nullish(),
  compartido: z.boolean().default(false),
  repeticion: z.enum(["ninguna", "diaria", "semanal", "mensual", "anual"]).default("ninguna"),
  repetir_hasta: fechaIso.nullish(),
  recordatorios: z.array(z.number().int().min(0).max(10080)).max(9).default([]),
  hecho: z.boolean().default(false),
});
export type EntradaEvento = z.infer<typeof esquemaEvento>;

export interface EventoDto {
  id: number;
  id_usuario: number;
  /** El nombre de quien lo creó (para las notas compartidas de otros). */
  autor: string | null;
  mio: boolean;
  titulo: string;
  notas: string;
  fecha: string;
  hora: string | null;
  color: string;
  id_expediente: number | null;
  compartido: boolean;
  repeticion: Repeticion;
  repetir_hasta: string | null;
  recordatorios: number[];
  hecho: boolean;
}

/** Una ocurrencia de un evento en un día concreto del rango pedido. */
export interface OcurrenciaDto extends EventoDto {
  /** El día de esta ocurrencia (en un evento que se repite, distinto del de `fecha`). */
  dia: string;
}

/** Fecha del expediente que se ve en el calendario (la capa opcional de fechas de expedientes). */
export interface FechaExpedienteDto {
  dia: string;
  tipo: "entrega" | "matriculacion" | "rci" | "afectacion";
  id_expediente: number;
  cliente: string | null;
  matricula: string | null;
}

/** Una alerta mía que se ve en el calendario: las pendientes en el día de hoy y las pospuestas en el día y la hora en que vuelven a saltar. */
export interface AlertaCalendarioDto {
  id: number;
  dia: string;
  hora: string | null;
  estado: "pendiente" | "pospuesta";
  mensaje: string;
  id_expediente: number | null;
}

/* ---------- Fechas (como texto AAAA-MM-DD, sin husos horarios) ---------- */

const dias = (iso: string): number => {
  const [a, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / 86_400_000);
};
const aIso = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);
const diasDelMes = (a: number, m: number): number => new Date(Date.UTC(a, m, 0)).getUTCDate();

export const sumarDias = (iso: string, n: number): string => aIso(dias(iso) + n);

/** ¿Cae el evento en este día? Contempla la repetición (mensual y anual se ajustan al último día si el mes no llega: el 31 pasa al 30, el 29 de febrero al 28). */
export function ocurreEn(ev: Pick<EventoDto, "fecha" | "repeticion" | "repetir_hasta">, dia: string): boolean {
  if (dia < ev.fecha) return false;
  if (ev.repeticion === "ninguna") return dia === ev.fecha;
  if (ev.repetir_hasta && dia > ev.repetir_hasta) return false;
  const [a, m, d] = dia.split("-").map(Number);
  const [, m0, d0] = ev.fecha.split("-").map(Number);
  switch (ev.repeticion) {
    case "diaria":
      return true;
    case "semanal":
      return (dias(dia) - dias(ev.fecha)) % 7 === 0;
    case "mensual":
      return d === Math.min(d0, diasDelMes(a, m));
    case "anual":
      return m === m0 && d === Math.min(d0, diasDelMes(a, m));
    default:
      return false;
  }
}

/** Los días (AAAA-MM-DD) del rango `[desde, hasta]` en los que cae el evento. */
export function diasDeOcurrencia(ev: Pick<EventoDto, "fecha" | "repeticion" | "repetir_hasta">, desde: string, hasta: string): string[] {
  const res: string[] = [];
  const fin = dias(hasta);
  for (let n = Math.max(dias(desde), dias(ev.fecha)); n <= fin; n++) {
    const d = aIso(n);
    if (ocurreEn(ev, d)) res.push(d);
  }
  return res;
}

/** El instante en que empieza una ocurrencia (en la hora local de este equipo). Un evento de todo el día cuenta a las 9:00. */
export function momentoDe(dia: string, hora: string | null | undefined): Date {
  const [a, m, d] = dia.split("-").map(Number);
  const [h, mi] = (hora ?? HORA_TODO_EL_DIA).split(":").map(Number);
  return new Date(a, m - 1, d, h, mi, 0, 0);
}
