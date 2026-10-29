import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { alertas, alertasReglas, apuntesExpediente, apuntesPredefinidos, clientes, expedientes, usuarios } from "@/db/schema";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import { esAnulado } from "@/lib/anulados";
import { cumpleAlerta, textoDeAlerta, type AlertaDto, type EntradaReglaAlerta, type ReglaAlertaDto } from "@/lib/alertas";
import { hoyIso } from "./comun";
import { aDto, relacionesExpediente } from "./expedientes";

const soloAdministrador = (u: UsuarioActual): void => {
  if (!esAdministrador(u.rol)) throw new HttpError(403, "Solo el administrador puede cambiar las reglas de alerta");
};

const aRegla = (f: typeof alertasReglas.$inferSelect): ReglaAlertaDto => ({ id: f.id, nombre: f.nombre, activa: f.activa, mensaje: f.mensaje, avisar_admin: f.avisarAdmin, definicion: f.definicion });

/* ------------------------------ Reglas ------------------------------ */

export async function listarReglasAlerta(ej: Ejecutor): Promise<ReglaAlertaDto[]> {
  return (await ej.select().from(alertasReglas).orderBy(asc(alertasReglas.orden), asc(alertasReglas.id))).map(aRegla);
}

export async function crearReglaAlerta(ej: Ejecutor, u: UsuarioActual, e: EntradaReglaAlerta): Promise<ReglaAlertaDto> {
  soloAdministrador(u);
  const [{ max }] = await ej.select({ max: sql<number>`coalesce(max(${alertasReglas.orden}), 0)::int` }).from(alertasReglas);
  const [f] = await ej.insert(alertasReglas).values({ nombre: e.nombre, activa: e.activa, mensaje: e.mensaje, avisarAdmin: e.avisar_admin, definicion: e.definicion, orden: max + 1 }).returning();
  return aRegla(f);
}

export async function actualizarReglaAlerta(ej: Ejecutor, u: UsuarioActual, id: number, e: EntradaReglaAlerta): Promise<ReglaAlertaDto> {
  soloAdministrador(u);
  const [f] = await ej.update(alertasReglas).set({ nombre: e.nombre, activa: e.activa, mensaje: e.mensaje, avisarAdmin: e.avisar_admin, definicion: e.definicion }).where(eq(alertasReglas.id, id)).returning();
  if (!f) throw new HttpError(404, "Regla de alerta no encontrada");
  return aRegla(f);
}

export async function eliminarReglaAlerta(ej: Ejecutor, u: UsuarioActual, id: number): Promise<void> {
  soloAdministrador(u);
  await ej.delete(alertasReglas).where(eq(alertasReglas.id, id));
}

/* ------------------------------ Motor ------------------------------ */

/**
 * Crea, reabre o resuelve las alertas de estos expedientes según las reglas activas. Una alerta salta cuando el expediente PASA a cumplir la condición
 * (no se repite mientras siga cumpliéndola ni después de marcarla «hecha») y se resuelve sola cuando deja de cumplirla. Devuelve las alertas nuevas o reabiertas.
 */
