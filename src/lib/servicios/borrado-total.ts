import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { sembrar } from "@/db/semilla";
import { HttpError } from "@/lib/auth/sesion";
import { carpetaCopias } from "@/lib/mantenimiento";
import { crearCopia, sincronizarCarpeta } from "./copias";
import { carpetaLecturas } from "./lecturas-pedidos";
import { TareaCancelada, type ContextoTarea } from "./tareas";

/**
 * «Borrar absolutamente todo»: deja la aplicación como de fábrica. Es el único borrado que no deja nada: también se va lo que ya estaba en la Papelera
 * (borrado lógico), el historial de deshacer, la auditoría, todos los documentos (PDF, fotos, Excel), la biblioteca, las rejillas, las incidencias, las copias de
 * seguridad guardadas y todos los usuarios menos el administrador que lo ordena. Y al final se compactan las tablas para que no
 * quede ni un byte de lo borrado en el disco.
 *
 * Lo ÚNICO que se conserva («grabado a fuego»): las marcas y los modelos (con sus colores), las plantillas base de los planes de comisionamiento y de tarifas,
 * el usuario administrador y la configuración del equipo (cifrado, OCR, copias de seguridad, Google Drive con su conexión, reenvío de reportes). Los catálogos de
 * partida (formas de pago y estados) se vuelven a poner como en una instalación nueva.
 */

export const FRASE_BORRADO_TOTAL = "BORRAR ABSOLUTAMENTE TODO";

export const esquemaBorradoTotal = z.object({
  /** La interfaz la manda tras las tres confirmaciones (no se escribe). */
  confirmacion: z.literal(FRASE_BORRADO_TOTAL),
  /** Antes de borrar, guardar una copia de seguridad «previa» (por defecto, sí). Si se desactiva, no queda nada de nada. */
  hacerCopia: z.boolean().default(true),
});

export interface ResultadoBorradoTotal {
  copiaPrevia: string | null;
  ficherosBorrados: number;
}

/** Tablas que se vacían del todo (con las que dependen de ellas). `tiendas` va aparte porque el usuario conservado la referencia. */
const TABLAS_A_VACIAR = [
  "adjuntos", "adjuntos_datos", "alias_modelos", "auditoria", "biblioteca", "biblioteca_datos", "clientes", "emails_clientes", "telefonos_clientes",
  "commission_bonus_rules", "commission_brand_intervention_rates", "commission_finance_rates", "commission_liquidation_line_items", "commission_liquidation_lines",
  "commission_liquidation_versions", "commission_liquidations", "commission_model_points", "commission_plan_model_rates", "commission_plan_pending",
  "commission_plan_vendedores", "commission_plans", "commission_preference_rules", "commission_rules", "commission_used_rates", "commission_vo_patterns",
  "copias_seccion", "copias_seguridad", "estado_vehiculo", "expedientes", "historial_cambios", "importaciones_bloques", "importaciones_registros",
  "incidencias", "incidencias_capturas", "lecturas_pedidos", "libro_puntos", "login_intentos", "pagos_rci", "papelera_elementos", "pendientes_cobro",
  "plantillas_colores", "promociones_puntos", "rejilla_filas", "rejillas", "tipo_de_venta", "usuarios_tiendas", "validaciones_comision",
];

/**
 * Lo que se conserva de `ajustes` (configuración del equipo, no datos): el interruptor del cifrado, los motores de lectura de documentos (OCR), la configuración de las
 * copias de seguridad y de Google Drive (con su conexión), el reenvío de reportes entre equipos, la clave de recuperación y la visibilidad de los botones CSV.
 */
const PATRONES_AJUSTES_QUE_SE_CONSERVAN = ["cifrado\\_activo", "ocr\\_%", "lectura\\_manual", "backup\\_%", "drive\\_%", "incidencias\\_%", "clave\\_recuperacion\\_envuelta", "mostrar\\_botones\\_csv"];

/** Tablas que se compactan al final (todas las de usuario) para devolver al disco hasta el último byte. */
async function compactarTodo(ej: Ejecutor, ctx?: ContextoTarea): Promise<void> {
  const lista = ((await ej.execute(sql`select relname from pg_stat_user_tables where relname <> '__drizzle_migrations' order by relname`)) as unknown as { rows: { relname: string }[] }).rows.map((r) => r.relname);
  for (let i = 0; i < lista.length; i++) {
    ctx?.avance(i, lista.length, `Compactando la tabla ${lista[i]} (${i + 1} de ${lista.length})…`);
    await ej.execute(sql.raw(`vacuum full "${lista[i]}"`)).catch(() => undefined);
  }
}

