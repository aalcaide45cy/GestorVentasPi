import { sql } from "drizzle-orm";
import type { Db, Ejecutor } from "@/db";
import { HttpError } from "@/lib/auth/sesion";

/** Un paso del historial: todo lo que cambió una petición (un expediente editado, una importación, un plan guardado…). */
export interface PasoHistorial {
  grupo: string;
  accion: string;
  en: string;
  estado: "aplicado" | "deshecho";
  /** Filas que cambió en la base de datos. */
  filas: number;
  tablas: string[];
}

export interface EstadoHistorial {
  /** El paso que desharía «Deshacer» (el último aplicado). */
  puedeDeshacer: PasoHistorial | null;
  /** El paso que rehará «Rehacer» (el primero de los deshechos, en el orden en que se hicieron). */
  puedeRehacer: PasoHistorial | null;
  /** Los últimos pasos, del más reciente al más antiguo. */
  pasos: PasoHistorial[];
}

const DIAS_DE_HISTORIAL = 30;
const MAX_PASOS = 80;

interface FilaPaso extends Record<string, unknown> {
  grupo: string;
  accion: string;
  en: Date | string;
  estado: string;
  filas: number;
  tablas: string[];
  ultimo: number | string;
}

const aPaso = (f: FilaPaso): PasoHistorial => ({
  grupo: f.grupo,
  accion: f.accion,
  en: new Date(f.en).toISOString(),
  estado: f.estado === "deshecho" ? "deshecho" : "aplicado",
  filas: Number(f.filas),
  tablas: f.tablas,
});

/** Pasos del usuario (aplicados y deshechos), con el id de su última fila para ordenarlos. */
async function pasosDe(ej: Ejecutor, idUsuario: number, limite: number): Promise<(PasoHistorial & { ultimo: number })[]> {
  const r = await ej.execute<FilaPaso>(sql`
    select grupo::text as grupo, max(accion) as accion, min(en) as en, max(estado) as estado, count(*)::int as filas,
           array_agg(distinct tabla) as tablas, max(id) as ultimo
      from historial_cambios
     where id_usuario = ${idUsuario} and estado in ('aplicado', 'deshecho')
     group by grupo
     order by max(id) desc
     limit ${limite}`);
  return r.rows.map((f) => ({ ...aPaso(f), ultimo: Number(f.ultimo) }));
}

/** Estado del historial del usuario: qué se puede deshacer y rehacer, y la lista de pasos. También limpia lo más antiguo. */
export async function leerHistorial(ej: Ejecutor, idUsuario: number): Promise<EstadoHistorial> {
  await ej.execute(sql`delete from historial_cambios where en < now() - make_interval(days => ${DIAS_DE_HISTORIAL})`);
  const todos = await pasosDe(ej, idUsuario, MAX_PASOS);
  const aplicados = todos.filter((p) => p.estado === "aplicado");
  const deshechos = todos.filter((p) => p.estado === "deshecho");
  const quitar = (p: PasoHistorial & { ultimo: number }): PasoHistorial => ({ grupo: p.grupo, accion: p.accion, en: p.en, estado: p.estado, filas: p.filas, tablas: p.tablas });
  return {
    puedeDeshacer: aplicados[0] ? quitar(aplicados[0]) : null,
    puedeRehacer: deshechos.length > 0 ? quitar(deshechos[deshechos.length - 1]) : null,
    pasos: todos.map(quitar),
  };
}

const esConflicto = (e: unknown): string | null => {
  for (let actual: unknown = e, i = 0; actual && typeof actual === "object" && i < 5; i++) {
    const { message, detail, cause } = actual as { message?: unknown; detail?: unknown; cause?: unknown };
    if (typeof message === "string" && message.includes("HIST_CONFLICTO")) return typeof detail === "string" ? detail : "";
    actual = cause;
  }
  return null;
};

const NOMBRE_TABLA: Record<string, string> = {
  expedientes: "un expediente",
  clientes: "un cliente",
  emails_clientes: "los correos de un cliente",
  telefonos_clientes: "los teléfonos de un cliente",
  marcas: "una marca",
  modelos: "un modelo",
  tipo_de_venta: "un tipo de pago",
  estado_vehiculo: "un estado de vehículo",
  tiendas: "una tienda",
  commission_plans: "un plan de comisionamiento",
  apuntes_expediente: "un apunte o semáforo de un expediente",
  apuntes_predefinidos: "un apunte predefinido",
  alertas: "una alerta",
  alertas_reglas: "una regla de alerta",
  calendario_eventos: "una nota del calendario",
};

/**
 * Deshace (o rehace) pasos del historial del usuario. Sin `grupo`, el último paso; con `grupo`, todos los pasos hasta ese (incluido).
 * Si algún registro ha cambiado después por otra vía, no toca nada y avisa (salvo `forzar`).
 */
export async function aplicarHistorial(db: Db, idUsuario: number, direccion: "deshacer" | "rehacer", opciones: { grupo?: string; forzar?: boolean } = {}): Promise<{ pasos: number; accion: string }> {
  return db.transaction(async (tx) => {
    const todos = await pasosDe(tx, idUsuario, 500);
    const origen = direccion === "deshacer" ? "aplicado" : "deshecho";
    // Deshacer: del más reciente al más antiguo. Rehacer: en el orden en que se hicieron.
    const candidatos = todos.filter((p) => p.estado === origen).sort((a, b) => (direccion === "deshacer" ? b.ultimo - a.ultimo : a.ultimo - b.ultimo));
    if (candidatos.length === 0) throw new HttpError(409, direccion === "deshacer" ? "No hay nada que deshacer." : "No hay nada que rehacer.");
    let hasta = 0;
    if (opciones.grupo) {
      hasta = candidatos.findIndex((p) => p.grupo === opciones.grupo);
      if (hasta < 0) throw new HttpError(404, "Ese paso ya no está en el historial.");
    }
    const aplicar = candidatos.slice(0, hasta + 1);
    try {
      // Deshacer la creación de una marca o un modelo hecha hace poco es la única forma de quitarlos (grabados a fuego en todo lo demás): los disparadores lo permiten solo aquí
      await tx.execute(sql`select set_config('app.restauracion_completa', 'on', true)`);
      for (const paso of aplicar) await tx.execute(sql`select historial_aplicar(${paso.grupo}::uuid, ${idUsuario}, ${direccion}, ${opciones.forzar === true})`);
    } catch (e) {
      const detalle = esConflicto(e);
      if (detalle === null) throw e;
      const tabla = detalle.split(" ")[0];
      throw new HttpError(409, `No se puede ${direccion} «${aplicar[0]?.accion ?? "el cambio"}»: ${NOMBRE_TABLA[tabla] ?? "un registro"} se ha modificado después por otra vía. Si quieres deshacerlo igualmente, se perderían esos cambios más recientes.`);
    }
    return { pasos: aplicar.length, accion: aplicar[aplicar.length - 1].accion };
  });
}
