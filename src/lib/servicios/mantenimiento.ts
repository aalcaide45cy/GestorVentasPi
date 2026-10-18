import { inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { sembrar, sembrarCatalogoInicial } from "@/db/semilla";
import { clientes, emailsClientes, estadoVehiculo, expedientes, importacionesBloques, importacionesRegistros, marcas, modelos, telefonosClientes, tiendas, tipoDeVenta, usuarios, usuariosTiendas } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { borrarTodosLosFicheros } from "./lecturas-pedidos";
import { crearCopia } from "@/lib/servicios/copias";

export interface FilaAnomalia {
  id: number;
  /** Qué es (por ejemplo, el cliente o el bastidor). */
  texto: string;
  /** Por qué se señala. */
  detalle: string;
  /** Dónde mirarlo en la aplicación (un expediente o un cliente), si lo hay. */
  enlace?: string;
}

/** Algo que el análisis ha encontrado. «limpiable»: se puede borrar sin riesgo; «revisar»: lo decides tú a mano. */
export interface CategoriaAnomalia {
  id: string;
  titulo: string;
  explicacion: string;
  tipo: "limpiable" | "revisar";
  cantidad: number;
  /** Las primeras 300 filas, para verlas en una tabla. */
  filas: FilaAnomalia[];
}

export interface AnalisisBbdd {
  stats: {
    orphanLinesCount: number;
    orphanEmailsCount: number;
    orphanTelefonosCount: number;
    orphanUserTiendasCount: number;
    orphanImportRegistrosCount: number;
    orphanAdjuntosCount: number;
    orphanAdjuntosEliminadosCount: number;
    /** Solo lo que se puede limpiar sin riesgo (los avisos «a revisar» no cuentan). */
    totalAnomalies: number;
    /** Avisos que hay que mirar a mano. */
    totalARevisar: number;
  };
  details: {
    orphanLines: { id_line: number }[];
    orphanEmails: { id: number; email: string }[];
    orphanTelefonos: { id: number; telefono: string }[];
    orphanUserTiendas: { id: number }[];
    orphanImportRegistros: { id: number }[];
    orphanAdjuntos: { id: number }[];
    orphanAdjuntosEliminados: { id: number }[];
  };
  categorias: CategoriaAnomalia[];
}

const LIMITE_FILAS = 300;

/**
 * Analiza la base de datos y devuelve dos clases de hallazgos:
 * - **Limpiables** (se pueden borrar sin riesgo): correos y teléfonos sin cliente, relaciones usuario-tienda sin usuario o tienda,
 *   registros de importación sin su bloque y archivos adjuntos subidos que nunca se vincularon (de cualquier antigüedad).
 * - **A revisar** (solo se muestran; lo decides tú): expedientes sin cliente, vendedor, modelo o forma de pago, bastidores o
 *   matrículas repetidos, clientes sin expedientes o con el mismo DNI, expedientes que usan un modelo, estado o forma de pago
 *   eliminados, entregas anteriores al pedido, líneas de liquidación de expedientes que ya no existen y pedidos leídos con error.
 * Con las claves foráneas de PostgreSQL los huérfanos «de verdad» casi nunca existen; los avisos a revisar son lo que más ayuda.
 */
export async function analizarBbdd(ej: Ejecutor): Promise<AnalisisBbdd> {
  const filasDe = async <T extends Record<string, unknown>>(consulta: ReturnType<typeof sql>): Promise<T[]> => (await ej.execute(consulta)).rows as unknown as T[];
  const cat = async (c: Omit<CategoriaAnomalia, "cantidad" | "filas">, total: ReturnType<typeof sql>, filas: ReturnType<typeof sql>): Promise<CategoriaAnomalia> => {
    const [{ n }] = await filasDe<{ n: number }>(total);
    const r = n === 0 ? [] : await filasDe<{ id: number; texto: string | null; detalle: string | null }>(filas);
    return { ...c, cantidad: Number(n), filas: r.map((f) => ({ id: f.id, texto: f.texto ?? "(sin dato)", detalle: f.detalle ?? "", ...(c.id.startsWith("cli_") ? { enlace: `/dashboard/clientes/editar/${f.id}` } : c.id.startsWith("exp_") ? { enlace: `/dashboard/expedientes/editar/${f.id}` } : {}) })) };
  };
  const activos = sql`e.eliminado_en is null`;
  const lim = sql.raw(String(LIMITE_FILAS));

  const emails = await filasDe<{ id: number; email: string }>(sql`select e.id_email_cliente as id, e.email from emails_clientes e left join clientes c on c.id = e.id_cliente where c.id is null`);
  const telefonos = await filasDe<{ id: number; telefono: string }>(sql`select t.id_telefono_cliente as id, t.telefono from telefonos_clientes t left join clientes c on c.id = t.id_cliente where c.id is null`);
  const userTiendas = await filasDe<{ id: number }>(sql`select ut.id_usuario_tienda as id from usuarios_tiendas ut left join usuarios u on u.id_usuario = ut.id_usuario left join tiendas t on t.id_tienda = ut.id_tienda where u.id_usuario is null or t.id_tienda is null`);
  const registros = await filasDe<{ id: number }>(sql`select r.id from importaciones_registros r left join importaciones_bloques b on b.id = r.bloque_id where b.id is null`);
  const adjuntosViejos = await filasDe<{ id: number; nombre: string }>(sql`select id, nombre from adjuntos where ambito = 'pendiente' and eliminado_en is null`);
  // Documentos que siguen guardados aunque su expediente o su cliente se eliminó (el borrado de la aplicación es lógico: no quita los archivos)
  const adjuntosDeEliminados = await filasDe<{ id: number; nombre: string; tamano: string; motivo: string }>(
    sql`select a.id, a.nombre, a.tamano::bigint as tamano,
        case when a.eliminado_en is not null then 'Documento eliminado' when e.id_expediente is not null then 'Del expediente eliminado ' || e.id_expediente else 'Del cliente eliminado ' || coalesce(c.nombre, '') end as motivo
      from adjuntos a left join expedientes e on e.id_expediente = a.id_expediente and e.eliminado_en is not null left join clientes c on c.id = a.id_cliente and c.eliminado_en is not null
      where a.eliminado_en is not null or (a.ambito <> 'pendiente' and (e.id_expediente is not null or (a.id_expediente is null and c.id is not null)))
      order by a.tamano desc`,
  );
  const bytesAdjuntosEliminados = adjuntosDeEliminados.reduce((t, a) => t + Number(a.tamano), 0);
  const [{ bytes: bytesSinVincular }] = await filasDe<{ bytes: string }>(sql`select coalesce(sum(tamano), 0)::bigint as bytes from adjuntos where ambito = 'pendiente' and eliminado_en is null`);
  const mb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024)).toLocaleString("es-ES")} KB`);
  const eliminados = await filasDe<{ tabla: string; n: number }>(sql`select 'clientes' as tabla, count(*)::int as n from clientes where eliminado_en is not null union all select 'expedientes', count(*)::int from expedientes where eliminado_en is not null`);
  const nEliminados = (t: string) => eliminados.find((x) => x.tabla === t)?.n ?? 0;
  const lineasFantasma = await filasDe<{ id_line: number; texto: string }>(
    sql`select l.id_line, coalesce(u.nombre, 'sin vendedor') || ' · ' || coalesce(liq.mes, '') as texto from commission_liquidation_lines l join commission_liquidations liq on liq.id_liquidation = l.id_liquidation left join usuarios u on u.id_usuario = liq.id_usuario left join expedientes e on e.id_expediente = l.id_expediente where l.id_expediente is null or e.id_expediente is null or e.eliminado_en is not null limit ${lim}`,
  );

  const categorias: CategoriaAnomalia[] = [
    {
      id: "lim_adjuntos_eliminados",
      titulo: "Documentos de expedientes o clientes eliminados",
      explicacion: `Al eliminar un expediente o un cliente, la aplicación lo oculta pero conserva sus documentos (pedidos, DNI, fotos). Estos ${adjuntosDeEliminados.length.toLocaleString("es-ES")} documentos ocupan ${mb(bytesAdjuntosEliminados)}. Se pueden borrar; el expediente o cliente eliminado se queda, pero ya no se podrán recuperar sus documentos con «Deshacer».`,
      tipo: "limpiable",
      cantidad: adjuntosDeEliminados.length,
      filas: adjuntosDeEliminados.slice(0, LIMITE_FILAS).map((a) => ({ id: a.id, texto: a.nombre, detalle: `${a.motivo} · ${mb(Number(a.tamano))}` })),
    },
    { id: "lim_emails", titulo: "Correos de clientes sin cliente", explicacion: "Direcciones de correo que pertenecían a un cliente que ya no existe. Se pueden borrar.", tipo: "limpiable", cantidad: emails.length, filas: emails.slice(0, LIMITE_FILAS).map((e) => ({ id: e.id, texto: e.email, detalle: "No hay ningún cliente con este correo" })) },
    { id: "lim_telefonos", titulo: "Teléfonos de clientes sin cliente", explicacion: "Teléfonos de un cliente que ya no existe. Se pueden borrar.", tipo: "limpiable", cantidad: telefonos.length, filas: telefonos.slice(0, LIMITE_FILAS).map((t) => ({ id: t.id, texto: t.telefono, detalle: "No hay ningún cliente con este teléfono" })) },
    { id: "lim_usuarios_tiendas", titulo: "Relaciones usuario-tienda obsoletas", explicacion: "Una tienda asignada a un usuario o tienda que ya no existe. Se pueden borrar.", tipo: "limpiable", cantidad: userTiendas.length, filas: userTiendas.slice(0, LIMITE_FILAS).map((u) => ({ id: u.id, texto: `Relación #${u.id}`, detalle: "El usuario o la tienda ya no existe" })) },
    { id: "lim_importaciones", titulo: "Registros de importación sin su importación", explicacion: "Líneas del log de importaciones cuya importación ya no está. Se pueden borrar.", tipo: "limpiable", cantidad: registros.length, filas: registros.slice(0, LIMITE_FILAS).map((r) => ({ id: r.id, texto: `Registro #${r.id}`, detalle: "No pertenece a ninguna importación" })) },
    { id: "lim_adjuntos", titulo: "Archivos subidos que nunca se vincularon", explicacion: `PDF o fotos subidos que no se asociaron a ningún cliente o expediente (por ejemplo, de un pedido leído y cancelado), sean de hace un rato o de hace meses. Si alguno sigue en tu cola de pedidos, ese pedido ya no se podrá usar. Ocupan ${mb(Number(bytesSinVincular))}. Se pueden borrar.`, tipo: "limpiable", cantidad: adjuntosViejos.length, filas: adjuntosViejos.slice(0, LIMITE_FILAS).map((a) => ({ id: a.id, texto: a.nombre, detalle: "Subido y sin vincular a nada" })) },

    await cat(
      { id: "exp_sin_cliente", titulo: "Expedientes sin cliente", explicacion: "Expedientes activos que no tienen ningún cliente asociado.", tipo: "revisar" },
      sql`select count(*)::int as n from expedientes e where ${activos} and e.id_cliente is null`,
      sql`select e.id_expediente as id, 'Exp. ' || e.id_expediente || coalesce(' · ' || e.matricula, '') as texto, 'Sin cliente' as detalle from expedientes e where ${activos} and e.id_cliente is null order by e.id_expediente limit ${lim}`,
    ),
    await cat(
      { id: "exp_sin_vendedor", titulo: "Expedientes sin vendedor", explicacion: "Expedientes activos sin vendedor: no cuentan para las comisiones de nadie.", tipo: "revisar" },
      sql`select count(*)::int as n from expedientes e where ${activos} and e.id_usuario is null`,
      sql`select e.id_expediente as id, 'Exp. ' || e.id_expediente || ' · ' || coalesce(c.nombre, 'sin cliente') as texto, 'Sin vendedor' as detalle from expedientes e left join clientes c on c.id = e.id_cliente where ${activos} and e.id_usuario is null order by e.id_expediente limit ${lim}`,
    ),
    await cat(
      { id: "exp_sin_modelo", titulo: "Expedientes sin modelo", explicacion: "Sin modelo no se puede calcular la comisión del coche ni aparece en los informes por marca.", tipo: "revisar" },
      sql`select count(*)::int as n from expedientes e where ${activos} and e.id_modelo is null`,
      sql`select e.id_expediente as id, 'Exp. ' || e.id_expediente || ' · ' || coalesce(c.nombre, 'sin cliente') as texto, 'Sin modelo' as detalle from expedientes e left join clientes c on c.id = e.id_cliente where ${activos} and e.id_modelo is null order by e.id_expediente limit ${lim}`,
    ),
    await cat(
      { id: "exp_sin_pago", titulo: "Expedientes sin forma de pago", explicacion: "Sin forma de pago (contado, crédito, preference…) no se calcula la financiación.", tipo: "revisar" },
      sql`select count(*)::int as n from expedientes e where ${activos} and e.id_tipo_de_venta is null`,
      sql`select e.id_expediente as id, 'Exp. ' || e.id_expediente || ' · ' || coalesce(c.nombre, 'sin cliente') as texto, 'Sin forma de pago' as detalle from expedientes e left join clientes c on c.id = e.id_cliente where ${activos} and e.id_tipo_de_venta is null order by e.id_expediente limit ${lim}`,
    ),
    await cat(
      { id: "exp_bastidor_repetido", titulo: "Bastidores repetidos", explicacion: "Dos o más expedientes activos con el mismo bastidor: casi seguro que uno está duplicado.", tipo: "revisar" },
      sql`select count(*)::int as n from expedientes e where ${activos} and nullif(trim(e.vin), '') is not null and (select count(*) from expedientes x where x.eliminado_en is null and upper(replace(x.vin, ' ', '')) = upper(replace(e.vin, ' ', ''))) > 1`,
      sql`select e.id_expediente as id, 'Exp. ' || e.id_expediente || ' · ' || coalesce(c.nombre, 'sin cliente') as texto, 'Bastidor ' || e.vin || ' repetido' as detalle from expedientes e left join clientes c on c.id = e.id_cliente where ${activos} and nullif(trim(e.vin), '') is not null and (select count(*) from expedientes x where x.eliminado_en is null and upper(replace(x.vin, ' ', '')) = upper(replace(e.vin, ' ', ''))) > 1 order by e.vin, e.id_expediente limit ${lim}`,
    ),
    await cat(
      { id: "exp_matricula_repetida", titulo: "Matrículas repetidas", explicacion: "Dos o más expedientes activos con la misma matrícula (puede ser legítimo si un coche se vendió dos veces).", tipo: "revisar" },
      sql`select count(*)::int as n from expedientes e where ${activos} and nullif(trim(e.matricula), '') is not null and (select count(*) from expedientes x where x.eliminado_en is null and upper(regexp_replace(x.matricula, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(e.matricula, '[^A-Za-z0-9]', '', 'g'))) > 1`,
      sql`select e.id_expediente as id, 'Exp. ' || e.id_expediente || ' · ' || coalesce(c.nombre, 'sin cliente') as texto, 'Matrícula ' || e.matricula || ' repetida' as detalle from expedientes e left join clientes c on c.id = e.id_cliente where ${activos} and nullif(trim(e.matricula), '') is not null and (select count(*) from expedientes x where x.eliminado_en is null and upper(regexp_replace(x.matricula, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(e.matricula, '[^A-Za-z0-9]', '', 'g'))) > 1 order by e.matricula, e.id_expediente limit ${lim}`,
    ),
    await cat(
      { id: "exp_catalogo_eliminado", titulo: "Expedientes con modelo, estado o forma de pago eliminados", explicacion: "El expediente sigue apuntando a algo que se eliminó del catálogo. Se ve bien, pero conviene pasarlo a uno vigente.", tipo: "revisar" },
      sql`select count(*)::int as n from expedientes e left join modelos m on m.id_modelo = e.id_modelo left join estado_vehiculo s on s.id_estado_vehiculo = e.id_estado_vehiculo left join tipo_de_venta t on t.id_tipo_de_venta = e.id_tipo_de_venta where ${activos} and (m.eliminado_en is not null or s.eliminado_en is not null or t.eliminado_en is not null)`,
      sql`select e.id_expediente as id, 'Exp. ' || e.id_expediente || ' · ' || coalesce(c.nombre, 'sin cliente') as texto, concat_ws(', ', case when m.eliminado_en is not null then 'modelo «' || m.nombre_modelo || '» eliminado' end, case when s.eliminado_en is not null then 'estado «' || s.nombre_estado_vehiculo || '» eliminado' end, case when t.eliminado_en is not null then 'pago «' || t.nombre_tipo_venta || '» eliminado' end) as detalle from expedientes e left join clientes c on c.id = e.id_cliente left join modelos m on m.id_modelo = e.id_modelo left join estado_vehiculo s on s.id_estado_vehiculo = e.id_estado_vehiculo left join tipo_de_venta t on t.id_tipo_de_venta = e.id_tipo_de_venta where ${activos} and (m.eliminado_en is not null or s.eliminado_en is not null or t.eliminado_en is not null) order by e.id_expediente limit ${lim}`,
    ),
    await cat(
      { id: "exp_fechas", titulo: "Fechas incoherentes", explicacion: "Entrega anterior al pedido, o matriculación y entrega que no cuadran.", tipo: "revisar" },
      sql`select count(*)::int as n from expedientes e where ${activos} and e.fecha_entrega is not null and e.fecha_expediente is not null and e.fecha_entrega < e.fecha_expediente`,
      sql`select e.id_expediente as id, 'Exp. ' || e.id_expediente || ' · ' || coalesce(c.nombre, 'sin cliente') as texto, 'Entrega ' || to_char(e.fecha_entrega, 'DD/MM/YYYY') || ' anterior al pedido ' || to_char(e.fecha_expediente, 'DD/MM/YYYY') as detalle from expedientes e left join clientes c on c.id = e.id_cliente where ${activos} and e.fecha_entrega is not null and e.fecha_expediente is not null and e.fecha_entrega < e.fecha_expediente order by e.id_expediente limit ${lim}`,
    ),
    await cat(
      { id: "cli_sin_expedientes", titulo: "Clientes sin ningún expediente", explicacion: "Clientes que no tienen ningún expediente activo. A veces es normal (un cliente aún sin venta).", tipo: "revisar" },
      sql`select count(*)::int as n from clientes c where c.eliminado_en is null and not exists (select 1 from expedientes e where e.id_cliente = c.id and e.eliminado_en is null)`,
      sql`select c.id, coalesce(c.nombre, '(sin nombre)') || coalesce(' · ' || c.dni, '') as texto, 'Sin expedientes activos' as detalle from clientes c where c.eliminado_en is null and not exists (select 1 from expedientes e where e.id_cliente = c.id and e.eliminado_en is null) order by c.id limit ${lim}`,
    ),
    await cat(
      { id: "cli_dni_repetido", titulo: "Clientes con el mismo DNI", explicacion: "Dos o más clientes con el mismo DNI/NIE: probablemente son el mismo cliente duplicado.", tipo: "revisar" },
      sql`select count(*)::int as n from clientes c where c.eliminado_en is null and nullif(trim(c.dni), '') is not null and (select count(*) from clientes x where x.eliminado_en is null and upper(regexp_replace(x.dni, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(c.dni, '[^A-Za-z0-9]', '', 'g'))) > 1`,
      sql`select c.id, coalesce(c.nombre, '(sin nombre)') as texto, 'DNI ' || c.dni || ' repetido' as detalle from clientes c where c.eliminado_en is null and nullif(trim(c.dni), '') is not null and (select count(*) from clientes x where x.eliminado_en is null and upper(regexp_replace(x.dni, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(c.dni, '[^A-Za-z0-9]', '', 'g'))) > 1 order by c.dni, c.id limit ${lim}`,
    ),
    {
      id: "liq_lineas_fantasma",
      titulo: "Líneas de liquidación de expedientes que ya no existen",
      explicacion: "Líneas de una liquidación guardada cuyo expediente se eliminó. Las liquidaciones guardadas son históricas y no se tocan; solo se avisa.",
      tipo: "revisar",
      cantidad: lineasFantasma.length,
      filas: lineasFantasma.map((l) => ({ id: l.id_line, texto: l.texto, detalle: "El expediente de esta línea ya no existe o está eliminado" })),
    },
    {
      id: "info_clientes_eliminados",
      titulo: "Clientes eliminados que siguen guardados",
      explicacion: "Solo informativo: al eliminar un cliente se oculta pero se conserva (para poder deshacer y para el histórico de ventas). Por eso aparecen aquí y no en la pestaña Clientes. Ocupan muy poco; lo que pesa son sus documentos (mira «Documentos de expedientes o clientes eliminados»).",
      tipo: "revisar",
      cantidad: nEliminados("clientes"),
      filas: [],
    },
    {
      id: "info_expedientes_eliminados",
      titulo: "Expedientes eliminados que siguen guardados",
      explicacion: "Solo informativo: igual que los clientes, un expediente eliminado se oculta pero se conserva (sus comisiones ya liquidadas son históricas). No cuenta en ninguna comisión ni informe.",
      tipo: "revisar",
      cantidad: nEliminados("expedientes"),
      filas: [],
    },
    await cat(
      { id: "lec_errores", titulo: "Pedidos leídos con error o sin terminar", explicacion: "Documentos subidos para leer que dieron error o se quedaron a medias. Míralos en el Log de lecturas.", tipo: "revisar" },
      sql`select count(*)::int as n from lecturas_pedidos where estado = 'error'`,
      sql`select id, nombre as texto, coalesce(error, 'Error de lectura') as detalle from lecturas_pedidos where estado = 'error' order by id desc limit ${lim}`,
    ),
  ];

  const details: AnalisisBbdd["details"] = {
    orphanLines: lineasFantasma.map((l) => ({ id_line: l.id_line })),
    orphanEmails: emails,
    orphanTelefonos: telefonos,
    orphanUserTiendas: userTiendas,
    orphanImportRegistros: registros,
    orphanAdjuntos: adjuntosViejos.map((a) => ({ id: a.id })),
    orphanAdjuntosEliminados: adjuntosDeEliminados.map((a) => ({ id: a.id })),
  };
  const stats = {
    orphanLinesCount: lineasFantasma.length,
    orphanEmailsCount: emails.length,
    orphanTelefonosCount: telefonos.length,
    orphanUserTiendasCount: userTiendas.length,
    orphanImportRegistrosCount: registros.length,
    orphanAdjuntosCount: adjuntosViejos.length,
    orphanAdjuntosEliminadosCount: adjuntosDeEliminados.length,
    totalAnomalies: 0,
    totalARevisar: 0,
  };
  stats.totalAnomalies = stats.orphanEmailsCount + stats.orphanTelefonosCount + stats.orphanUserTiendasCount + stats.orphanImportRegistrosCount + stats.orphanAdjuntosCount + stats.orphanAdjuntosEliminadosCount;
  stats.totalARevisar = categorias.filter((c) => c.tipo === "revisar" && !c.id.startsWith("info_")).reduce((t, c) => t + c.cantidad, 0);
  return { stats, details, categorias };
}

