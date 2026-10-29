import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { apuntesExpediente, apuntesPredefinidos, expedientes } from "@/db/schema";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import { estadoPorReglas } from "@/lib/reglas-semaforo";
import { esAnulado } from "@/lib/anulados";
import { evaluarAlertas } from "./alertas";
import { hoyIso } from "./comun";
import { aDto, relacionesExpediente } from "./expedientes";

/**
 * Pasa los semáforos de los expedientes al estado que mandan sus reglas (si algún semáforo tiene reglas activas).
 * Con `idPredefinido` solo revisa ese semáforo; con `simular` no cambia nada y solo cuenta. Devuelve cuántos semáforos cambian.
 * Sin `ids` revisa todos los expedientes. Con `alCrear` (expedientes recién creados) también cuentan las reglas «solo al crear», que deciden el estado con el que empiezan.
 */
async function aplicarReglas(ej: Ejecutor, ids: number[] | undefined, opciones: { idPredefinido?: number; simular?: boolean; alCrear?: boolean }): Promise<number> {
  if (ids && ids.length === 0) return 0;
  const predefinidos = (await ej.select().from(apuntesPredefinidos).where(opciones.idPredefinido ? eq(apuntesPredefinidos.id, opciones.idPredefinido) : undefined)).filter((p) => p.semaforo && p.reglasEstado.some((r) => r.activa));
  if (predefinidos.length === 0) return 0;
  const filas = await ej.query.expedientes.findMany({ where: and(isNull(expedientes.eliminadoEn), ids ? inArray(expedientes.idExpediente, ids) : undefined), with: relacionesExpediente });
  if (filas.length === 0) return 0;
  const apuntes = await ej.select().from(apuntesExpediente).where(and(inArray(apuntesExpediente.idExpediente, filas.map((f) => f.idExpediente)), inArray(apuntesExpediente.idPredefinido, predefinidos.map((p) => p.id))));
  const dePorExpediente = new Map<number, typeof apuntes>();
  for (const a of apuntes) dePorExpediente.set(a.idExpediente, [...(dePorExpediente.get(a.idExpediente) ?? []), a]);
  const hoy = hoyIso();
  let cambiados = 0;
  for (const f of filas) {
    const propios = dePorExpediente.get(f.idExpediente) ?? [];
    // Un expediente anulado en la intranet no cambia de estado con las reglas
    if (propios.length === 0 || esAnulado(f.estadoIntranet)) continue;
    // La condición «Apunte» mira los títulos de los apuntes del expediente
    const dto = { ...aDto(f), apuntes: propios.map((a) => ({ id: a.id, id_predefinido: a.idPredefinido, titulo: a.titulo, etiqueta: a.etiqueta, color: a.color, mostrar_etiqueta: a.mostrarEtiqueta, lado: "derecha" as const, estilo: "relleno" as const, colorear_emoticonos: true, comentario: a.comentario, estado_semaforo: a.estadoSemaforo, estados: null })) };
    for (const p of predefinidos) {
      const a = propios.find((x) => x.idPredefinido === p.id);
      if (!a) continue;
      const actual = a.estadoSemaforo ?? 0;
      const nuevo = estadoPorReglas(dto, p.reglasEstado, actual, p.semaforoEstados.length, hoy, opciones.alCrear === true);
      if (nuevo === null || nuevo === actual) continue;
      cambiados++;
      if (!opciones.simular) await ej.update(apuntesExpediente).set({ estadoSemaforo: nuevo, color: p.semaforoEstados[nuevo].color }).where(eq(apuntesExpediente.id, a.id));
    }
  }
  return cambiados;
}

/** Aplica las reglas del semáforo y, después, revisa las alertas de esos expedientes (el semáforo puede haber cambiado). */
export async function aplicarReglasSemaforo(ej: Ejecutor, ids?: number[], opciones: { idPredefinido?: number; simular?: boolean; alCrear?: boolean } = {}): Promise<number> {
  const cambiados = await aplicarReglas(ej, ids, opciones);
  if (ids && !opciones.simular) await evaluarAlertas(ej, ids);
  return cambiados;
}

/** Solo el administrador: revisa (o solo cuenta, con `simular`) todos los expedientes con las reglas de un semáforo. */
export async function revisarReglasDe(ej: Ejecutor, u: UsuarioActual, idPredefinido: number, simular: boolean): Promise<number> {
  if (!esAdministrador(u.rol)) throw new HttpError(403, "Solo el administrador puede cambiar los apuntes predefinidos");
  return aplicarReglas(ej, undefined, { idPredefinido, simular });
}
