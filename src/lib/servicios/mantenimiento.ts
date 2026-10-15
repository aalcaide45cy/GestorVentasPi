import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { emailsClientes, importacionesRegistros, telefonosClientes, usuariosTiendas } from "@/db/schema";

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