const ids = z.array(z.number().int().positive()).max(100000).default([]);
export const esquemaLimpieza = z.object({
  cleanLines: ids,
  cleanEmails: ids,
  cleanTelefonos: ids,
  cleanUserTiendas: ids,
  cleanImportRegistros: ids,
  cleanAdjuntos: ids,
  cleanAdjuntosEliminados: ids,
});

/**
 * Borra los huérfanos indicados en una sola transacción; devuelve cuántos registros se eliminaron. Antes se guarda una copia de
 * seguridad «previa» completa (si no se puede, no se borra nada). Las líneas de liquidación nunca se borran: son históricas.
 */
export async function limpiarBbdd(ej: Ejecutor, entrada: z.infer<typeof esquemaLimpieza>, idAdmin: number | null = null): Promise<number> {
  const hayQueBorrar = entrada.cleanEmails.length + entrada.cleanTelefonos.length + entrada.cleanUserTiendas.length + entrada.cleanImportRegistros.length + entrada.cleanAdjuntos.length + entrada.cleanAdjuntosEliminados.length > 0;
  if (hayQueBorrar && idAdmin !== null) {
    try {
      await crearCopia(ej, "previa", idAdmin, "Antes de limpiar la base de datos (registros huérfanos). Restáurala si algo no era lo que esperabas.");
    } catch (e) {
      throw new HttpError(500, `No se ha borrado nada: no se pudo crear la copia de seguridad previa (${e instanceof Error ? e.message : "error desconocido"}).`);
    }
  }
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
    if (entrada.cleanAdjuntos.length > 0) {
      // Solo los que siguen sin vincular: nunca un adjunto de un expediente o cliente
      const r = await tx.execute(sql`delete from adjuntos where id in (${sql.join(entrada.cleanAdjuntos.map((i) => sql`${i}`), sql`, `)}) and ambito = 'pendiente' returning id`);
      total += r.rows.length;
    }
    if (entrada.cleanAdjuntosEliminados.length > 0) {
      // Solo los de verdad de algo eliminado (se vuelve a comprobar aquí): nunca un documento de un expediente o cliente vigente
      const lista = sql.join(entrada.cleanAdjuntosEliminados.map((i) => sql`${i}`), sql`, `);
      const permitidos = sql`a.id in (${lista}) and (a.eliminado_en is not null or (a.ambito <> 'pendiente' and (exists (select 1 from expedientes e where e.id_expediente = a.id_expediente and e.eliminado_en is not null) or (a.id_expediente is null and exists (select 1 from clientes c where c.id = a.id_cliente and c.eliminado_en is not null)))))`;
      await tx.execute(sql`update clientes set foto_adjunto_id = null where foto_adjunto_id in (select a.id from adjuntos a where ${permitidos})`);
      const r = await tx.execute(sql`delete from adjuntos a where ${permitidos} returning a.id`);
      total += r.rows.length;
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
    copiaPrevia = (await crearCopia(ej, "previa", idAdmin, "Antes de vaciar la base de datos («Borrar todo»). Restaúrala para recuperar los datos.")).nombre;
  } catch (e) {
    throw new HttpError(500, `No se borró nada: no se pudo crear la copia de seguridad previa (${e instanceof Error ? e.message : "error desconocido"}).`);
  }
  // Todo en una sola transacción, también la recarga de los catálogos: si algo falla, no se borra nada
  try {
  await ej.transaction(async (tx) => {
    // TRUNCATE no activa los disparadores de protección. Las tablas de comisiones y lo que cuelga de expedientes primero.
    await tx.execute(
      sql.raw(
        "truncate table lecturas_pedidos, adjuntos, rejillas, validaciones_comision, libro_puntos, pendientes_cobro, commission_liquidation_versions, commission_liquidation_line_items, commission_liquidation_lines, commission_liquidations, commission_plans restart identity cascade",
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
    if (entrada.catalogosPorDefecto ?? true) {
      await sembrar(tx);
      await sembrarCatalogoInicial(tx);
    }
  });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const causa = (e as { cause?: { message?: string } }).cause?.message ?? (e instanceof Error ? e.message : "error desconocido");
    console.error("Error al vaciar la base de datos:", e);
    throw new HttpError(500, `No se ha borrado nada (la copia previa ${copiaPrevia} sí se creó). Motivo: ${causa}`);
  }
  await borrarTodosLosFicheros();
  return { copiaPrevia };
}
