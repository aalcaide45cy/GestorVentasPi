import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { descifrarBuffer } from "@/lib/auth/cifrado";
import { HttpError } from "@/lib/auth/sesion";
import { crearCopia } from "./copias";
import { conRecalculo } from "./liquidaciones";
import { borrarFicherosDeCopias, motivoDeFallo, reinsertarElemento, TEXTO_TIPO, TIPOS_ELEMENTO, type TipoElemento } from "./papelera-elementos";
import { TareaCancelada, type ContextoTarea } from "./tareas";

/**
 * Papelera y purga: la aplicación no borra de verdad al eliminar un cliente, un expediente, un documento o un elemento de un catálogo,
 * solo lo oculta (así se puede deshacer y el histórico de comisiones sigue entero). Aquí se ve todo lo que sigue guardado, se descarga,
 * se elige y se purga (se borra de verdad) por categorías o «a fondo». Antes de purgar se guarda siempre una copia de seguridad completa.
 *
 * No se tocan las liquidaciones guardadas ni el libro de puntos: son el histórico de lo cobrado y la base de datos los protege.
 */

export const CATEGORIAS = ["expedientes", "clientes", "documentos", "biblioteca", "elementos", "catalogo", "historial", "lecturas", "auditoria"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export const CATEGORIAS_RESTAURABLES = ["expedientes", "clientes", "documentos", "biblioteca", "elementos", "catalogo"] as const;

export interface InfoCategoria {
  categoria: Categoria;
  titulo: string;
  explicacion: string;
  /** Qué arrastra purgarla, en lenguaje sencillo. */
  alPurgar: string;
  cantidad: number;
  /** Lo que ocupa (aproximado), en bytes. */
  bytes: number;
  /** Se puede elegir fila a fila (si no, solo todo o por antigüedad). */
  porFilas: boolean;
  /** Admite «anteriores a N días». */
  porAntiguedad: boolean;
  /** Cuántos hay de cada clase (tipo de documento, tabla del catálogo), para las pestañas. */
  porSubtipo?: Record<string, number>;
  /** Lo eliminado se puede sacar de la papelera (restaurar). */
  restaurable: boolean;
}

export interface FilaPapelera {
  /** Identificador de la fila (texto: «12», o «marcas:3» en el catálogo). */
  id: string;
  texto: string;
  detalle: string;
  bytes: number;
  /** Cuándo se eliminó (ISO), si consta. */
  eliminadoEn: string | null;
  /** Cuántos documentos tiene (para poder verlos antes de decidir). */
  documentos: number;
  /** Clase dentro de la categoría, para las pestañas: el tipo del documento (pedido, pago_rci…) o la tabla del catálogo (marcas, modelos…). Vacío si no hay. */
  subtipo: string;
  /** Lo que impide purgarla ahora mismo (por ejemplo, que aún tiene expedientes eliminados), si algo lo impide. */
  bloqueo: string | null;
}

const TEXTOS: Record<Categoria, Pick<InfoCategoria, "titulo" | "explicacion" | "alPurgar" | "porFilas" | "porAntiguedad">> = {
  expedientes: {
    titulo: "Expedientes eliminados",
    explicacion: "Expedientes que eliminaste: no se ven ni cuentan en ninguna comisión, pero siguen guardados con sus datos y documentos.",
    alPurgar: "Se borran el expediente, sus documentos y sus marcas de pagado/reclamado. Las liquidaciones y los puntos ya guardados se conservan (son el histórico de lo cobrado).",
    porFilas: true,
    porAntiguedad: false,
  },
  clientes: {
    titulo: "Clientes eliminados",
    explicacion: "Clientes que eliminaste: no salen en la lista, pero siguen guardados con sus correos, teléfonos y documentos.",
    alPurgar: "Se borran el cliente, sus correos, teléfonos y documentos. Un cliente que aún tiene expedientes eliminados no se puede purgar hasta purgar esos expedientes.",
    porFilas: true,
    porAntiguedad: false,
  },
  documentos: {
    titulo: "Documentos sueltos o eliminados",
    explicacion: "Pedidos, DNI y fotos que siguen guardados aunque ya no se ven: eliminados, de expedientes o clientes eliminados, o leídos y nunca vinculados.",
    alPurgar: "Se borra el archivo de verdad. Si un pedido sin vincular sigue en tu cola de pedidos, esa entrada ya no se podrá usar.",
    porFilas: true,
    porAntiguedad: false,
  },
  biblioteca: {
    titulo: "Archivos de la biblioteca eliminados",
    explicacion: "Pedidos, pagos de RCI, rejillas y listados que quitaste de la Biblioteca: siguen guardados (con su contenido) hasta que los purgues.",
    alPurgar: "Se borra el archivo de verdad. Los pedidos o pagos que ya se crearon con él no cambian.",
    porFilas: true,
    porAntiguedad: false,
  },
  elementos: {
    titulo: "Rejillas, plantillas y otros elementos eliminados",
    explicacion: "Rejillas leídas, plantillas de plan y de tarifas, paletas de colores, pendientes de cobro y marcas de pagado/reclamado que eliminaste (o que se sustituyeron al guardar otra).",
    alPurgar: "Se borra la copia guardada: ya no se podrán restaurar.",
    porFilas: true,
    porAntiguedad: false,
  },
  catalogo: {
    titulo: "Catálogos eliminados",
    explicacion: "Marcas, modelos, formas de pago, estados de vehículo y tiendas que eliminaste.",
    alPurgar: "Se borran los que ningún expediente ni plan de comisiones usa ya; los demás se quedan (la fila dice por qué).",
    porFilas: true,
    porAntiguedad: false,
  },
  historial: {
    titulo: "Historial de deshacer y rehacer",
    explicacion: "El diario de cambios que permite deshacer y rehacer. Guarda copia de cada fila que cambió o se borró (se limpia solo a los 30 días).",
    alPurgar: "Ya no se podrá deshacer nada de lo purgado.",
    porFilas: false,
    porAntiguedad: true,
  },
  lecturas: {
    titulo: "Registro de lecturas de pedidos",
    explicacion: "Una fila por cada documento subido para leer (leído, descartado, cancelado o con error) con lo que se leyó de él. Se limpia solo a los 90 días.",
    alPurgar: "Se pierde el registro (Herramientas › Historial de lecturas). Los pedidos ya aplicados a expedientes no se tocan.",
    porFilas: false,
    porAntiguedad: true,
  },
  auditoria: {
    titulo: "Registro de auditoría",
    explicacion: "Quién hizo qué y cuándo: accesos, exportaciones, borrados, copias…",
    alPurgar: "Se pierde ese rastro de seguridad. Conviene conservar lo reciente.",
    porFilas: false,
    porAntiguedad: true,
  },
};

type Filas<T> = { rows: T[] };
const filas = async <T>(ej: Ejecutor, q: ReturnType<typeof sql>): Promise<T[]> => ((await ej.execute(q)) as unknown as Filas<T>).rows;
const num = (v: unknown): number => Number(v ?? 0);
const lista = (ids: number[]) => sql.join(ids.map((i) => sql`${i}`), sql`, `);

/* ------------------------------------------------------------------ */
/* Resumen                                                             */
/* ------------------------------------------------------------------ */

/** Documentos que cuentan como «sueltos o eliminados» (la condición, para reutilizarla al listar, descargar y purgar). */
const SQL_DOCUMENTOS = sql`(a.eliminado_en is not null or a.ambito = 'pendiente' or (a.id_expediente is not null and e.eliminado_en is not null) or (a.id_expediente is null and a.id_cliente is not null and c.eliminado_en is not null))`;
const SQL_DOCUMENTOS_JOIN = sql`from adjuntos a left join expedientes e on e.id_expediente = a.id_expediente left join clientes c on c.id = a.id_cliente`;

export async function resumenPapelera(ej: Ejecutor): Promise<InfoCategoria[]> {
  const [bib] = await filas<{ n: number; b: string }>(ej, sql`select count(*)::int n, coalesce(sum(tamano), 0)::bigint b from biblioteca where eliminado_en is not null`);
  const bibClases = await filas<{ c: string; n: number }>(ej, sql`select categoria c, count(*)::int n from biblioteca where eliminado_en is not null group by categoria`);
  const [ele] = await filas<{ n: number; b: string }>(ej, sql`select count(*)::int n, coalesce(sum(bytes), 0)::bigint b from papelera_elementos`);
  const eleTipos = await filas<{ t: string; n: number }>(ej, sql`select tipo t, count(*)::int n from papelera_elementos group by tipo`);
  const [docTipos, catTablas] = await Promise.all([
    filas<{ tipo: string; n: number }>(ej, sql`select a.tipo, count(*)::int n ${SQL_DOCUMENTOS_JOIN} where ${SQL_DOCUMENTOS} group by a.tipo`),
    filas<{ tabla: string; n: number }>(ej, sql`select 'marcas' tabla, count(*)::int n from marcas where eliminado_en is not null union all select 'modelos', count(*)::int from modelos where eliminado_en is not null union all select 'tipo_de_venta', count(*)::int from tipo_de_venta where eliminado_en is not null union all select 'estado_vehiculo', count(*)::int from estado_vehiculo where eliminado_en is not null union all select 'tiendas', count(*)::int from tiendas where eliminado_en is not null`),
  ]);
  const [expe, cli, doc, cat, his, lec, aud] = await Promise.all([
    filas<{ n: number; b: string }>(ej, sql`select count(*)::int n, coalesce(sum(pg_column_size(e.*)), 0)::bigint b from expedientes e where e.eliminado_en is not null`),
    filas<{ n: number; b: string }>(ej, sql`select count(*)::int n, coalesce(sum(pg_column_size(c.*)), 0)::bigint b from clientes c where c.eliminado_en is not null`),
    filas<{ n: number; b: string }>(ej, sql`select count(*)::int n, coalesce(sum(a.tamano), 0)::bigint b ${SQL_DOCUMENTOS_JOIN} where ${SQL_DOCUMENTOS}`),
    filas<{ n: number }>(ej, sql`select (select count(*) from marcas where eliminado_en is not null) + (select count(*) from modelos where eliminado_en is not null) + (select count(*) from tipo_de_venta where eliminado_en is not null) + (select count(*) from estado_vehiculo where eliminado_en is not null) + (select count(*) from tiendas where eliminado_en is not null) as n`),
    filas<{ n: number; b: string }>(ej, sql`select (select count(*) from historial_cambios)::int n, pg_total_relation_size('historial_cambios') b`),
    filas<{ n: number; b: string }>(ej, sql`select (select count(*) from lecturas_pedidos where estado in ('descartado', 'cancelado', 'pedido', 'error'))::int n, pg_total_relation_size('lecturas_pedidos') b`),
    filas<{ n: number; b: string }>(ej, sql`select (select count(*) from auditoria)::int n, pg_total_relation_size('auditoria') b`),
  ]);
  // Los documentos de los expedientes y clientes eliminados se cuentan aparte, en «Documentos»
  const dato = (categoria: Categoria, cantidad: number, bytes: number, porSubtipo?: Record<string, number>): InfoCategoria => ({ categoria, ...TEXTOS[categoria], cantidad, bytes, porSubtipo, restaurable: (CATEGORIAS_RESTAURABLES as readonly string[]).includes(categoria) });
  return [
    dato("expedientes", num(expe[0]?.n), num(expe[0]?.b)),
    dato("clientes", num(cli[0]?.n), num(cli[0]?.b)),
    dato("documentos", num(doc[0]?.n), num(doc[0]?.b), Object.fromEntries(docTipos.map((x) => [x.tipo, num(x.n)]))),
    dato("biblioteca", num(bib?.n), num(bib?.b), Object.fromEntries(bibClases.map((x) => [x.c, num(x.n)]))),
    dato("elementos", num(ele?.n), num(ele?.b), Object.fromEntries(eleTipos.map((x) => [x.t, num(x.n)]))),
    dato("catalogo", num(cat[0]?.n), 0, Object.fromEntries(catTablas.map((x) => [x.tabla, num(x.n)]))),
    dato("historial", num(his[0]?.n), num(his[0]?.b)),
    dato("lecturas", num(lec[0]?.n), num(lec[0]?.b)),
    dato("auditoria", num(aud[0]?.n), num(aud[0]?.b)),
  ];
}

/* ------------------------------------------------------------------ */
/* Filas de cada categoría                                             */
/* ------------------------------------------------------------------ */

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);
const fechaCorta = (v: unknown): string => (v ? new Date(v as string).toLocaleDateString("es-ES") : "—");
const mb = (b: number): string => (b >= 1048576 ? `${(b / 1048576).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB` : b >= 1024 ? `${Math.round(b / 1024).toLocaleString("es-ES")} KB` : `${b} B`);

