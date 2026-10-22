import { getTableColumns, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import {
  ajustes,
  clientes,
  emailsClientes,
  emailsUsuarios,
  estadoVehiculo,
  expedientes,
  importacionesBloques,
  importacionesRegistros,
  marcas,
  modelos,
  telefonosClientes,
  telefonosUsuarios,
  tiendas,
  tipoDeVenta,
  usuarios,
  usuariosTiendas,
} from "@/db/schema";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";

/** Versión del formato de copia JSON de esta aplicación (la antigua usaba «1.0»). */
export const VERSION_COPIA = "2.0";

interface TablaCopia {
  clave: string;
  tabla: PgTable;
  nombreSql: string;
  /** Columna serial de la clave primaria (para reiniciar su secuencia al restaurar). */
  serial?: string;
}

/** Orden de dependencias: al restaurar se inserta en este orden y se borra en el inverso. */
const TABLAS: TablaCopia[] = [
  { clave: "tiendas", tabla: tiendas, nombreSql: "tiendas", serial: "id_tienda" },
  { clave: "marcas", tabla: marcas, nombreSql: "marcas", serial: "id_marca" },
  { clave: "modelos", tabla: modelos, nombreSql: "modelos", serial: "id_modelo" },
  { clave: "tipoDeVenta", tabla: tipoDeVenta, nombreSql: "tipo_de_venta", serial: "id_tipo_de_venta" },
  { clave: "estadoVehiculo", tabla: estadoVehiculo, nombreSql: "estado_vehiculo", serial: "id_estado_vehiculo" },
  { clave: "ajustes", tabla: ajustes, nombreSql: "ajustes" },
  { clave: "usuarios", tabla: usuarios, nombreSql: "usuarios", serial: "id_usuario" },
  { clave: "usuariosTiendas", tabla: usuariosTiendas, nombreSql: "usuarios_tiendas", serial: "id_usuario_tienda" },
  { clave: "emailsUsuarios", tabla: emailsUsuarios, nombreSql: "emails_usuarios", serial: "id_email_usuario" },
  { clave: "telefonosUsuarios", tabla: telefonosUsuarios, nombreSql: "telefonos_usuarios", serial: "id_telefono_usuario" },
  { clave: "clientes", tabla: clientes, nombreSql: "clientes", serial: "id" },
  { clave: "emailsClientes", tabla: emailsClientes, nombreSql: "emails_clientes", serial: "id_email_cliente" },
  { clave: "telefonosClientes", tabla: telefonosClientes, nombreSql: "telefonos_clientes", serial: "id_telefono_cliente" },
  { clave: "expedientes", tabla: expedientes, nombreSql: "expedientes", serial: "id_expediente" },
  { clave: "importacionesBloques", tabla: importacionesBloques, nombreSql: "importaciones_bloques", serial: "id" },
  { clave: "importacionesRegistros", tabla: importacionesRegistros, nombreSql: "importaciones_registros", serial: "id" },
];

export const esquemaCopia = z.object({
  version: z.string().optional(),
  timestamp: z.string().optional(),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});
export type CopiaJson = z.infer<typeof esquemaCopia>;

export interface ContenidoCopia {
  version: string;
  app: string;
  timestamp: string;
  data: Record<string, unknown[]>;
}

/** Vuelca las tablas de datos (no sesiones, intentos de acceso ni auditoría). */
export async function exportarCopia(ej: Ejecutor): Promise<ContenidoCopia> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLAS) data[t.clave] = await ej.select().from(t.tabla);
  return { version: VERSION_COPIA, app: "GestorVentasPi", timestamp: new Date().toISOString(), data };
}

/** Convierte las cadenas ISO de las columnas de fecha-hora en `Date` antes de insertar. */
function prepararFilas(tabla: PgTable, filas: Record<string, unknown>[]): Record<string, unknown>[] {
  const marcasTiempo = Object.entries(getTableColumns(tabla))
    .filter(([, col]) => col.columnType === "PgTimestamp")
    .map(([nombre]) => nombre);
  if (marcasTiempo.length === 0) return filas;
  return filas.map((f) => {
    const copia = { ...f };
    for (const c of marcasTiempo) if (typeof copia[c] === "string") copia[c] = new Date(copia[c] as string);
    return copia;
  });
}