/** Borra los ficheros de la carpeta de copias (copias, subidas a medias, la subcarpeta «papelera») y la cola de lectura en disco; conserva `salvo`. */
async function borrarFicheros(salvo: string | null): Promise<number> {
  let n = 0;
  const dir = carpetaCopias();
  for (const f of await readdir(dir).catch(() => [] as string[])) {
    if (salvo && f === salvo) continue;
    if (f.endsWith(".dump") || f.endsWith(".parcial") || f === "papelera" || f === "lecturas-pendientes") {
      await rm(path.join(dir, f), { recursive: true, force: true });
      n++;
    }
  }
  await rm(carpetaLecturas(), { recursive: true, force: true }).catch(() => undefined);
  return n;
}

/**
 * Hace el borrado total. Con `ctx` informa del avance. La parte de la base de datos va en UNA transacción: si algo falla, no se borra nada (ni se tocan
 * los ficheros). Solo la copia previa (si se pide) queda aparte, y es lo único que sobrevive a propósito.
 */
export async function borrarAbsolutamenteTodo(ej: Ejecutor, idAdmin: number, entrada: z.input<typeof esquemaBorradoTotal>, ctx?: ContextoTarea): Promise<ResultadoBorradoTotal> {
  const e = esquemaBorradoTotal.parse(entrada);
  const pasos = e.hacerCopia ? 7 : 6;
  let paso = 0;
  const avanza = (texto: string) => ctx?.avance(paso++, pasos, texto);

  let copiaPrevia: string | null = null;
  if (e.hacerCopia) {
    avanza("Haciendo la copia de seguridad previa (puede tardar)…");
    try {
      copiaPrevia = (await crearCopia(ej, "previa", idAdmin, "Antes de «Borrar absolutamente todo». Es lo único que queda: bórrala tú cuando estés seguro.")).nombre;
    } catch (err) {
      throw new HttpError(500, `No se ha borrado nada: no se pudo crear la copia de seguridad previa (${err instanceof Error ? err.message : "error desconocido"}).`);
    }
  }
  if (ctx?.cancelada()) throw new TareaCancelada("Cancelado antes de borrar: no se ha tocado nada");

  avanza("Borrando todos los datos (también la Papelera, el historial y los documentos)…");
  try {
    await ej.transaction(async (tx) => {
      // El usuario conservado: se anula su tienda predeterminada (la tabla de tiendas se vacía) y se borran los demás con todo lo suyo
      await tx.execute(sql`select set_config('app.borrado_autorizado', 'on', true)`);
      await tx.execute(sql`update usuarios set tienda_predeterminada_id = null`);
      await tx.execute(sql`delete from sesiones where id_usuario <> ${idAdmin}`);
      await tx.execute(sql`delete from codigos_recuperacion where id_usuario <> ${idAdmin}`);
      await tx.execute(sql`delete from emails_usuarios where id_usuario <> ${idAdmin}`);
      await tx.execute(sql`delete from telefonos_usuarios where id_usuario <> ${idAdmin}`);
      // Todo lo demás de una vez (TRUNCATE no activa los disparadores de protección, y no toca las marcas, los modelos ni las plantillas base)
      await tx.execute(sql.raw(`truncate table ${TABLAS_A_VACIAR.map((t) => `"${t}"`).join(", ")} restart identity cascade`));
      await tx.execute(sql`delete from usuarios where id_usuario <> ${idAdmin}`);
      await tx.execute(sql`delete from tiendas`);
      await tx.execute(sql`select setval(pg_get_serial_sequence('tiendas', 'id_tienda'), 1, false)`);
      // Plantillas: solo las base se conservan
      await tx.execute(sql`delete from plantillas_plan where not sistema`);
      await tx.execute(sql`delete from plantillas_tarifas_vn where not sistema`);
      // Ajustes: de fábrica, salvo la configuración del equipo
      await tx.execute(sql`delete from ajustes where clave = 'backup_ultimo_error' or not (clave like any (array[${sql.join(PATRONES_AJUSTES_QUE_SE_CONSERVAN.map((c) => sql`${c}`), sql`, `)}]))`);
      // Catálogos de partida (formas de pago, estados…) como en una instalación nueva; las marcas y los modelos ya están
      await sembrar(tx);
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const causa = (err as { cause?: { message?: string } }).cause?.message ?? (err instanceof Error ? err.message : "error desconocido");
    throw new HttpError(500, `No se ha borrado nada${copiaPrevia ? ` (la copia previa ${copiaPrevia} sí se creó)` : ""}. Motivo: ${causa}`);
  }

  avanza("Borrando los ficheros: copias de seguridad guardadas, subidas a medias y cola de lectura…");
  const ficherosBorrados = await borrarFicheros(copiaPrevia);
  if (copiaPrevia) await sincronizarCarpeta(ej).catch(() => undefined);

  avanza("Compactando la base de datos para que no quede ni un byte de lo borrado…");
  await compactarTodo(ej, undefined);
  ctx?.avance(pasos, pasos, "Terminado: la aplicación está como de fábrica");
  return { copiaPrevia, ficherosBorrados };
}