/** Por qué una tabla del catálogo no se puede purgar todavía (null si se puede). Una sola consulta por elemento. */
async function bloqueosCatalogo(ej: Ejecutor): Promise<Map<string, string>> {
  const r = await filas<{ clave: string; motivo: string }>(
    ej,
    sql`
    select 'tiendas:' || t.id_tienda as clave, 'Aún la usan ' || (select count(*) from expedientes x where x.id_tienda = t.id_tienda) + (select count(*) from clientes x where x.tienda_id = t.id_tienda) || ' expedientes o clientes' as motivo
      from tiendas t where t.eliminado_en is not null and (exists (select 1 from expedientes x where x.id_tienda = t.id_tienda) or exists (select 1 from clientes x where x.tienda_id = t.id_tienda))
    union all
    select 'tipo_de_venta:' || t.id_tipo_de_venta, 'Aún la usan ' || (select count(*) from expedientes x where x.id_tipo_de_venta = t.id_tipo_de_venta) || ' expedientes'
      from tipo_de_venta t where t.eliminado_en is not null and exists (select 1 from expedientes x where x.id_tipo_de_venta = t.id_tipo_de_venta)
    union all
    select 'estado_vehiculo:' || t.id_estado_vehiculo, 'Aún lo usan ' || (select count(*) from expedientes x where x.id_estado_vehiculo = t.id_estado_vehiculo) || ' expedientes'
      from estado_vehiculo t where t.eliminado_en is not null and exists (select 1 from expedientes x where x.id_estado_vehiculo = t.id_estado_vehiculo)
    union all
    select 'modelos:' || m.id_modelo, 'Aún lo usan expedientes o planes de comisiones'
      from modelos m where m.eliminado_en is not null and (exists (select 1 from expedientes x where x.id_modelo = m.id_modelo) or exists (select 1 from commission_plan_model_rates x where x.id_modelo = m.id_modelo) or exists (select 1 from commission_model_points x where x.id_modelo = m.id_modelo) or exists (select 1 from commission_rules x where x.id_modelo = m.id_modelo) or exists (select 1 from commission_bonus_rules x where x.id_modelo = m.id_modelo) or exists (select 1 from commission_preference_rules x where x.id_modelo = m.id_modelo))
    union all
    select 'marcas:' || k.id_marca, 'Aún tiene modelos vigentes o la usan planes de comisiones'
      from marcas k where k.eliminado_en is not null and (exists (select 1 from modelos m where m.marca_id = k.id_marca and m.eliminado_en is null) or exists (select 1 from commission_finance_rates x where x.id_marca = k.id_marca) or exists (select 1 from commission_brand_intervention_rates x where x.id_marca = k.id_marca) or exists (select 1 from commission_rules x where x.id_marca = k.id_marca) or exists (select 1 from commission_bonus_rules x where x.id_marca = k.id_marca) or exists (select 1 from commission_preference_rules x where x.id_marca = k.id_marca))`,
  );
  const mapa = new Map(r.map((x) => [x.clave, x.motivo]));
  // Las marcas y los modelos están grabados a fuego: nunca se purgan (si alguno quedó «eliminado» de antes, se restaura)
  const fuego = await filas<{ clave: string }>(ej, sql`select 'marcas:' || id_marca clave from marcas where eliminado_en is not null union all select 'modelos:' || id_modelo from modelos where eliminado_en is not null`);
  for (const f of fuego) mapa.set(f.clave, "Grabado a fuego: no se puede purgar (restáuralo)");
  return mapa;
}