export async function evaluarAlertas(ej: Ejecutor, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const reglas = (await ej.select().from(alertasReglas).where(eq(alertasReglas.activa, true))).filter((r) => r.definicion.condiciones.length > 0 || (r.definicion.grupos ?? []).some((g) => g.condiciones.length > 0));
  // Las reglas apagadas o borradas dejan de tener alertas abiertas
  const abiertasHuerfanas = await ej.select({ id: alertas.id }).from(alertas).where(and(inArray(alertas.idExpediente, ids), ne(alertas.estado, "resuelta"), reglas.length > 0 ? sql`${alertas.idRegla} not in (${sql.join(reglas.map((r) => sql`${r.id}`), sql`, `)})` : undefined));
  if (abiertasHuerfanas.length > 0) await ej.update(alertas).set({ estado: "resuelta", motivo: "automatica", resueltaEn: new Date(), pospuestaHasta: null }).where(inArray(alertas.id, abiertasHuerfanas.map((a) => a.id)));
  if (reglas.length === 0) return 0;

  const filas = await ej.query.expedientes.findMany({ where: and(isNull(expedientes.eliminadoEn), inArray(expedientes.idExpediente, ids)), with: relacionesExpediente });
  if (filas.length === 0) return 0;
  const idsFilas = filas.map((f) => f.idExpediente);
  // Los apuntes con sus estados de semáforo, para las condiciones «Apunte» y «Estado de un semáforo»
  const apuntes = await ej.select({ a: apuntesExpediente, p: apuntesPredefinidos }).from(apuntesExpediente).leftJoin(apuntesPredefinidos, eq(apuntesExpediente.idPredefinido, apuntesPredefinidos.id)).where(inArray(apuntesExpediente.idExpediente, idsFilas));
  const apuntesDe = new Map<number, NonNullable<ReturnType<typeof aDto>["apuntes"]>>();
  for (const { a, p } of apuntes) {
    const estados = p?.semaforo ? p.semaforoEstados : null;
    const l = apuntesDe.get(a.idExpediente) ?? [];
    l.push({ id: a.id, id_predefinido: a.idPredefinido, titulo: a.titulo, etiqueta: a.etiqueta, color: a.color, mostrar_etiqueta: a.mostrarEtiqueta, lado: "derecha", estilo: "relleno", colorear_emoticonos: true, comentario: a.comentario, estado_semaforo: estados ? (a.estadoSemaforo ?? 0) : null, estados });
    apuntesDe.set(a.idExpediente, l);
  }
  const admins = (await ej.select({ id: usuarios.idUsuario, rol: usuarios.rol, bloqueado: usuarios.bloqueado }).from(usuarios)).filter((x) => !x.bloqueado && x.rol !== null && esAdministrador(x.rol as never)).map((x) => x.id);
  const existentes = await ej.select().from(alertas).where(and(inArray(alertas.idExpediente, idsFilas), inArray(alertas.idRegla, reglas.map((r) => r.id))));
  const hoy = hoyIso();
  let nuevas = 0;
  for (const f of filas) {
    const dto = { ...aDto(f), apuntes: apuntesDe.get(f.idExpediente) ?? [] };
    for (const r of reglas) {
      // Un expediente anulado en la intranet no genera alertas (y las que tuviera abiertas se resuelven)
      const cumple = !esAnulado(dto.estado_intranet) && cumpleAlerta(dto, r.definicion, hoy);
      const destinatarios = new Set<number>([f.idUsuario, ...(r.avisarAdmin ? admins : [])].filter((x): x is number => typeof x === "number"));
      const mensaje = textoDeAlerta(r.mensaje, dto);
      const propias = existentes.filter((x) => x.idRegla === r.id && x.idExpediente === f.idExpediente);
      for (const u of destinatarios) {
        const fila = propias.find((x) => x.idUsuario === u);
        if (cumple) {
          if (!fila) {
            await ej.insert(alertas).values({ idRegla: r.id, idExpediente: f.idExpediente, idUsuario: u, mensaje });
            nuevas++;
          } else if (fila.estado === "resuelta" && fila.motivo === "automatica") {
            await ej.update(alertas).set({ estado: "pendiente", mensaje, creadaEn: new Date(), resueltaEn: null, motivo: null, pospuestaHasta: null }).where(eq(alertas.id, fila.id));
            nuevas++;
          }
        } else if (fila && !(fila.estado === "resuelta" && fila.motivo === "automatica")) {
          await ej.update(alertas).set({ estado: "resuelta", motivo: "automatica", resueltaEn: new Date(), pospuestaHasta: null }).where(eq(alertas.id, fila.id));
        }
      }
      // Quien ya no es destinatario (cambió el vendedor): lo abierto se resuelve
      for (const fila of propias) if (!destinatarios.has(fila.idUsuario) && fila.estado !== "resuelta") await ej.update(alertas).set({ estado: "resuelta", motivo: "automatica", resueltaEn: new Date(), pospuestaHasta: null }).where(eq(alertas.id, fila.id));
    }
  }
  return nuevas;
}

/** Revisa todos los expedientes con las reglas (por ejemplo, al crear o cambiar una regla). Devuelve las alertas nuevas. */
export async function reevaluarTodas(ej: Ejecutor, u: UsuarioActual): Promise<number> {
  soloAdministrador(u);
  const ids = (await ej.select({ id: expedientes.idExpediente }).from(expedientes).where(isNull(expedientes.eliminadoEn))).map((x) => x.id);
  let n = 0;
  for (let i = 0; i < ids.length; i += 200) n += await evaluarAlertas(ej, ids.slice(i, i + 200));
  return n;
}

/* ------------------------------ Mis alertas ------------------------------ */

const ESTADOS_ALERTA = ["pendiente", "pospuesta", "resuelta"] as const;

const aAlerta = (f: { a: typeof alertas.$inferSelect; regla: string; cliente: string | null; matricula: string | null }): AlertaDto => ({
  id: f.a.id,
  id_expediente: f.a.idExpediente,
  mensaje: f.a.mensaje,
  estado: (ESTADOS_ALERTA as readonly string[]).includes(f.a.estado) ? (f.a.estado as AlertaDto["estado"]) : "pendiente",
  pospuesta_hasta: f.a.pospuestaHasta?.toISOString() ?? null,
  creada_en: f.a.creadaEn.toISOString(),
  resuelta_en: f.a.resueltaEn?.toISOString() ?? null,
  motivo: f.a.motivo === "hecho" || f.a.motivo === "automatica" ? f.a.motivo : null,
  regla: f.regla,
  cliente: f.cliente,
  matricula: f.matricula,
});

