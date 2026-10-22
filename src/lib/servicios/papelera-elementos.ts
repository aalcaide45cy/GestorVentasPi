import { sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";

/**
 * Elementos sueltos que se eliminan (rejillas, plantillas, paletas, pendientes de cobro, marcas de pagado/reclamado): antes de borrarlos de su tabla
 * se guarda aquí una copia exacta de sus filas, para poder restaurarlos desde la Papelera. La copia se hace con SQL (`to_jsonb`) y se restaura con
 * `jsonb_populate_record`, así que vale para cualquier tipo de columna sin conversiones a mano.
 */

export const TIPOS_ELEMENTO = ["rejilla", "plantilla_plan", "plantilla_tarifas", "paleta", "pendiente_cobro", "validacion", "plan"] as const;
export type TipoElemento = (typeof TIPOS_ELEMENTO)[number];

export const TEXTO_TIPO: Record<TipoElemento, { pestana: string; singular: string }> = {
  rejilla: { pestana: "Rejillas leídas", singular: "Rejilla" },
  plantilla_plan: { pestana: "Plantillas de plan", singular: "Plantilla de plan" },
  plantilla_tarifas: { pestana: "Plantillas de tarifas", singular: "Plantilla de tarifas" },
  paleta: { pestana: "Paletas de colores", singular: "Paleta de colores" },
  pendiente_cobro: { pestana: "Pendientes de cobro", singular: "Pendiente de cobro" },
  validacion: { pestana: "Marcas de pagado/reclamado", singular: "Marca de pagado/reclamado" },
  plan: { pestana: "Planes de comisionamiento", singular: "Plan de comisionamiento" },
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

const FORMAS: Record<TipoElemento, Forma> = {
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
export async function archivarElementos(ej: Ejecutor, tipo: TipoElemento, donde: ReturnType<typeof sql>, descripcion: { etiqueta: string; detalle?: string | null }, eliminadoPor: number | null = null): Promise<number> {
  const forma = FORMAS[tipo];
  const principales = await filas<{ fila: Record<string, unknown> }>(ej, sql`select to_jsonb(t) fila from ${sql.raw(forma.tabla)} t where ${donde}`);
  for (const p of principales) {
    const todas: FilaGuardada[] = [{ tabla: forma.tabla, fila: p.fila }];
    if (forma.hijas) await recogerHijas(ej, forma.hijas, p.fila[forma.pk ?? "id"], todas);
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
  for (let i = 0; i < lista.length; ) {
    // Las filas seguidas de la misma tabla se insertan juntas
    let j = i;
    while (j < lista.length && lista[j].tabla === lista[i].tabla && j - i < 200) j++;
    const tabla = lista[i].tabla;
    await ej.execute(sql`insert into ${sql.raw(tabla)} select r.* from jsonb_populate_recordset(null::${sql.raw(tabla)}, ${JSON.stringify(lista.slice(i, j).map((x) => x.fila))}::jsonb) r`);
    i = j;
  }
}

/** Texto de por qué falla una restauración, en lenguaje sencillo. */
export function motivoDeFallo(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const codigo = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
  if (codigo === "23505" || /duplicate key|unique/i.test(m)) return "ya hay otro igual (mismo nombre, mes o clave): bórralo o renómbralo y vuelve a intentarlo";
  if (codigo === "23503" || /foreign key/i.test(m)) return "algo de lo que depende (un usuario, un expediente…) ya no existe";
  return m.slice(0, 160);
}