/** Qué documentos se miran: los leídos y nunca vinculados, los eliminados (o de algo eliminado), o ambos. */
export type MotivoDocumentos = "sin_vincular" | "eliminados";

export async function filasPapelera(ej: Ejecutor, categoria: Categoria, limite = 500, motivo?: MotivoDocumentos): Promise<{ total: number; filas: FilaPapelera[] }> {
  const lim = sql.raw(String(limite));
  const condDocs = motivo === "sin_vincular" ? sql`(a.ambito = 'pendiente' and a.eliminado_en is null)` : motivo === "eliminados" ? sql`(a.eliminado_en is not null or (a.ambito <> 'pendiente' and ((a.id_expediente is not null and e.eliminado_en is not null) or (a.id_expediente is null and a.id_cliente is not null and c.eliminado_en is not null))))` : SQL_DOCUMENTOS;
  if (categoria === "expedientes") {
    const r = await filas<{ id: number; cliente: string | null; matricula: string | null; eliminado_en: string; docs: number; bytes: string }>(
      ej,
      sql`select e.id_expediente id, c.nombre cliente, e.matricula, e.eliminado_en, (select count(*) from adjuntos a where a.id_expediente = e.id_expediente)::int docs, (coalesce((select sum(a.tamano) from adjuntos a where a.id_expediente = e.id_expediente), 0) + pg_column_size(e.*))::bigint bytes from expedientes e left join clientes c on c.id = e.id_cliente where e.eliminado_en is not null order by bytes desc, e.id_expediente desc limit ${lim}`,
    );
    const [{ n }] = await filas<{ n: number }>(ej, sql`select count(*)::int n from expedientes where eliminado_en is not null`);
    return { total: num(n), filas: r.map((x) => ({ id: String(x.id), texto: `Exp. ${x.id}${x.cliente ? ` · ${x.cliente}` : ""}${x.matricula ? ` · ${x.matricula}` : ""}`, detalle: `Eliminado el ${fechaCorta(x.eliminado_en)} · ${x.docs} documento${x.docs === 1 ? "" : "s"}`, bytes: num(x.bytes), eliminadoEn: iso(x.eliminado_en), documentos: x.docs, subtipo: "", bloqueo: null })) };
  }
  if (categoria === "clientes") {
    const r = await filas<{ id: number; nombre: string | null; dni: string | null; eliminado_en: string; exps: number; docs: number; bytes: string }>(
      ej,
      sql`select c.id, c.nombre, c.dni, c.eliminado_en, (select count(*) from expedientes e where e.id_cliente = c.id)::int exps, (select count(*) from adjuntos a where a.id_cliente = c.id)::int docs, (coalesce((select sum(a.tamano) from adjuntos a where a.id_cliente = c.id), 0) + pg_column_size(c.*))::bigint bytes from clientes c where c.eliminado_en is not null order by bytes desc, c.id desc limit ${lim}`,
    );
    const [{ n }] = await filas<{ n: number }>(ej, sql`select count(*)::int n from clientes where eliminado_en is not null`);
    return {
      total: num(n),
      filas: r.map((x) => ({ id: String(x.id), texto: `${x.nombre ?? "(sin nombre)"}${x.dni ? ` · ${x.dni}` : ""}`, detalle: `Eliminado el ${fechaCorta(x.eliminado_en)} · ${x.docs} documento${x.docs === 1 ? "" : "s"}`, bytes: num(x.bytes), eliminadoEn: iso(x.eliminado_en), documentos: x.docs, subtipo: "", bloqueo: x.exps > 0 ? `Tiene ${x.exps} expediente${x.exps === 1 ? "" : "s"} (elimínalos primero)` : null })),
    };
  }
  if (categoria === "documentos") {
    const r = await filas<{ id: number; nombre: string; tipo: string; tamano: string; creado_en: string; eliminado_en: string | null; ambito: string; eid: number | null; cid: number | null; e_elim: boolean | null; c_elim: boolean | null }>(
      ej,
      sql`select a.id, a.nombre, a.tipo, a.tamano::bigint tamano, a.creado_en, a.eliminado_en, a.ambito, e.id_expediente eid, c.id cid, (e.eliminado_en is not null) e_elim, (c.eliminado_en is not null) c_elim ${SQL_DOCUMENTOS_JOIN} where ${condDocs} order by a.tamano desc, a.id desc limit ${lim}`,
    );
    const [{ n }] = await filas<{ n: number }>(ej, sql`select count(*)::int n ${SQL_DOCUMENTOS_JOIN} where ${condDocs}`);
    return {
      total: num(n),
      filas: r.map((x) => ({
        id: String(x.id),
        texto: x.nombre,
        detalle: `${x.eliminado_en ? "Documento eliminado" : x.ambito === "pendiente" ? "Sin vincular" : x.eid && x.e_elim ? `Del expediente eliminado ${x.eid}` : "Del cliente eliminado"} · ${x.tipo} · subido el ${fechaCorta(x.creado_en)} · ${mb(num(x.tamano))}`,
        bytes: num(x.tamano),
        eliminadoEn: iso(x.eliminado_en),
        documentos: 1,
        subtipo: x.tipo,
        bloqueo: null,
      })),
    };
  }
  if (categoria === "catalogo") {
    const bloqueos = await bloqueosCatalogo(ej);
    const r = await filas<{ clave: string; texto: string; eliminado_en: string }>(
      ej,
      sql`select 'marcas:' || id_marca clave, 'Marca ' || nombre texto, eliminado_en from marcas where eliminado_en is not null
        union all select 'modelos:' || m.id_modelo, 'Modelo ' || coalesce(k.nombre || ' ', '') || m.nombre_modelo, m.eliminado_en from modelos m left join marcas k on k.id_marca = m.marca_id where m.eliminado_en is not null
        union all select 'tipo_de_venta:' || id_tipo_de_venta, 'Forma de pago ' || nombre_tipo_venta, eliminado_en from tipo_de_venta where eliminado_en is not null
        union all select 'estado_vehiculo:' || id_estado_vehiculo, 'Estado de vehículo ' || nombre_estado_vehiculo, eliminado_en from estado_vehiculo where eliminado_en is not null
        union all select 'tiendas:' || id_tienda, 'Tienda ' || nombre, eliminado_en from tiendas where eliminado_en is not null
        order by 2 limit ${lim}`,
    );
    return { total: r.length, filas: r.map((x) => ({ id: x.clave, texto: x.texto, detalle: `Eliminado el ${fechaCorta(x.eliminado_en)}`, bytes: 0, eliminadoEn: iso(x.eliminado_en), documentos: 0, subtipo: x.clave.split(":")[0], bloqueo: bloqueos.get(x.clave) ?? null })) };
  }
  if (categoria === "biblioteca") {
    const r = await filas<{ id: number; nombre: string; nombre_original: string | null; categoria: string; tamano: string; eliminado_en: string; id_cliente: number | null; id_expediente: number | null }>(
      ej,
      sql`select id, nombre, nombre_original, categoria, tamano::bigint tamano, eliminado_en, id_cliente, id_expediente from biblioteca where eliminado_en is not null order by eliminado_en desc, id desc limit ${lim}`,
    );
    const [{ n }] = await filas<{ n: number }>(ej, sql`select count(*)::int n from biblioteca where eliminado_en is not null`);
    return {
      total: num(n),
      filas: r.map((x) => ({ id: String(x.id), texto: x.nombre, detalle: `Eliminado el ${fechaCorta(x.eliminado_en)} · ${x.categoria}${x.nombre_original && x.nombre_original !== x.nombre ? ` · se subió como «${x.nombre_original}»` : ""} · ${mb(num(x.tamano))}`, bytes: num(x.tamano), eliminadoEn: iso(x.eliminado_en), documentos: 1, subtipo: x.categoria, bloqueo: null })),
    };
  }
  if (categoria === "elementos") {
    const r = await filas<{ id: number; tipo: string; etiqueta: string; detalle: string | null; bytes: number; eliminado_en: string }>(ej, sql`select id, tipo, etiqueta, detalle, bytes, eliminado_en from papelera_elementos order by eliminado_en desc, id desc limit ${lim}`);
    const [{ n }] = await filas<{ n: number }>(ej, sql`select count(*)::int n from papelera_elementos`);
    return { total: num(n), filas: r.map((x) => ({ id: String(x.id), texto: x.etiqueta, detalle: `${TEXTO_TIPO[x.tipo as TipoElemento]?.singular ?? x.tipo}${x.detalle ? ` · ${x.detalle}` : ""} · eliminado el ${fechaCorta(x.eliminado_en)}`, bytes: num(x.bytes), eliminadoEn: iso(x.eliminado_en), documentos: 0, subtipo: x.tipo, bloqueo: null })) };
  }
  if (categoria === "historial") {
    const r = await filas<{ id: string; en: string; accion: string; tabla: string; operacion: string; usuario: string | null; bytes: string }>(
      ej,
      sql`select h.id, h.en, h.accion, h.tabla, h.operacion, u.nombre usuario, pg_column_size(h.*)::bigint bytes from historial_cambios h left join usuarios u on u.id_usuario = h.id_usuario order by h.id desc limit ${lim}`,
    );
    const [{ n }] = await filas<{ n: number }>(ej, sql`select count(*)::int n from historial_cambios`);
    return { total: num(n), filas: r.map((x) => ({ id: String(x.id), texto: `${x.accion} · ${x.tabla} (${x.operacion === "D" ? "borrado" : x.operacion === "I" ? "alta" : "cambio"})`, detalle: `${new Date(x.en).toLocaleString("es-ES")}${x.usuario ? ` · ${x.usuario}` : ""}`, bytes: num(x.bytes), eliminadoEn: null, documentos: 0, subtipo: "", bloqueo: null })) };
  }
  if (categoria === "lecturas") {
    const r = await filas<{ id: number; nombre: string; estado: string; creada_en: string; bytes: string }>(
      ej,
      sql`select id, nombre, estado, creada_en, pg_column_size(l.*)::bigint bytes from lecturas_pedidos l where estado in ('descartado', 'cancelado', 'pedido', 'error') order by id desc limit ${lim}`,
    );
    const [{ n }] = await filas<{ n: number }>(ej, sql`select count(*)::int n from lecturas_pedidos where estado in ('descartado', 'cancelado', 'pedido', 'error')`);
    return { total: num(n), filas: r.map((x) => ({ id: String(x.id), texto: x.nombre, detalle: `${x.estado} · ${new Date(x.creada_en).toLocaleString("es-ES")}`, bytes: num(x.bytes), eliminadoEn: null, documentos: 0, subtipo: "", bloqueo: null })) };
  }
  const r = await filas<{ id: number; accion: string; entidad: string | null; en: string; bytes: string }>(ej, sql`select id, accion, entidad, en, pg_column_size(a.*)::bigint bytes from auditoria a order by id desc limit ${lim}`).catch(() => []);
  const [{ n }] = await filas<{ n: number }>(ej, sql`select count(*)::int n from auditoria`);
  return { total: num(n), filas: r.map((x) => ({ id: String(x.id), texto: `${x.accion}${x.entidad ? ` · ${x.entidad}` : ""}`, detalle: new Date(x.en).toLocaleString("es-ES"), bytes: num(x.bytes), eliminadoEn: null, documentos: 0, subtipo: "", bloqueo: null })) };
}

