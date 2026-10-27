import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";

/**
 * Elementos sueltos que se eliminan (rejillas, plantillas, paletas, pendientes de cobro, marcas de pagado/reclamado): antes de borrarlos de su tabla
 * se guarda aquí una copia exacta de sus filas, para poder restaurarlos desde la Papelera. La copia se hace con SQL (`to_jsonb`) y se restaura con
 * `jsonb_populate_record`, así que vale para cualquier tipo de columna sin conversiones a mano.
 */

export const TIPOS_ELEMENTO = ["rejilla", "plantilla_plan", "plantilla_tarifas", "paleta", "pendiente_cobro", "validacion", "plan", "usuario", "copia", "copia_seccion", "incidencia", "apunte"] as const;
export type TipoElemento = (typeof TIPOS_ELEMENTO)[number];

export const TEXTO_TIPO: Record<TipoElemento, { pestana: string; singular: string }> = {
  rejilla: { pestana: "Rejillas leídas", singular: "Rejilla" },
  plantilla_plan: { pestana: "Plantillas de plan", singular: "Plantilla de plan" },
  plantilla_tarifas: { pestana: "Plantillas de tarifas", singular: "Plantilla de tarifas" },
  paleta: { pestana: "Paletas de colores", singular: "Paleta de colores" },
  pendiente_cobro: { pestana: "Pendientes de cobro", singular: "Pendiente de cobro" },
  validacion: { pestana: "Marcas de pagado/reclamado", singular: "Marca de pagado/reclamado" },
  plan: { pestana: "Planes de comisionamiento", singular: "Plan de comisionamiento" },
  usuario: { pestana: "Usuarios", singular: "Usuario" },
  copia: { pestana: "Copias de seguridad", singular: "Copia de seguridad" },
  copia_seccion: { pestana: "Copias internas", singular: "Copia interna de una sección" },
  incidencia: { pestana: "Incidencias", singular: "Incidencia" },
  apunte: { pestana: "Apuntes de expedientes", singular: "Apunte de un expediente" },
};

/** Una tabla que cuelga de otra por la columna `fk` (y, a su vez, puede tener las suyas). */
interface Hija {
  tabla: string;
  fk: string;
  /** Su clave primaria, si tiene hijas propias (por defecto `id`). */
  pk?: string;
  hijas?: Hija[];
}

/** Qué tablas forman un elemento: la principal (con su clave primaria `pk`) y las que cuelgan de ella, en el orden en que se vuelven a insertar. */
interface Forma {
  tabla: string;
  pk?: string;
  hijas?: Hija[];
}

/** Lo que cuelga siempre de un usuario (sus datos de contacto, tiendas y códigos de recuperación del doble factor). */
const HIJAS_USUARIO: Hija[] = [
  { tabla: "emails_usuarios", fk: "id_usuario" },
  { tabla: "telefonos_usuarios", fk: "id_usuario" },
  { tabla: "usuarios_tiendas", fk: "id_usuario" },
  { tabla: "codigos_recuperacion", fk: "id_usuario" },
];

/** Además, cuando se elimina «con todo lo suyo»: su historial de comisiones, rejillas, pendientes y validaciones. */
export const HIJAS_USUARIO_CON_TODO: Hija[] = [
  { tabla: "commission_plan_vendedores", fk: "id_usuario" },
  { tabla: "libro_puntos", fk: "id_usuario" },
  { tabla: "validaciones_comision", fk: "id_usuario" },
  { tabla: "pendientes_cobro", fk: "id_usuario" },
  { tabla: "rejillas", fk: "id_usuario", pk: "id", hijas: [{ tabla: "rejilla_filas", fk: "id_rejilla" }] },
  {
    tabla: "commission_liquidations",
    fk: "id_usuario",
    pk: "id_liquidation",
    hijas: [
      { tabla: "commission_liquidation_lines", fk: "id_liquidation", pk: "id_line", hijas: [{ tabla: "commission_liquidation_line_items", fk: "id_line" }] },
      { tabla: "commission_liquidation_versions", fk: "id_liquidation" },
    ],
  },
];

