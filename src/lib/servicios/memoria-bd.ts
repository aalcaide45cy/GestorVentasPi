import os from "node:os";
import { sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { HttpError } from "@/lib/auth/sesion";
import { identidadEquipo } from "@/lib/equipo";
import { CLAVE_RECOMENDADA, NOMBRES_AJUSTES_BD, VARIABLES_ENV, mismoValor, recomendarMemoriaBd, type MemoriaBd, type NombreAjusteBd } from "@/lib/memoria-bd";

export interface AjusteBd {
  nombre: NombreAjusteBd;
  actual: string;
  recomendado: string;
  /** Ya vale lo recomendado. */
  igual: boolean;
  /** De dónde sale el valor: «command line» (el contenedor o el arranque lo fija), «configuration file», «default»… */
  origen: string;
  /** Cambiado en el archivo de configuración, pero PostgreSQL aún no se ha reiniciado. */
  pendienteReinicio: boolean;
  /** Variable del `.env` de una instalación con Docker que lo controla. */
  variableEnv: string;
}

export interface EstadoMemoriaBd {
  ramMb: number;
  tipoEquipo: string;
  plataforma: string;
  recomendado: MemoriaBd;
  ajustes: AjusteBd[];
  /** Algún ajuste que hay que cambiar lo fija el arranque de PostgreSQL (Docker o la línea de comandos): no se puede cambiar desde la app. */
  fijadoPorElArranque: boolean;
  /** Hay algo que cambiar. */
  hayCambios: boolean;
}

interface FilaAjuste extends Record<string, unknown> {
  name: string;
  valor: string;
  source: string;
  pending_restart: boolean;
}

/** Cómo está ahora la memoria de la base de datos y cómo debería estar en este equipo. */
export async function leerMemoriaBd(ej: Ejecutor): Promise<EstadoMemoriaBd> {
  const ramMb = Math.round(os.totalmem() / 1024 / 1024);
  const tipoEquipo = identidadEquipo().tipo;
  const recomendado = recomendarMemoriaBd(ramMb, tipoEquipo);
  const filas = (await ej.execute<FilaAjuste>(sql`select name, current_setting(name) as valor, source, pending_restart from pg_settings where name in ('shared_buffers', 'effective_cache_size', 'work_mem', 'maintenance_work_mem')`)).rows;
  const ajustes = NOMBRES_AJUSTES_BD.map((nombre): AjusteBd => {
    const f = filas.find((x) => x.name === nombre);
    const rec = recomendado[CLAVE_RECOMENDADA[nombre]];
    return { nombre, actual: f?.valor ?? "?", recomendado: rec, igual: f ? mismoValor(f.valor, rec) : false, origen: f?.source ?? "?", pendienteReinicio: f?.pending_restart ?? false, variableEnv: VARIABLES_ENV[nombre] };
  });
  const aCambiar = ajustes.filter((a) => !a.igual);
  return { ramMb, tipoEquipo, plataforma: process.platform, recomendado, ajustes, fijadoPorElArranque: aCambiar.some((a) => a.origen === "command line"), hayCambios: aCambiar.length > 0 };
}

export interface ResultadoAplicarMemoriaBd {
  cambiados: NombreAjusteBd[];
  /** Hay que reiniciar PostgreSQL para que `shared_buffers` surta efecto. */
  hayQueReiniciar: boolean;
  mensaje: string;
}

/**
 * Escribe la memoria recomendada en la configuración de PostgreSQL (`ALTER SYSTEM`) y la recarga. Solo si el arranque no fija esos valores (en una
 * instalación con Docker los fija el `.env`). `shared_buffers` solo cambia al reiniciar PostgreSQL.
 */
export async function aplicarMemoriaBd(ej: Ejecutor): Promise<ResultadoAplicarMemoriaBd> {
  const estado = await leerMemoriaBd(ej);
  if (!estado.hayCambios) return { cambiados: [], hayQueReiniciar: false, mensaje: "La base de datos ya tiene la memoria recomendada." };
  if (estado.fijadoPorElArranque) throw new HttpError(409, "Estos valores los fija el arranque de la base de datos (Docker o su línea de comandos): se cambian en el archivo .env, no desde aquí.");
  const cambiados: NombreAjusteBd[] = [];
  for (const a of estado.ajustes) {
    if (a.igual) continue;
    // Los valores salen de nuestra tabla de recomendaciones (cifras y unidad), nunca de la petición
    if (!/^\d+(MB|GB)$/.test(a.recomendado)) continue;
    try {
      await ej.execute(sql.raw(`alter system set ${a.nombre} = '${a.recomendado}'`));
    } catch {
      throw new HttpError(403, "PostgreSQL no deja cambiar su configuración desde la aplicación (hace falta un usuario administrador de la base de datos).");
    }
    cambiados.push(a.nombre);
  }
  await ej.execute(sql`select pg_reload_conf()`);
  const hayQueReiniciar = cambiados.includes("shared_buffers");
  return {
    cambiados,
    hayQueReiniciar,
    mensaje: hayQueReiniciar
      ? "Guardado. El resto ya está en uso; la memoria compartida (shared_buffers) se aplicará cuando reinicies PostgreSQL."
      : "Guardado y aplicado.",
  };
}