/**
 * Restaura una copia completa: borra los datos actuales e inserta los de la copia, todo en una
 * transacción. El administrador que restaura no puede quedarse sin acceso: se conserva su cuenta.
 */
export async function restaurarCopia(ej: Ejecutor, admin: UsuarioActual, copia: CopiaJson): Promise<void> {
  if (copia.version && copia.version !== VERSION_COPIA) {
    throw new HttpError(
      400,
      copia.version === "1.0"
        ? "Esta copia pertenece a la aplicación antigua (formato 1.0). Su conversión se realiza con la herramienta de migración de datos, no con este botón."
        : `Versión de copia no admitida: ${copia.version}`,
    );
  }
  const desconocidas = Object.keys(copia.data).filter((k) => !TABLAS.some((t) => t.clave === k));
  if (desconocidas.length > 0) throw new HttpError(400, `Formato de copia no válido: tablas desconocidas (${desconocidas.join(", ")})`);

  await ej.transaction(async (tx) => {
    // Restaurar una copia completa vuelve a cargar las marcas y los modelos que la copia trae: los disparadores de «grabado a fuego» lo permiten solo aquí
    await tx.execute(sql`select set_config('app.restauracion_completa', 'on', true)`);
    const [cuentaAdmin] = await tx.select().from(usuarios).where(sql`${usuarios.idUsuario} = ${admin.idUsuario}`);

    // Los datos de comisiones dependen de usuarios, modelos y expedientes: se vacían antes (TRUNCATE no activa los
    // disparadores de protección). La copia JSON no los incluye; para conservarlos se usan las copias completas (.dump).
    await tx.execute(
      sql.raw(
        "truncate table adjuntos, rejillas, validaciones_comision, libro_puntos, pendientes_cobro, commission_liquidation_versions, commission_liquidation_line_items, commission_liquidation_lines, commission_liquidations, commission_plans restart identity cascade",
      ),
    );
    for (const t of [...TABLAS].reverse()) await tx.delete(t.tabla);

    for (const t of TABLAS) {
      let filas = (copia.data[t.clave] ?? []) as Record<string, unknown>[];
      if (t.clave === "usuarios" && cuentaAdmin) {
        // El administrador actual no puede perder el acceso al restaurar.
        const i = filas.findIndex((u) => u.loginEmail === cuentaAdmin.loginEmail);
        if (i > -1) filas = filas.map((u, j) => (j === i ? { ...u, rol: "administrador", bloqueado: false } : u));
        else {
          const usados = new Set(filas.map((u) => Number(u.idUsuario)));
          let id = cuentaAdmin.idUsuario;
          while (usados.has(id)) id++;
          filas = [...filas, { ...cuentaAdmin, idUsuario: id, rol: "administrador", bloqueado: false }];
        }
      }
      if (filas.length === 0) continue;
      const preparadas = prepararFilas(t.tabla, filas);
      const columnas = Math.max(1, Object.keys(getTableColumns(t.tabla)).length);
      const tamano = Math.max(1, Math.floor(60000 / columnas));
      for (let i = 0; i < preparadas.length; i += tamano) {
        await tx.insert(t.tabla).values(preparadas.slice(i, i + tamano));
      }
    }

    for (const t of TABLAS) {
      if (!t.serial) continue;
      await tx.execute(
        sql.raw(
          `SELECT setval(pg_get_serial_sequence('${t.nombreSql}', '${t.serial}'), COALESCE((SELECT MAX(${t.serial}) FROM ${t.nombreSql}), 1), (SELECT COUNT(*) > 0 FROM ${t.nombreSql}))`,
        ),
      );
    }
  });
}