/** Las alertas de una persona: las pospuestas cuya hora ha llegado vuelven a ser pendientes. Las resueltas, solo las de los últimos 60 días. */
export async function misAlertas(ej: Ejecutor, u: UsuarioActual): Promise<{ pendientes: AlertaDto[]; pospuestas: AlertaDto[]; resueltas: AlertaDto[] }> {
  await ej.update(alertas).set({ estado: "pendiente", pospuestaHasta: null }).where(and(eq(alertas.idUsuario, u.idUsuario), eq(alertas.estado, "pospuesta"), lte(alertas.pospuestaHasta, new Date())));
  const hace60 = new Date(Date.now() - 60 * 86_400_000);
  const filas = await ej
    .select({ a: alertas, regla: alertasReglas.nombre, cliente: clientes.nombre, matricula: expedientes.matricula })
    .from(alertas)
    .innerJoin(alertasReglas, eq(alertas.idRegla, alertasReglas.id))
    .innerJoin(expedientes, eq(alertas.idExpediente, expedientes.idExpediente))
    .leftJoin(clientes, eq(expedientes.idCliente, clientes.id))
    .where(and(eq(alertas.idUsuario, u.idUsuario), isNull(expedientes.eliminadoEn), sql`(${alertas.estado} <> 'resuelta' or ${alertas.resueltaEn} >= ${hace60})`))
    .orderBy(desc(alertas.creadaEn), desc(alertas.id))
    .limit(300);
  const todas = filas.map(aAlerta);
  return { pendientes: todas.filter((a) => a.estado === "pendiente"), pospuestas: todas.filter((a) => a.estado === "pospuesta"), resueltas: todas.filter((a) => a.estado === "resuelta").slice(0, 100) };
}

async function propia(ej: Ejecutor, u: UsuarioActual, id: number) {
  const [a] = await ej.select().from(alertas).where(eq(alertas.id, id));
  if (!a || (a.idUsuario !== u.idUsuario && !esAdministrador(u.rol))) throw new HttpError(404, "Alerta no encontrada");
  return a;
}

/** La persona da la alerta por atendida («Hecho»). No vuelve a saltar salvo que la condición deje de cumplirse y vuelva a cumplirse. */
export async function resolverAlerta(ej: Ejecutor, u: UsuarioActual, id: number): Promise<void> {
  const a = await propia(ej, u, id);
  await ej.update(alertas).set({ estado: "resuelta", motivo: "hecho", resueltaEn: new Date(), pospuestaHasta: null }).where(eq(alertas.id, a.id));
}

/** Pospone la alerta hasta `hasta` (en el futuro, como mucho 30 días). */
export async function posponerAlerta(ej: Ejecutor, u: UsuarioActual, id: number, hasta: Date): Promise<void> {
  const a = await propia(ej, u, id);
  if (a.estado === "resuelta") throw new HttpError(409, "Esta alerta ya está resuelta");
  const ahora = Date.now();
  if (!(hasta.getTime() > ahora) || hasta.getTime() > ahora + 30 * 86_400_000) throw new HttpError(400, "Fecha de aplazamiento no válida");
  await ej.update(alertas).set({ estado: "pospuesta", pospuestaHasta: hasta }).where(eq(alertas.id, a.id));
}

/** Vuelve a abrir una alerta resuelta a mano (por si se marcó «Hecho» sin querer). */
export async function reabrirAlerta(ej: Ejecutor, u: UsuarioActual, id: number): Promise<void> {
  const a = await propia(ej, u, id);
  await ej.update(alertas).set({ estado: "pendiente", motivo: null, resueltaEn: null, pospuestaHasta: null }).where(eq(alertas.id, a.id));
}

/** Elimina una alerta ya resuelta de mi registro (si la condición sigue cumpliéndose, volverá a saltar la próxima vez que se guarde el expediente). */
export async function eliminarAlerta(ej: Ejecutor, u: UsuarioActual, id: number): Promise<void> {
  const a = await propia(ej, u, id);
  if (a.estado !== "resuelta") throw new HttpError(409, "Solo se pueden eliminar las alertas resueltas");
  await ej.delete(alertas).where(eq(alertas.id, a.id));
}

/** Elimina todas mis alertas resueltas. Devuelve cuántas. */
export async function vaciarResueltas(ej: Ejecutor, u: UsuarioActual): Promise<number> {
  const r = await ej.delete(alertas).where(and(eq(alertas.idUsuario, u.idUsuario), eq(alertas.estado, "resuelta"))).returning({ id: alertas.id });
  return r.length;
}