const FORMAS: Record<TipoElemento, Forma> = {
  copia: { tabla: "copias_seguridad" },
  copia_seccion: { tabla: "copias_seccion" },
  apunte: { tabla: "apuntes_expediente" },
  incidencia: { tabla: "incidencias", hijas: [{ tabla: "incidencias_capturas", fk: "id_incidencia" }] },
  usuario: { tabla: "usuarios", pk: "id_usuario", hijas: HIJAS_USUARIO },
  rejilla: { tabla: "rejillas", hijas: [{ tabla: "rejilla_filas", fk: "id_rejilla" }] },
  plantilla_plan: { tabla: "plantillas_plan" },
  plantilla_tarifas: { tabla: "plantillas_tarifas_vn" },
  paleta: { tabla: "plantillas_colores" },
  pendiente_cobro: { tabla: "pendientes_cobro" },
  validacion: { tabla: "validaciones_comision" },
  plan: {
    tabla: "commission_plans",
    pk: "id_plan",
    hijas: [
      { tabla: "promociones_puntos", fk: "id_plan" },
      { tabla: "commission_plan_vendedores", fk: "id_plan" },
      { tabla: "commission_model_points", fk: "id_plan" },
      { tabla: "commission_brand_intervention_rates", fk: "id_plan" },
      { tabla: "commission_plan_model_rates", fk: "id_plan" },
      { tabla: "commission_used_rates", fk: "id_plan" },
      { tabla: "commission_vo_patterns", fk: "id_plan" },
      { tabla: "commission_finance_rates", fk: "id_plan" },
      { tabla: "commission_preference_rules", fk: "id_plan" },
      { tabla: "commission_rules", fk: "id_plan" },
      { tabla: "commission_bonus_rules", fk: "id_plan" },
      { tabla: "commission_plan_pending", fk: "id_plan" },
      {
        tabla: "commission_liquidations",
        fk: "id_plan",
        pk: "id_liquidation",
        hijas: [
          { tabla: "commission_liquidation_lines", fk: "id_liquidation", pk: "id_line", hijas: [{ tabla: "commission_liquidation_line_items", fk: "id_line" }] },
          { tabla: "commission_liquidation_versions", fk: "id_liquidation" },
        ],
      },
    ],
  },
};

type Filas<T> = { rows: T[] };
const filas = async <T>(ej: Ejecutor, q: ReturnType<typeof sql>): Promise<T[]> => ((await ej.execute(q)) as unknown as Filas<T>).rows;

/** Una fila guardada: de qué tabla es y su contenido exacto. Se guardan en el orden en que hay que volver a insertarlas (primero las madres). */
interface FilaGuardada {
  tabla: string;
  fila: Record<string, unknown>;
}

async function recogerHijas(ej: Ejecutor, hijas: Hija[], idMadre: unknown, salida: FilaGuardada[]): Promise<void> {
  for (const h of hijas) {
    const lista = await filas<{ fila: Record<string, unknown> }>(ej, sql`select to_jsonb(h) fila from ${sql.raw(h.tabla)} h where h.${sql.raw(h.fk)} = ${idMadre as number}`);
    for (const x of lista) {
      salida.push({ tabla: h.tabla, fila: x.fila });
      if (h.hijas) await recogerHijas(ej, h.hijas, x.fila[h.pk ?? "id"], salida);
    }
  }
}

/**
 * Guarda en la Papelera la copia de las filas que cumplen `donde` (una condición SQL sobre la tabla principal del tipo, con alias `t`), SIN borrarlas:
 * quien llama las borra después, en la misma transacción. Devuelve cuántos elementos se han guardado.
 */
export async function archivarElementos(ej: Ejecutor, tipo: TipoElemento, donde: ReturnType<typeof sql>, descripcion: { etiqueta: string; detalle?: string | null }, eliminadoPor: number | null = null, hijasExtra: Hija[] = [], extra: FilaGuardada[] = []): Promise<number> {
  const forma = FORMAS[tipo];
  const principales = await filas<{ fila: Record<string, unknown> }>(ej, sql`select to_jsonb(t) fila from ${sql.raw(forma.tabla)} t where ${donde}`);
  for (const p of principales) {
    const todas: FilaGuardada[] = [{ tabla: forma.tabla, fila: p.fila }];
    if (forma.hijas || hijasExtra.length > 0) await recogerHijas(ej, [...(forma.hijas ?? []), ...hijasExtra], p.fila[forma.pk ?? "id"], todas);
    todas.push(...extra);
    const json = JSON.stringify({ filas: todas });
    await ej.execute(
      sql`insert into papelera_elementos (tipo, etiqueta, detalle, datos, bytes, eliminado_por) values (${tipo}, ${descripcion.etiqueta.slice(0, 300)}, ${descripcion.detalle ?? null}, ${json}::jsonb, ${json.length}, ${eliminadoPor})`,
    );
  }
  return principales.length;
}