/* ------------------------------------------------------------------ */
/* Descarga                                                            */
/* ------------------------------------------------------------------ */

const idsNumericos = (ids: string[]): number[] => ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);

/** Contenido completo de lo que se va a purgar (o de lo elegido), en JSON, para guardarlo antes. Los documentos van sin su archivo. */
export async function descargarPapelera(ej: Ejecutor, categoria: Categoria, ids: string[] | null): Promise<Record<string, unknown>> {
  const n = ids ? idsNumericos(ids) : null;
  const filtro = (col: ReturnType<typeof sql>) => (n ? sql`and ${col} in (${lista(n)})` : sql``);
  let datos: unknown[] = [];
  if (categoria === "expedientes") {
    datos = await filas(ej, sql`select to_jsonb(e) as expediente, (select coalesce(jsonb_agg(to_jsonb(a) ), '[]'::jsonb) from adjuntos a where a.id_expediente = e.id_expediente) as documentos, (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from validaciones_comision v where v.id_expediente = e.id_expediente) as validaciones from expedientes e where e.eliminado_en is not null ${filtro(sql`e.id_expediente`)} order by e.id_expediente`);
  } else if (categoria === "clientes") {
    datos = await filas(ej, sql`select to_jsonb(c) as cliente, (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from emails_clientes m where m.id_cliente = c.id) as correos, (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from telefonos_clientes t where t.id_cliente = c.id) as telefonos, (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from adjuntos a where a.id_cliente = c.id) as documentos from clientes c where c.eliminado_en is not null ${filtro(sql`c.id`)} order by c.id`);
  } else if (categoria === "documentos") {
    datos = await filas(ej, sql`select to_jsonb(a) as documento ${SQL_DOCUMENTOS_JOIN} where ${SQL_DOCUMENTOS} ${filtro(sql`a.id`)} order by a.id`);
  } else if (categoria === "elementos") {
    datos = await filas(ej, sql`select case when e.tipo = 'usuario' then to_jsonb(e) - 'datos' else to_jsonb(e) end as elemento from papelera_elementos e where true ${filtro(sql`e.id`)} order by e.id`);
  } else if (categoria === "biblioteca") {
    datos = await filas(ej, sql`select to_jsonb(b) as archivo from biblioteca b where eliminado_en is not null ${filtro(sql`b.id`)} order by b.id`);
  } else if (categoria === "catalogo") {
    datos = await filas(ej, sql`select 'marcas' tabla, to_jsonb(x) fila from marcas x where eliminado_en is not null union all select 'modelos', to_jsonb(x) from modelos x where eliminado_en is not null union all select 'tipo_de_venta', to_jsonb(x) from tipo_de_venta x where eliminado_en is not null union all select 'estado_vehiculo', to_jsonb(x) from estado_vehiculo x where eliminado_en is not null union all select 'tiendas', to_jsonb(x) from tiendas x where eliminado_en is not null`);
  } else if (categoria === "historial") {
    datos = await filas(ej, sql`select to_jsonb(h) as cambio from historial_cambios h order by id`);
  } else if (categoria === "lecturas") {
    datos = await filas(ej, sql`select to_jsonb(l) - 'datos' as lectura from lecturas_pedidos l where estado in ('descartado', 'cancelado', 'pedido', 'error') order by id`);
  } else {
    datos = await filas(ej, sql`select to_jsonb(a) as registro from auditoria a order by id`);
  }
  return { app: "GestorVentasPi", categoria, titulo: TEXTOS[categoria].titulo, exportadoEn: new Date().toISOString(), registros: datos.length, datos };
}

export interface DocumentoDeFila {
  id: number;
  nombre: string;
  tipo: string;
  mime: string;
  tamano: number;
  creadoEn: string;
  eliminado: boolean;
}

