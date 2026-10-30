import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { alertas, calendarioAvisos, calendarioEventos, clientes, expedientes, usuarios } from "@/db/schema";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import { diasDeOcurrencia, momentoDe, sumarDias, type AlertaCalendarioDto, type EntradaEvento, type EventoDto, type FechaExpedienteDto, type OcurrenciaDto, type Repeticion } from "@/lib/calendario";
import { hoyIso } from "./comun";

const REPETICIONES_VALIDAS = ["ninguna", "diaria", "semanal", "mensual", "anual"];

const aEvento = (f: typeof calendarioEventos.$inferSelect, autor: string | null, idLector: number): EventoDto => ({
  id: f.id,
  id_usuario: f.idUsuario,
  autor,
  mio: f.idUsuario === idLector,
  titulo: f.titulo,
  notas: f.notas,
  fecha: f.fecha,
  hora: f.hora,
  color: f.color,
  id_expediente: f.idExpediente,
  compartido: f.compartido,
  repeticion: (REPETICIONES_VALIDAS.includes(f.repeticion) ? f.repeticion : "ninguna") as Repeticion,
  repetir_hasta: f.repetirHasta,
  recordatorios: [...f.recordatorios].sort((a, b) => a - b),
  hecho: f.hecho,
});

/** Lo que se ve en el calendario entre dos días (incluidos): mis notas y las que otros han compartido, repetidas donde toque; y, si se pide, las fechas de mis expedientes. */
export async function leerCalendario(ej: Ejecutor, u: UsuarioActual, desde: string, hasta: string, conExpedientes: boolean, conAlertas = false): Promise<{ eventos: OcurrenciaDto[]; fechasExpedientes: FechaExpedienteDto[]; alertas: AlertaCalendarioDto[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta < desde) throw new HttpError(400, "Rango de fechas no válido");
  const filas = await ej
    .select({ e: calendarioEventos, autor: usuarios.nombre })
    .from(calendarioEventos)
    .leftJoin(usuarios, eq(calendarioEventos.idUsuario, usuarios.idUsuario))
    .where(and(or(eq(calendarioEventos.idUsuario, u.idUsuario), eq(calendarioEventos.compartido, true)), sql`${calendarioEventos.fecha} <= ${hasta}`))
    .orderBy(asc(calendarioEventos.fecha), asc(calendarioEventos.id));
  const eventos: OcurrenciaDto[] = [];
  for (const { e, autor } of filas) {
    const ev = aEvento(e, autor, u.idUsuario);
    for (const dia of diasDeOcurrencia(ev, desde, hasta)) eventos.push({ ...ev, dia });
  }
  eventos.sort((a, b) => a.dia.localeCompare(b.dia) || (a.hora ?? "00:00").localeCompare(b.hora ?? "00:00") || a.id - b.id);

  const fechasExpedientes: FechaExpedienteDto[] = [];
  if (conExpedientes) {
    const propios = esAdministrador(u.rol) ? undefined : eq(expedientes.idUsuario, u.idUsuario);
    const campos = [
      ["entrega", expedientes.fechaEntrega],
      ["matriculacion", expedientes.fechaMatriculacion],
      ["rci", expedientes.fechaRci],
      ["afectacion", expedientes.fechaAfectacion],
    ] as const;
    const enRango = or(...campos.map(([, c]) => sql`(${c} between ${desde} and ${hasta})`));
    const lista = await ej
      .select({ id: expedientes.idExpediente, cliente: clientes.nombre, matricula: expedientes.matricula, entrega: expedientes.fechaEntrega, matriculacion: expedientes.fechaMatriculacion, rci: expedientes.fechaRci, afectacion: expedientes.fechaAfectacion })
      .from(expedientes)
      .leftJoin(clientes, eq(expedientes.idCliente, clientes.id))
      .where(and(isNull(expedientes.eliminadoEn), eq(expedientes.deshabilitado, false), propios, enRango))
      .limit(2000);
    for (const x of lista)
      for (const [tipo] of campos) {
        const dia = x[tipo];
        if (dia && dia >= desde && dia <= hasta) fechasExpedientes.push({ dia, tipo, id_expediente: x.id, cliente: x.cliente, matricula: x.matricula });
      }
    fechasExpedientes.sort((a, b) => a.dia.localeCompare(b.dia));
  }

  const alertasCal: AlertaCalendarioDto[] = [];
  if (conAlertas) {
    const hoy = hoyIso();
    const mias = await ej.select().from(alertas).where(and(eq(alertas.idUsuario, u.idUsuario), inArray(alertas.estado, ["pendiente", "pospuesta"])));
    const dosDigitos = (n: number) => String(n).padStart(2, "0");
    for (const a of mias) {
      if (a.estado === "pospuesta" && a.pospuestaHasta) {
        const d = a.pospuestaHasta;
        const dia = `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
        if (dia >= desde && dia <= hasta) alertasCal.push({ id: a.id, dia, hora: `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`, estado: "pospuesta", mensaje: a.mensaje, id_expediente: a.idExpediente });
      } else if (a.estado === "pendiente" && hoy >= desde && hoy <= hasta) alertasCal.push({ id: a.id, dia: hoy, hora: null, estado: "pendiente", mensaje: a.mensaje, id_expediente: a.idExpediente });
    }
    alertasCal.sort((x, y) => x.dia.localeCompare(y.dia) || (x.hora ?? "").localeCompare(y.hora ?? "") || x.id - y.id);
  }
  return { eventos, fechasExpedientes, alertas: alertasCal };
}

const valores = (e: EntradaEvento) => ({
  titulo: e.titulo,
  notas: e.notas,
  fecha: e.fecha,
  hora: e.hora ?? null,
  color: e.color,
  idExpediente: e.id_expediente ?? null,
  compartido: e.compartido,
  repeticion: e.repeticion,
  repetirHasta: e.repeticion === "ninguna" ? null : (e.repetir_hasta ?? null),
  recordatorios: [...new Set(e.recordatorios)].sort((a, b) => a - b),
  hecho: e.hecho,
});

async function comprobarExpediente(ej: Ejecutor, id: number | null | undefined): Promise<void> {
  if (!id) return;
  const [x] = await ej.select({ id: expedientes.idExpediente }).from(expedientes).where(and(eq(expedientes.idExpediente, id), isNull(expedientes.eliminadoEn)));
  if (!x) throw new HttpError(400, `No existe el expediente #EXP-${String(id).padStart(4, "0")}`);
}

export async function crearEvento(ej: Ejecutor, u: UsuarioActual, e: EntradaEvento): Promise<EventoDto> {
  if (e.repetir_hasta && e.repetir_hasta < e.fecha) throw new HttpError(400, "«Repetir hasta» no puede ser anterior al día del evento");
  await comprobarExpediente(ej, e.id_expediente);
  const [f] = await ej.insert(calendarioEventos).values({ idUsuario: u.idUsuario, ...valores(e) }).returning();
  return aEvento(f, u.nombre, u.idUsuario);
}

async function propio(ej: Ejecutor, u: UsuarioActual, id: number) {
  const [f] = await ej.select().from(calendarioEventos).where(eq(calendarioEventos.id, id));
  if (!f) throw new HttpError(404, "Nota no encontrada");
  if (f.idUsuario !== u.idUsuario && !esAdministrador(u.rol)) throw new HttpError(403, "Solo quien creó la nota (o el administrador) puede cambiarla");
  return f;
}

export async function actualizarEvento(ej: Ejecutor, u: UsuarioActual, id: number, e: EntradaEvento): Promise<EventoDto> {
  await propio(ej, u, id);
  if (e.repetir_hasta && e.repetir_hasta < e.fecha) throw new HttpError(400, "«Repetir hasta» no puede ser anterior al día del evento");
  await comprobarExpediente(ej, e.id_expediente);
  const [f] = await ej.update(calendarioEventos).set(valores(e)).where(eq(calendarioEventos.id, id)).returning();
  return aEvento(f, u.nombre, u.idUsuario);
}

export async function eliminarEvento(ej: Ejecutor, u: UsuarioActual, id: number): Promise<void> {
  await propio(ej, u, id);
  await ej.delete(calendarioEventos).where(eq(calendarioEventos.id, id));
}

/**
 * Crea las alertas de los recordatorios de mis notas que ya han llegado (hasta 24 horas atrás, para no perder los de cuando la aplicación estaba cerrada).
 * Cada recordatorio avisa una sola vez, aunque la alerta se elimine después. Devuelve cuántos avisos nuevos.
 */
export async function generarAvisosCalendario(ej: Ejecutor, u: UsuarioActual, ahora: Date = new Date()): Promise<number> {
  const hoy = hoyIso();
  const filas = await ej.select().from(calendarioEventos).where(and(eq(calendarioEventos.idUsuario, u.idUsuario), eq(calendarioEventos.hecho, false), sql`jsonb_array_length(${calendarioEventos.recordatorios}) > 0`, sql`${calendarioEventos.fecha} <= ${sumarDias(hoy, 8)}`));
  let nuevos = 0;
  for (const f of filas) {
    const ev = aEvento(f, u.nombre, u.idUsuario);
    for (const dia of diasDeOcurrencia(ev, sumarDias(hoy, -2), sumarDias(hoy, 8))) {
      const empieza = momentoDe(dia, ev.hora);
      for (const min of ev.recordatorios) {
        const avisarEn = new Date(empieza.getTime() - min * 60_000);
        if (avisarEn > ahora || avisarEn < new Date(ahora.getTime() - 24 * 3_600_000)) continue;
        const clave = `ev${ev.id}:${dia}:${min}`;
        const nuevo = await ej.insert(calendarioAvisos).values({ idUsuario: u.idUsuario, clave }).onConflictDoNothing().returning({ clave: calendarioAvisos.clave });
        if (nuevo.length === 0) continue;
        const cuando = dia === hoy ? "" : ` (${dia.split("-").reverse().join("/")})`;
        await ej.insert(alertas).values({ idUsuario: u.idUsuario, idEvento: ev.id, idExpediente: ev.id_expediente, mensaje: `${ev.titulo}${ev.hora ? ` · ${ev.hora}` : ""}${cuando}`.slice(0, 500) });
        nuevos++;
      }
    }
  }
  return nuevos;
}

/** Las alertas de calendario de una nota que se ha borrado o cambiado de día quedan como están; las abiertas de una nota ya hecha se resuelven. */
export async function resolverAvisosDeEventosHechos(ej: Ejecutor, u: UsuarioActual): Promise<void> {
  const hechos = await ej.select({ id: calendarioEventos.id }).from(calendarioEventos).where(and(eq(calendarioEventos.idUsuario, u.idUsuario), eq(calendarioEventos.hecho, true)));
  if (hechos.length === 0) return;
  await ej.update(alertas).set({ estado: "resuelta", motivo: "automatica", resueltaEn: new Date(), pospuestaHasta: null }).where(and(eq(alertas.idUsuario, u.idUsuario), inArray(alertas.idEvento, hechos.map((h) => h.id)), sql`${alertas.estado} <> 'resuelta'`));
}
