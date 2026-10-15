import { inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { sembrar, sembrarCatalogoInicial } from "@/db/semilla";
import { clientes, emailsClientes, estadoVehiculo, expedientes, importacionesBloques, importacionesRegistros, marcas, modelos, telefonosClientes, tiendas, tipoDeVenta, usuarios, usuariosTiendas } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { crearCopia } from "@/lib/servicios/copias";

export interface AnalisisBbdd {
  stats: {
    orphanLinesCount: number;
    orphanEmailsCount: number;
    orphanTelefonosCount: number;
    orphanUserTiendasCount: number;
    orphanImportRegistrosCount: number;
    totalAnomalies: number;
  };
  details: {
    orphanLines: { id_line: number }[];
    orphanEmails: { id: number; email: string }[];
    orphanTelefonos: { id: number; telefono: string }[];
    orphanUserTiendas: { id: number }[];
    orphanImportRegistros: { id: number }[];
  };
}

/**
 * Busca registros huérfanos. Con las claves foráneas reales de PostgreSQL casi nunca existen; la
 * herramienta se conserva (y las líneas de liquidación se sumarán en F3) para detectar datos
 * restaurados o importados con inconsistencias.
 */
export async function analizarBbdd(ej: Ejecutor): Promise<AnalisisBbdd> {
  const emails = await ej.execute<{ id: number; email: string }>(
    sql`select e.id_email_cliente as id, e.email from emails_clientes e left join clientes c on c.id = e.id_cliente where c.id is null`,
  );
  const telefonos = await ej.execute<{ id: number; telefono: string }>(
    sql`select t.id_telefono_cliente as id, t.telefono from telefonos_clientes t left join clientes c on c.id = t.id_cliente where c.id is null`,
  );
  const userTiendas = await ej.execute<{ id: number }>(
    sql`select ut.id_usuario_tienda as id from usuarios_tiendas ut left join usuarios u on u.id_usuario = ut.id_usuario left join tiendas t on t.id_tienda = ut.id_tienda where u.id_usuario is null or t.id_tienda is null`,
  );
  const registros = await ej.execute<{ id: number }>(
    sql`select r.id from importaciones_registros r left join importaciones_bloques b on b.id = r.bloque_id where b.id is null`,
  );

  const details: AnalisisBbdd["details"] = {
    orphanLines: [],
    orphanEmails: emails.rows,
    orphanTelefonos: telefonos.rows,
    orphanUserTiendas: userTiendas.rows,
    orphanImportRegistros: registros.rows,
  };
  const stats = {
    orphanLinesCount: details.orphanLines.length,
    orphanEmailsCount: details.orphanEmails.length,
    orphanTelefonosCount: details.orphanTelefonos.length,
    orphanUserTiendasCount: details.orphanUserTiendas.length,
    orphanImportRegistrosCount: details.orphanImportRegistros.length,
    totalAnomalies: 0,
  };
  stats.totalAnomalies =
    stats.orphanLinesCount + stats.orphanEmailsCount + stats.orphanTelefonosCount + stats.orphanUserTiendasCount + stats.orphanImportRegistrosCount;
  return { stats, details };
}

const ids = z.array(z.number().int().positive()).max(100000).default([]);
export const esquemaLimpieza = z.object({
  cleanLines: ids,
  cleanEmails: ids,
  cleanTelefonos: ids,
  cleanUserTiendas: ids,
  cleanImportRegistros: ids,
});

/** Borra los huérfanos indicados en una sola transacción; devuelve cuántos registros se eliminaron. */
export async function limpiarBbdd(ej: Ejecutor, entrada: z.infer<typeof esquemaLimpieza>): Promise<number> {
  return ej.transaction(async (tx) => {
    let total = 0;
    if (entrada.cleanEmails.length > 0) {
      total += (await tx.delete(emailsClientes).where(inArray(emailsClientes.idEmailCliente, entrada.cleanEmails)).returning({ id: emailsClientes.idEmailCliente })).length;
    }
    if (entrada.cleanTelefonos.length > 0) {
      total += (await tx.delete(telefonosClientes).where(inArray(telefonosClientes.idTelefonoCliente, entrada.cleanTelefonos)).returning({ id: telefonosClientes.idTelefonoCliente })).length;
    }
    if (entrada.cleanUserTiendas.length > 0) {
      total += (await tx.delete(usuariosTiendas).where(inArray(usuariosTiendas.idUsuarioTienda, entrada.cleanUserTiendas)).returning({ id: usuariosTiendas.idUsuarioTienda })).length;
    }
    if (entrada.cleanImportRegistros.length > 0) {
      total += (await tx.delete(importacionesRegistros).where(inArray(importacionesRegistros.id, entrada.cleanImportRegistros)).returning({ id: importacionesRegistros.id })).length;
    }
    return total;
  });
}

export const esquemaVaciar = z.object({
  confirmacion: z.string(),
  /** Además de los datos, elimina las demás cuentas de usuario (se conserva siempre la del administrador que lo pide). */
  eliminarOtrosUsuarios: z.boolean().default(false),
  /** Vuelve a cargar los estados, formas de pago y marcas de partida (como una instalación nueva). */
  catalogosPorDefecto: z.boolean().default(true),
});

export interface ResultadoVaciado {
  copiaPrevia: string | null;
}

/**
 * Deja la base de datos «de cero»: borra tiendas, catálogos, clientes, expedientes, comisiones, rejillas, adjuntos e
 * historial de importaciones. Conserva las cuentas de acceso (y los ajustes) para no perder el acceso a la aplicación.
 * Antes crea una copia de seguridad «previa»; si no se puede crear, no borra nada.
 */
export async function vaciarBaseDeDatos(ej: Ejecutor, idAdmin: number, entrada: z.input<typeof esquemaVaciar>): Promise<ResultadoVaciado> {
  if (entrada.confirmacion.trim() !== "BORRAR TODO") throw new HttpError(400, "Escribe BORRAR TODO para confirmar");
  let copiaPrevia: string | null = null;
  try {
    copiaPrevia = (await crearCopia(ej, "previa", idAdmin)).nombre;
  } catch (e) {
    throw new HttpError(500, `No se borró nada: no se pudo crear la copia de seguridad previa (${e instanceof Error ? e.message : "error desconocido"}).`);
  }
  await ej.transaction(async (tx) => {
    // TRUNCATE no activa los disparadores de protección. Las tablas de comisiones y lo que cuelga de expedientes primero.
    await tx.execute(
      sql.raw(
        "truncate table adjuntos, rejillas, validaciones_comision, libro_puntos, pendientes_cobro, commission_liquidation_versions, commission_liquidation_line_items, commission_liquidation_lines, commission_liquidations, commission_plans restart identity cascade",
      ),
    );
    await tx.delete(importacionesRegistros);
    await tx.delete(importacionesBloques);
    await tx.delete(expedientes);
    await tx.delete(telefonosClientes);
    await tx.delete(emailsClientes);
    await tx.delete(clientes);
    await tx.delete(modelos);
    await tx.delete(marcas);
    await tx.delete(tipoDeVenta);
    await tx.delete(estadoVehiculo);
    await tx.delete(usuariosTiendas);
    await tx.update(usuarios).set({ tiendaPredeterminadaId: null });
    await tx.delete(tiendas);
    if (entrada.eliminarOtrosUsuarios ?? false) await tx.delete(usuarios).where(ne(usuarios.idUsuario, idAdmin));
    for (const [tabla, col] of [["tiendas", "id_tienda"], ["marcas", "id_marca"], ["modelos", "id_modelo"], ["tipo_de_venta", "id_tipo_de_venta"], ["estado_vehiculo", "id_estado_vehiculo"], ["clientes", "id"], ["emails_clientes", "id_email_cliente"], ["telefonos_clientes", "id_telefono_cliente"], ["usuarios_tiendas", "id_usuario_tienda"], ["expedientes", "id_expediente"], ["importaciones_bloques", "id"], ["importaciones_registros", "id"]] as const) {
      await tx.execute(sql.raw(`select setval(pg_get_serial_sequence('${tabla}', '${col}'), 1, false)`));
    }
  });
  if (entrada.catalogosPorDefecto ?? true) {
    await sembrar(ej);
    await sembrarCatalogoInicial(ej);
  }
  return { copiaPrevia };
}