/** Los documentos de un expediente o de un cliente (también los eliminados), para verlos antes de decidir. */
export async function documentosDeFila(ej: Ejecutor, categoria: Categoria, id: number): Promise<DocumentoDeFila[]> {
  if (categoria === "biblioteca") {
    const r = await filas<{ id: number; nombre: string; categoria: string; mime: string; tamano: number; creado_en: string }>(ej, sql`select id, nombre, categoria, mime, tamano, creado_en from biblioteca where id = ${id}`);
    return r.map((x) => ({ id: x.id, nombre: x.nombre, tipo: x.categoria, mime: x.mime, tamano: num(x.tamano), creadoEn: iso(x.creado_en) ?? "", eliminado: true }));
  }
  if (categoria !== "expedientes" && categoria !== "clientes" && categoria !== "documentos") return [];
  const donde = categoria === "expedientes" ? sql`a.id_expediente = ${id}` : categoria === "clientes" ? sql`a.id_cliente = ${id}` : sql`a.id = ${id}`;
  const r = await filas<{ id: number; nombre: string; tipo: string; mime: string; tamano: string; creado_en: string; eliminado: boolean }>(ej, sql`select a.id, a.nombre, a.tipo, a.mime, a.tamano::bigint tamano, a.creado_en, (a.eliminado_en is not null) eliminado from adjuntos a where ${donde} order by a.id`);
  return r.map((x) => ({ id: x.id, nombre: x.nombre, tipo: x.tipo, mime: x.mime, tamano: num(x.tamano), creadoEn: iso(x.creado_en) ?? "", eliminado: x.eliminado }));
}

/** Un documento cualquiera (también eliminado o sin vincular), descifrado, para descargarlo desde la papelera. */
export async function leerDocumentoPapelera(ej: Ejecutor, id: number, origen: "adjuntos" | "biblioteca" = "adjuntos"): Promise<{ nombre: string; mime: string; datos: Buffer }> {
  const [a] = await filas<{ nombre: string; mime: string; datos: Buffer }>(
    ej,
    origen === "biblioteca" ? sql`select a.nombre, a.mime, coalesce(d.datos, c.datos) as datos from biblioteca a join biblioteca_datos d on d.id_archivo = a.id left join contenidos_compartidos c on c.hash = d.contenido_hash where a.id = ${id}` : sql`select a.nombre, a.mime, coalesce(d.datos, c.datos) as datos from adjuntos a join adjuntos_datos d on d.id_adjunto = a.id left join contenidos_compartidos c on c.hash = d.contenido_hash where a.id = ${id}`,
  );
  if (!a) throw new HttpError(404, "Documento no encontrado");
  return { nombre: a.nombre, mime: a.mime, datos: descifrarBuffer(a.datos) };
}

/* ------------------------------------------------------------------ */
/* Purga                                                               */
/* ------------------------------------------------------------------ */

export const esquemaPurga = z.object({
  categoria: z.enum(CATEGORIAS),
  /** Filas elegidas; sin ellas (y con `todo`) se purga toda la categoría. */
  ids: z.array(z.string().min(1).max(60)).max(100000).optional(),
  todo: z.boolean().optional(),
  /** Para el historial, las lecturas y la auditoría: solo lo anterior a tantos días. */
  antesDeDias: z.number().int().min(0).max(36500).optional(),
  /** Incluye los documentos leídos y nunca vinculados (con «todo»). */
  confirmacion: z.string(),
});
export const esquemaCompactar = z.object({ accion: z.literal("compactar") });
export const esquemaAFondo = z.object({
  accion: z.literal("a_fondo"),
  confirmacion: z.string(),
  /** También purga los documentos leídos y nunca vinculados (pueden estar en tu cola de pedidos). */
  incluirSinVincular: z.boolean().default(false),
  /** Conservar el historial de deshacer y rehacer. */
  conservarHistorial: z.boolean().default(true),
  /** Vaciar también el registro de auditoría (queda solo la anotación de esta purga). */
  vaciarAuditoria: z.boolean().default(false),
});

export interface ResultadoPurga {
  purgados: number;
  /** Elementos que se han dejado porque algo los impide (con el motivo en la lista). */
  bloqueados: number;
  copiaPrevia: string | null;
  detalle: string[];
}

const SIN_HISTORIAL = sql`select set_config('app.hist_grupo', '', true)`;

/** Borra del diario de deshacer las filas que hablan de lo que se acaba de purgar (si no, seguirían guardando una copia de sus datos). */
async function limpiarDiario(tx: Ejecutor, tabla: string, columna: string, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await tx.execute(sql`delete from historial_cambios where tabla = ${tabla} and coalesce(antes ->> ${columna}, despues ->> ${columna}, pk ->> ${columna}) in (${sql.join(ids.map((i) => sql`${String(i)}`), sql`, `)})`);
}

async function purgarExpedientes(tx: Ejecutor, ids: number[]): Promise<number> {
  const ok = (await filas<{ id: number }>(tx, sql`select id_expediente id from expedientes where eliminado_en is not null and id_expediente in (${lista(ids)})`)).map((x) => x.id);
  if (ok.length === 0) return 0;
  await tx.execute(sql`delete from validaciones_comision where id_expediente in (${lista(ok)})`);
  await tx.execute(sql`delete from adjuntos where id_expediente in (${lista(ok)})`);
  await tx.execute(sql`update lecturas_pedidos set id_expediente = null where id_expediente in (${lista(ok)})`);
  await tx.execute(sql`delete from expedientes where id_expediente in (${lista(ok)})`);
  await limpiarDiario(tx, "expedientes", "id_expediente", ok);
  await limpiarDiario(tx, "validaciones_comision", "id_expediente", ok);
  return ok.length;
}

async function purgarClientes(tx: Ejecutor, ids: number[]): Promise<{ purgados: number; bloqueados: number }> {
  const elegibles = await filas<{ id: number; libre: boolean }>(tx, sql`select c.id, not exists (select 1 from expedientes e where e.id_cliente = c.id) libre from clientes c where c.eliminado_en is not null and c.id in (${lista(ids)})`);
  const ok = elegibles.filter((x) => x.libre).map((x) => x.id);
  if (ok.length > 0) {
    await tx.execute(sql`delete from adjuntos where id_cliente in (${lista(ok)})`);
    await tx.execute(sql`delete from clientes where id in (${lista(ok)})`);
    await limpiarDiario(tx, "clientes", "id", ok);
    await limpiarDiario(tx, "emails_clientes", "id_cliente", ok);
    await limpiarDiario(tx, "telefonos_clientes", "id_cliente", ok);
  }
  return { purgados: ok.length, bloqueados: elegibles.length - ok.length };
}

async function purgarElementos(tx: Ejecutor, ids: number[]): Promise<number> {
  await borrarFicherosDeCopias(tx, ids);
  const r = await tx.execute(sql`delete from papelera_elementos where id in (${lista(ids)}) returning id`);
  return (r as unknown as Filas<unknown>).rows.length;
}

async function purgarBiblioteca(tx: Ejecutor, ids: number[]): Promise<number> {
  const r = await tx.execute(sql`delete from biblioteca where eliminado_en is not null and id in (${lista(ids)}) returning id`);
  return (r as unknown as Filas<unknown>).rows.length;
}

async function purgarDocumentos(tx: Ejecutor, ids: number[]): Promise<number> {
  const ok = (await filas<{ id: number }>(tx, sql`select a.id ${SQL_DOCUMENTOS_JOIN} where a.id in (${lista(ids)}) and ${SQL_DOCUMENTOS}`)).map((x) => x.id);
  if (ok.length === 0) return 0;
  await tx.execute(sql`update clientes set foto_adjunto_id = null where foto_adjunto_id in (${lista(ok)})`);
  await tx.execute(sql`delete from adjuntos where id in (${lista(ok)})`);
  return ok.length;
}