/** Vuelve a insertar, tal cual estaban, las filas de un elemento de la Papelera. Lanza un error con el motivo si no se puede (ya hay otro igual, falta el usuario…). */
export async function reinsertarElemento(ej: Ejecutor, tipo: TipoElemento, datos: Record<string, unknown>): Promise<void> {
  const forma = FORMAS[tipo];
  // Formato antiguo (1.18.1): { fila, <tabla hija>: [...] }; se pasa al nuevo
  const lista: FilaGuardada[] = Array.isArray(datos.filas)
    ? (datos.filas as FilaGuardada[])
    : [{ tabla: forma.tabla, fila: datos.fila as Record<string, unknown> }, ...(forma.hijas ?? []).flatMap((h) => ((datos[h.tabla] as Record<string, unknown>[] | undefined) ?? []).map((fila) => ({ tabla: h.tabla, fila })))];
  const pendientes: FilaGuardada[] = [];
  for (let i = 0; i < lista.length; ) {
    // Las filas seguidas de la misma tabla se insertan juntas
    if (lista[i].tabla === TABLA_EXPEDIENTES_DEL_USUARIO || lista[i].tabla === TABLA_ARCHIVO_COPIA) {
      pendientes.push(lista[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < lista.length && lista[j].tabla === lista[i].tabla && j - i < 200) j++;
    const tabla = lista[i].tabla;
    await ej.execute(sql`insert into ${sql.raw(tabla)} select r.* from jsonb_populate_recordset(null::${sql.raw(tabla)}, ${JSON.stringify(lista.slice(i, j).map((x) => x.fila))}::jsonb) r`);
    i = j;
  }
  // Los expedientes que se quedaron sin vendedor al eliminar al usuario vuelven a ser suyos (si siguen sin vendedor)
  for (const p of pendientes) {
    if (p.tabla === TABLA_ARCHIVO_COPIA) {
      // El fichero de la copia vuelve de la carpeta de la Papelera a la de las copias
      const { dirCopias } = await import("./copias");
      const nombre = String(p.fila.nombre);
      const origen = path.join(dirCopias(), "papelera", nombre);
      if (existsSync(origen)) await rename(origen, path.join(dirCopias(), nombre));
      continue;
    }
    const ids = (p.fila.ids as number[] | undefined) ?? [];
    if (ids.length > 0) await ej.execute(sql`update expedientes set id_usuario = ${Number(p.fila.id_usuario)} where id_usuario is null and id_expediente in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
  }
}

/** Marca especial dentro de lo guardado de una copia de seguridad: el nombre de su fichero (que se mueve a la carpeta «papelera» de las copias). */
export const TABLA_ARCHIVO_COPIA = "__archivo_copia";

/** Borra de verdad los ficheros de las copias de seguridad que se purgan de la Papelera (y, si se puede, su copia en Google Drive). */
export async function borrarFicherosDeCopias(ej: Ejecutor, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const lista = await filas<{ datos: { filas?: FilaGuardada[] } }>(ej, sql`select datos from papelera_elementos where tipo = 'copia' and id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
  const { dirCopias } = await import("./copias");
  const idsDrive: string[] = [];
  for (const e of lista) {
    for (const f of e.datos.filas ?? []) {
      if (f.tabla === TABLA_ARCHIVO_COPIA) await rm(path.join(dirCopias(), "papelera", String(f.fila.nombre)), { force: true }).catch(() => undefined);
      if (f.tabla === "copias_seguridad" && f.fila.drive_file_id) idsDrive.push(String(f.fila.drive_file_id));
    }
  }
  if (idsDrive.length > 0) {
    const { borrarEnDrive } = await import("./drive");
    await borrarEnDrive(ej, idsDrive).catch(() => undefined);
  }
}

/** Marca especial dentro de lo guardado de un usuario: los expedientes que tenía asignados. */
export const TABLA_EXPEDIENTES_DEL_USUARIO = "__expedientes_del_usuario";

/** Texto de por qué falla una restauración, en lenguaje sencillo. */
export function motivoDeFallo(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const codigo = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
  if (codigo === "23505" || /duplicate key|unique/i.test(m)) return "ya hay otro igual (mismo nombre, mes o clave): bórralo o renómbralo y vuelve a intentarlo";
  if (codigo === "23503" || /foreign key/i.test(m)) return "algo de lo que depende (un usuario, un expediente…) ya no existe";
  return m.slice(0, 160);
}