/** Catálogos: primero los modelos, después las marcas (una marca solo se va si ya no le quedan modelos vigentes ni planes que la usen). */
async function purgarCatalogo(tx: Ejecutor, claves: string[]): Promise<{ purgados: number; bloqueados: number }> {
  const bloqueos = await bloqueosCatalogo(tx);
  const porTabla = new Map<string, number[]>();
  for (const c of claves) {
    const [tabla, id] = c.split(":");
    if (!["marcas", "modelos", "tipo_de_venta", "estado_vehiculo", "tiendas"].includes(tabla) || !Number.isInteger(Number(id))) continue;
    porTabla.set(tabla, [...(porTabla.get(tabla) ?? []), Number(id)]);
  }
  const PK: Record<string, string> = { marcas: "id_marca", modelos: "id_modelo", tipo_de_venta: "id_tipo_de_venta", estado_vehiculo: "id_estado_vehiculo", tiendas: "id_tienda" };
  let purgados = 0;
  let bloqueados = 0;
  for (const tabla of ["modelos", "marcas", "tipo_de_venta", "estado_vehiculo", "tiendas"]) {
    const todos = porTabla.get(tabla) ?? [];
    const libres = todos.filter((id) => !bloqueos.has(`${tabla}:${id}`));
    bloqueados += todos.length - libres.length;
    if (libres.length === 0) continue;
    const r = await tx.execute(sql`delete from ${sql.raw(tabla)} where ${sql.raw(PK[tabla])} in (${lista(libres)}) and eliminado_en is not null returning ${sql.raw(PK[tabla])} as id`);
    purgados += (r as unknown as Filas<unknown>).rows.length;
    await limpiarDiario(tx, tabla, PK[tabla], libres);
    // Las marcas se miran después de purgar sus modelos: si ya no les quedan vigentes, dejan de estar bloqueadas
    if (tabla === "modelos") for (const id of libres) bloqueos.delete(`modelos:${id}`);
  }
  return { purgados, bloqueados };
}

/** Cómo cuenta una purga su avance (y si la han cancelado). Sin tarea en segundo plano no hace nada. */
export type ProgresoPurga = Pick<ContextoTarea, "avance" | "cancelada">;
const SIN_PROGRESO: ProgresoPurga = { avance: () => undefined, cancelada: () => false };

/**
 * Hace una purga grande por lotes pequeños, cada uno en su propia transacción: no se queda una orden gigante bloqueando la base, se
 * ve el avance y se puede cancelar entre lote y lote (lo ya purgado, purgado está; antes siempre hay una copia de seguridad).
 */
async function purgarPorLotes(ej: Ejecutor, ids: number[], tamano: number, nombre: string, progreso: ProgresoPurga, hacer: (tx: Ejecutor, lote: number[]) => Promise<number>, base = { hecho: 0, total: ids.length }): Promise<number> {
  let purgados = 0;
  progreso.avance(base.hecho, base.total, `${nombre}: ${base.hecho.toLocaleString("es-ES")} de ${base.total.toLocaleString("es-ES")}`);
  for (let i = 0; i < ids.length; i += tamano) {
    if (progreso.cancelada()) throw new TareaCancelada(`Se ha parado a mitad: ${purgados.toLocaleString("es-ES")} de ${ids.length.toLocaleString("es-ES")} ${nombre.toLowerCase()} purgados (el resto sigue en la papelera)`);
    const lote = ids.slice(i, i + tamano);
    purgados += await ej.transaction(async (tx) => {
      await tx.execute(SIN_HISTORIAL);
      return hacer(tx, lote);
    });
    const hecho = base.hecho + Math.min(i + tamano, ids.length);
    progreso.avance(hecho, base.total, `${nombre}: ${hecho.toLocaleString("es-ES")} de ${base.total.toLocaleString("es-ES")}`);
  }
  return purgados;
}

/** Limpia el espacio que dejan los borrados (VACUUM normal: no bloquea la aplicación). Si no se puede (dentro de una transacción), no pasa nada. */
async function limpiarEspacio(ej: Ejecutor, tablas: string[], progreso: ProgresoPurga): Promise<void> {
  progreso.avance(0, 0, "Limpiando el espacio que ocupaban los datos borrados…");
  for (const t of tablas) await ej.execute(sql.raw(`vacuum "${t}"`)).catch(() => undefined);
}

/** Purga una categoría (o lo elegido de ella). Guarda antes una copia de seguridad completa; si no puede, no borra nada. */
export async function purgar(ej: Ejecutor, idAdmin: number, entrada: z.infer<typeof esquemaPurga>, progreso: ProgresoPurga = SIN_PROGRESO): Promise<ResultadoPurga> {
  if (entrada.confirmacion.trim().toUpperCase() !== "PURGAR") throw new HttpError(400, "Escribe PURGAR para confirmar");
  const { categoria } = entrada;
  const dias = entrada.antesDeDias;
  const porIds = !entrada.todo && !!entrada.ids && entrada.ids.length > 0;
  if (!entrada.todo && !porIds && dias === undefined) throw new HttpError(400, "No hay nada elegido para purgar: elige filas, purga todo o indica de cuántos días atrás");
  let copiaPrevia: string | null = null;
  progreso.avance(0, 0, "Haciendo la copia de seguridad previa…");
  try {
    copiaPrevia = (await crearCopia(ej, "previa", idAdmin, `Antes de purgar «${TEXTOS[categoria].titulo}». Restáurala si algo no era lo que esperabas.`)).nombre;
  } catch (e) {
    throw new HttpError(500, `No se ha purgado nada: no se pudo crear la copia de seguridad previa (${e instanceof Error ? e.message : "error desconocido"}).`);
  }
  const todosLosIds = async (): Promise<string[]> => (await filasPapelera(ej, categoria, 100000)).filas.map((f) => f.id);
  const ids = entrada.ids && !entrada.todo ? entrada.ids : categoria === "historial" || categoria === "lecturas" || categoria === "auditoria" ? [] : await todosLosIds();
  const res: ResultadoPurga = { purgados: 0, bloqueados: 0, copiaPrevia, detalle: [] };
  // Documentos y expedientes pueden ser muchísimos (y pesados): por lotes pequeños y con avance
  if (categoria === "documentos") {
    res.purgados = await purgarPorLotes(ej, idsNumericos(ids), 20, "Documentos", progreso, (tx, lote) => purgarDocumentos(tx, lote));
    await limpiarEspacio(ej, ["adjuntos_datos", "adjuntos", "contenidos_compartidos"], progreso);
    return res;
  }
  if (categoria === "elementos") {
    res.purgados = await purgarPorLotes(ej, idsNumericos(ids), 100, "Elementos", progreso, (tx, lote) => purgarElementos(tx, lote));
    return res;
  }
  if (categoria === "biblioteca") {
    res.purgados = await purgarPorLotes(ej, idsNumericos(ids), 20, "Archivos de la biblioteca", progreso, (tx, lote) => purgarBiblioteca(tx, lote));
    await limpiarEspacio(ej, ["biblioteca_datos", "biblioteca", "contenidos_compartidos"], progreso);
    return res;
  }
  if (categoria === "expedientes") {
    res.purgados = await purgarPorLotes(ej, idsNumericos(ids), 50, "Expedientes", progreso, (tx, lote) => purgarExpedientes(tx, lote));
    await limpiarEspacio(ej, ["adjuntos_datos", "adjuntos", "expedientes", "contenidos_compartidos"], progreso);
    return res;
  }
  progreso.avance(0, 0, `Purgando ${TEXTOS[categoria].titulo.toLowerCase()}…`);
  return ej.transaction(async (tx) => {
    await tx.execute(SIN_HISTORIAL);
    if (categoria === "clientes") Object.assign(res, await purgarClientes(tx, idsNumericos(ids)));
    else if (categoria === "catalogo") Object.assign(res, await purgarCatalogo(tx, ids));
    else if (categoria === "historial") {
      const filtro = porIds ? sql`where id in (${lista(idsNumericos(ids))})` : dias !== undefined ? sql`where en < now() - (${dias} || ' days')::interval` : sql``;
      res.purgados = ((await tx.execute(sql`delete from historial_cambios ${filtro} returning id`)) as unknown as Filas<unknown>).rows.length;
    } else if (categoria === "lecturas") {
      const filtro = porIds ? sql`and id in (${lista(idsNumericos(ids))})` : dias !== undefined ? sql`and creada_en < now() - (${dias} || ' days')::interval` : sql``;
      res.purgados = ((await tx.execute(sql`delete from lecturas_pedidos where estado in ('descartado', 'cancelado', 'pedido', 'error') ${filtro} returning id`)) as unknown as Filas<unknown>).rows.length;
    } else {
      const filtro = porIds ? sql`where id in (${lista(idsNumericos(ids))})` : dias !== undefined ? sql`where en < now() - (${dias} || ' days')::interval` : sql``;
      res.purgados = ((await tx.execute(sql`delete from auditoria ${filtro} returning id`)) as unknown as Filas<unknown>).rows.length;
    }
    return res;
  });
}

/**
 * Purga a fondo: expedientes y clientes eliminados con todo lo suyo, documentos eliminados (y, si se pide, los sin vincular), catálogos
 * eliminados que nadie usa, y el registro de lecturas; por último compacta la base. Una sola copia previa para todo.
 */
export async function purgarAFondo(ej: Ejecutor, idAdmin: number, entrada: z.infer<typeof esquemaAFondo>, progreso: ProgresoPurga = SIN_PROGRESO): Promise<ResultadoPurga & { compactado: ResultadoCompactado | null }> {
  if (entrada.confirmacion.trim().toUpperCase() !== "PURGAR A FONDO") throw new HttpError(400, "Escribe PURGAR A FONDO para confirmar");
  let copiaPrevia: string;
  progreso.avance(0, 0, "Haciendo la copia de seguridad previa…");
  try {
    copiaPrevia = (await crearCopia(ej, "previa", idAdmin, "Antes de purgar a fondo la papelera. Restáurala si algo no era lo que esperabas.")).nombre;
  } catch (e) {
    throw new HttpError(500, `No se ha purgado nada: no se pudo crear la copia de seguridad previa (${e instanceof Error ? e.message : "error desconocido"}).`);
  }
  const detalle: string[] = [];
  let purgados = 0;
  let bloqueados = 0;
  const suma = (etiqueta: string, n: number) => {
    purgados += n;
    if (n > 0) detalle.push(`${n.toLocaleString("es-ES")} ${etiqueta}`);
  };
  const exps = (await filas<{ id: number }>(ej, sql`select id_expediente id from expedientes where eliminado_en is not null`)).map((x) => x.id);
  if (exps.length > 0) suma("expedientes eliminados", await purgarPorLotes(ej, exps, 50, "Expedientes", progreso, (tx, lote) => purgarExpedientes(tx, lote)));
  const clis = (await filas<{ id: number }>(ej, sql`select id from clientes where eliminado_en is not null`)).map((x) => x.id);
  if (clis.length > 0) {
    progreso.avance(0, 0, "Purgando clientes eliminados…");
    await ej.transaction(async (tx) => {
      await tx.execute(SIN_HISTORIAL);
      const r = await purgarClientes(tx, clis);
      suma("clientes eliminados", r.purgados);
      bloqueados += r.bloqueados;
    });
  }
  const docs = (
    await filas<{ id: number }>(ej, sql`select a.id ${SQL_DOCUMENTOS_JOIN} where ${SQL_DOCUMENTOS} ${entrada.incluirSinVincular ? sql`` : sql`and a.ambito <> 'pendiente'`}`)
  ).map((x) => x.id);
  if (docs.length > 0) suma("documentos", await purgarPorLotes(ej, docs, 20, "Documentos", progreso, (tx, lote) => purgarDocumentos(tx, lote)));
  const bibs = (await filas<{ id: number }>(ej, sql`select id from biblioteca where eliminado_en is not null`)).map((x) => x.id);
  if (bibs.length > 0) suma("archivos de la biblioteca", await purgarPorLotes(ej, bibs, 20, "Archivos de la biblioteca", progreso, (tx, lote) => purgarBiblioteca(tx, lote)));
  const eles = (await filas<{ id: number }>(ej, sql`select id from papelera_elementos`)).map((x) => x.id);
  if (eles.length > 0) suma("rejillas, plantillas y otros elementos", await purgarPorLotes(ej, eles, 100, "Elementos", progreso, (tx, lote) => purgarElementos(tx, lote)));
  progreso.avance(0, 0, "Purgando catálogos, lecturas y registros…");
  await ej.transaction(async (tx) => {
    await tx.execute(SIN_HISTORIAL);
    const claves = (await filasPapelera(tx, "catalogo", 100000)).filas.map((f) => f.id);
    if (claves.length > 0) {
      const r = await purgarCatalogo(tx, claves);
      suma("elementos de catálogo", r.purgados);
      bloqueados += r.bloqueados;
    }
    suma("registros de lecturas de pedidos", ((await tx.execute(sql`delete from lecturas_pedidos where estado in ('descartado', 'cancelado', 'pedido', 'error') returning id`)) as unknown as Filas<unknown>).rows.length);
    if (!entrada.conservarHistorial) suma("entradas del historial de deshacer", ((await tx.execute(sql`delete from historial_cambios returning id`)) as unknown as Filas<unknown>).rows.length);
    if (entrada.vaciarAuditoria) suma("anotaciones del registro de auditoría", ((await tx.execute(sql`delete from auditoria returning id`)) as unknown as Filas<unknown>).rows.length);
  });
  const compactado = await compactar(ej, progreso).catch(() => null);
  return { purgados, bloqueados, copiaPrevia, detalle, compactado };
}

/* ------------------------------------------------------------------ */
/* Compactar                                                           */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Restaurar                                                           */
/* ------------------------------------------------------------------ */

export const esquemaRestaurar = z.object({
  accion: z.literal("restaurar"),
  categoria: z.enum(CATEGORIAS_RESTAURABLES),
  ids: z.array(z.string().min(1).max(60)).min(1).max(100000),
});

export interface ResultadoRestaurar {
  restaurados: number;
  /** Los que se han dejado en la papelera porque algo lo impide (con el motivo en `detalle`). */
  bloqueados: number;
  detalle: string[];
}

const PK_CATALOGO: Record<string, string> = { marcas: "id_marca", modelos: "id_modelo", tipo_de_venta: "id_tipo_de_venta", estado_vehiculo: "id_estado_vehiculo", tiendas: "id_tienda" };

/**
 * Saca de la papelera lo elegido: vuelve a verse y a contar donde estaba. Los expedientes recalculan las comisiones de los meses que tocan
 * (también los cerrados, como al eliminarlos) y devuelven a su cliente si estaba eliminado. Lo que no se puede restaurar se deja donde estaba
 * y se explica por qué.
 */
export async function restaurar(ej: Ejecutor, entrada: z.infer<typeof esquemaRestaurar>, progreso: ProgresoPurga = SIN_PROGRESO): Promise<ResultadoRestaurar> {
  const res: ResultadoRestaurar = { restaurados: 0, bloqueados: 0, detalle: [] };
  const ids = entrada.categoria === "catalogo" ? entrada.ids : idsNumericos(entrada.ids);
  const total = ids.length;
  const avanzar = (hecho: number) => progreso.avance(hecho, total, `Restaurando: ${hecho.toLocaleString("es-ES")} de ${total.toLocaleString("es-ES")}`);
  avanzar(0);
  const parar = (hecho: number) => {
    if (progreso.cancelada()) throw new TareaCancelada(`Se ha parado a mitad: ${res.restaurados.toLocaleString("es-ES")} de ${total.toLocaleString("es-ES")} restaurados (el resto sigue en la papelera)`);
    return hecho;
  };

  if (entrada.categoria === "expedientes") {
    const numeros = ids as number[];
    for (let i = 0; i < numeros.length; i += 50) {
      parar(i);
      const lote = numeros.slice(i, i + 50);
      const { valor } = await conRecalculo(ej, lote, "Restaurado desde la Papelera", async (tx) => {
        const r = await filas<{ id: number; id_cliente: number | null }>(tx, sql`update expedientes set eliminado_en = null where eliminado_en is not null and id_expediente in (${lista(lote)}) returning id_expediente id, id_cliente`);
        const clientes = [...new Set(r.map((x) => x.id_cliente).filter((c): c is number => c !== null))];
        if (clientes.length > 0) await tx.execute(sql`update clientes set eliminado_en = null where eliminado_en is not null and id in (${lista(clientes)})`);
        return { valor: r.length, idsDespues: r.map((x) => x.id) };
      });
      res.restaurados += valor;
      avanzar(Math.min(i + 50, numeros.length));
    }
    res.bloqueados = total - res.restaurados;
    if (res.bloqueados > 0) res.detalle.push(`${res.bloqueados} ya no estaban en la papelera.`);
    return res;
  }

  if (entrada.categoria === "clientes") {
    const numeros = ids as number[];
    for (let i = 0; i < numeros.length; i += 200) {
      parar(i);
      const lote = numeros.slice(i, i + 200);
      const r = await filas<{ id: number }>(
        ej,
        sql`update clientes c set eliminado_en = null where c.eliminado_en is not null and c.id in (${lista(lote)}) and (c.dni is null or c.dni = '' or not exists (select 1 from clientes o where o.dni = c.dni and o.id <> c.id and o.eliminado_en is null)) returning c.id`,
      );
      res.restaurados += r.length;
      avanzar(Math.min(i + 200, numeros.length));
    }
    res.bloqueados = total - res.restaurados;
    if (res.bloqueados > 0) res.detalle.push(`${res.bloqueados} no se han restaurado: ya no estaban en la papelera o hay otro cliente vigente con el mismo DNI.`);
    return res;
  }

  if (entrada.categoria === "documentos") {
    const numeros = ids as number[];
    for (let i = 0; i < numeros.length; i += 200) {
      parar(i);
      const lote = numeros.slice(i, i + 200);
      const r = await filas<{ id: number }>(
        ej,
        sql`update adjuntos a set eliminado_en = null where a.eliminado_en is not null and a.id in (${lista(lote)}) and not exists (select 1 from expedientes e where e.id_expediente = a.id_expediente and e.eliminado_en is not null) and not exists (select 1 from clientes c where c.id = a.id_cliente and a.id_expediente is null and c.eliminado_en is not null) returning a.id`,
      );
      res.restaurados += r.length;
      avanzar(Math.min(i + 200, numeros.length));
    }
    res.bloqueados = total - res.restaurados;
    if (res.bloqueados > 0) res.detalle.push(`${res.bloqueados} no se han restaurado: pertenecen a un expediente o cliente que sigue en la papelera (restáuralo primero) o no estaban eliminados.`);
    return res;
  }

  if (entrada.categoria === "elementos") {
    const numeros = ids as number[];
    let hecho = 0;
    for (const id of numeros) {
      parar(hecho);
      const [e] = await filas<{ tipo: string; etiqueta: string; datos: Record<string, unknown> }>(ej, sql`select tipo, etiqueta, datos from papelera_elementos where id = ${id}`);
      if (!e || !(TIPOS_ELEMENTO as readonly string[]).includes(e.tipo)) {
        res.bloqueados++;
      } else {
        try {
          // Cada elemento en su propia transacción: si no se puede, no deja nada a medias
          await ej.transaction(async (tx) => {
            await reinsertarElemento(tx, e.tipo as TipoElemento, e.datos);
            await tx.execute(sql`delete from papelera_elementos where id = ${id}`);
          });
          res.restaurados++;
        } catch (err) {
          res.bloqueados++;
          if (res.detalle.length < 20) res.detalle.push(`«${e.etiqueta}» no se ha restaurado: ${motivoDeFallo(err)}.`);
        }
      }
      avanzar(++hecho);
    }
    return res;
  }

  if (entrada.categoria === "biblioteca") {
    const numeros = ids as number[];
    for (let i = 0; i < numeros.length; i += 200) {
      parar(i);
      const lote = numeros.slice(i, i + 200);
      const r = await filas<{ id: number }>(ej, sql`update biblioteca set eliminado_en = null where eliminado_en is not null and id in (${lista(lote)}) returning id`);
      res.restaurados += r.length;
      avanzar(Math.min(i + 200, numeros.length));
    }
    res.bloqueados = total - res.restaurados;
    if (res.bloqueados > 0) res.detalle.push(`${res.bloqueados} ya no estaban en la papelera.`);
    return res;
  }

  // Catálogos: primero las marcas y luego los modelos (un modelo necesita su marca vigente); cada uno aparte, por si choca con otro igual
  const porTabla = new Map<string, number[]>();
  for (const c of ids as string[]) {
    const [tabla, id] = c.split(":");
    if (!(tabla in PK_CATALOGO) || !Number.isInteger(Number(id))) continue;
    porTabla.set(tabla, [...(porTabla.get(tabla) ?? []), Number(id)]);
  }
  let hecho = 0;
  for (const tabla of ["marcas", "modelos", "tipo_de_venta", "estado_vehiculo", "tiendas"]) {
    for (const id of porTabla.get(tabla) ?? []) {
      parar(hecho);
      try {
        const extra = tabla === "modelos" ? sql` and exists (select 1 from marcas k where k.id_marca = marca_id and k.eliminado_en is null)` : sql``;
        const r = await ej.transaction((tx) => tx.execute(sql`update ${sql.raw(tabla)} set eliminado_en = null where ${sql.raw(PK_CATALOGO[tabla])} = ${id} and eliminado_en is not null${extra} returning 1`));
        if ((r as unknown as Filas<unknown>).rows.length > 0) res.restaurados++;
        else {
          res.bloqueados++;
          if (tabla === "modelos") res.detalle.push("Un modelo no se ha restaurado: su marca sigue en la papelera (restáurala primero).");
        }
      } catch {
        res.bloqueados++;
        res.detalle.push("Un elemento no se ha restaurado: ya hay otro vigente con el mismo nombre.");
      }
      avanzar(++hecho);
    }
  }
  res.detalle = [...new Set(res.detalle)];
  return res;
}

export interface ResultadoCompactado {
  antes: number;
  despues: number;
}

const TABLAS_A_COMPACTAR = ["adjuntos_datos", "adjuntos", "biblioteca_datos", "biblioteca", "contenidos_compartidos", "lecturas_pedidos", "historial_cambios", "expedientes", "clientes", "emails_clientes", "telefonos_clientes", "auditoria", "validaciones_comision", "importaciones_registros"];

/** Tamaño de la base de datos y de las tablas que se compactan (lo que de verdad ocupa en disco, con el espacio de lo borrado sin devolver). */
export async function espacioBaseDeDatos(ej: Ejecutor): Promise<{ total: number; tablas: { tabla: string; bytes: number; filas: number }[] }> {
  const [t] = await filas<{ total: string }>(ej, sql`select pg_database_size(current_database()) total`);
  const tablas = await filas<{ tabla: string; bytes: string; filas: string }>(ej, sql`select relname tabla, pg_total_relation_size(relid) bytes, n_live_tup filas from pg_stat_user_tables order by 2 desc limit 12`);
  return { total: num(t?.total), tablas: tablas.map((x) => ({ tabla: x.tabla, bytes: num(x.bytes), filas: num(x.filas) })) };
}

/**
 * Devuelve al disco el espacio de lo borrado (VACUUM FULL). Al borrar filas, PostgreSQL deja el hueco reservado para reutilizarlo: la
 * base no encoge sola. Bloquea esas tablas unos segundos mientras se compactan.
 */
export async function compactar(ej: Ejecutor, progreso: ProgresoPurga = SIN_PROGRESO): Promise<ResultadoCompactado> {
  const antes = (await espacioBaseDeDatos(ej)).total;
  let hechas = 0;
  for (const t of TABLAS_A_COMPACTAR) {
    if (progreso.cancelada()) throw new TareaCancelada(`Se ha parado: ${hechas} de ${TABLAS_A_COMPACTAR.length} tablas compactadas`);
    progreso.avance(hechas, TABLAS_A_COMPACTAR.length, `Compactando la tabla ${t} (${hechas + 1} de ${TABLAS_A_COMPACTAR.length})…`);
    await ej.execute(sql.raw(`vacuum full "${t}"`));
    hechas++;
  }
  const despues = (await espacioBaseDeDatos(ej)).total;
  return { antes, despues };
}
