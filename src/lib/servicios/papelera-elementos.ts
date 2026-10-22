import { sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";

/**
 * Elementos sueltos que se eliminan (rejillas, plantillas, paletas, pendientes de cobro, marcas de pagado/reclamado): antes de borrarlos de su tabla
 * se guarda aquí una copia exacta de sus filas, para poder restaurarlos desde la Papelera. La copia se hace con SQL (`to_jsonb`) y se restaura con
 * `jsonb_populate_record`, así que vale para cualquier tipo de columna sin conversiones a mano.
 */

export const TIPOS_ELEMENTO = ["rejilla", "plantilla_plan", "plantilla_tarifas", "paleta", "pendiente_cobro", "validacion"] as const;
export type TipoElemento = (typeof TIPOS_ELEMENTO)[number];

export const TEXTO_TIPO: Record<TipoElemento, { pestana: string; singular: string }> = {
  rejilla: { pestana: "Rejillas leídas", singular: "Rejilla" },
  plantilla_plan: { pestana: "Plantillas de plan", singular: "Plantilla de plan" },
  plantilla_tarifas: { pestana: "Plantillas de tarifas", singular: "Plantilla de tarifas" },
  paleta: { pestana: "Paletas de colores", singular: "Paleta de colores" },
  pendiente_cobro: { pestana: "Pendientes de cobro", singular: "Pendiente de cobro" },
  validacion: { pestana: "Marcas de pagado/reclamado", singular: "Marca de pagado/reclamado" },
};

/** Qué tablas forman un elemento: la principal y, si las tiene, las que cuelgan de ella (por la columna `fk`). */
interface Forma {
  tabla: string;
  hijas?: { tabla: string; fk: string }[];
}

const FORMAS: Record<TipoElemento, Forma> = {
  rejilla: { tabla: "rejillas", hijas: [{ tabla: "rejilla_filas", fk: "id_rejilla" }] },
  plantilla_plan: { tabla: "plantillas_plan" },
  plantilla_tarifas: { tabla: "plantillas_tarifas_vn" },
  paleta: { tabla: "plantillas_colores" },
  pendiente_cobro: { tabla: "pendientes_cobro" },
  validacion: { tabla: "validaciones_comision" },
};

type Filas<T> = { rows: T[] };
const filas = async <T>(ej: Ejecutor, q: ReturnType<typeof sql>): Promise<T[]> => ((await ej.execute(q)) as unknown as Filas<T>).rows;

/**
 * Guarda en la Papelera la copia de las filas que cumplen `donde` (una condición SQL sobre la tabla principal del tipo, con alias `t`), SIN borrarlas:
 * quien llama las borra después, en la misma transacción. Devuelve cuántos elementos se han guardado.
 */
export async function archivarElementos(ej: Ejecutor, tipo: TipoElemento, donde: ReturnType<typeof sql>, descripcion: { etiqueta: string; detalle?: string | null }, eliminadoPor: number | null = null): Promise<number> {
  const forma = FORMAS[tipo];
  const principales = await filas<{ fila: Record<string, unknown> }>(ej, sql`select to_jsonb(t) fila from ${sql.raw(forma.tabla)} t where ${donde}`);
  for (const p of principales) {
    const datos: Record<string, unknown> = { fila: p.fila };
    for (const h of forma.hijas ?? []) {
      // Las hijas cuelgan de la principal por su clave (`id`)
      datos[h.tabla] = (await filas<{ fila: Record<string, unknown> }>(ej, sql`select to_jsonb(h) fila from ${sql.raw(h.tabla)} h where h.${sql.raw(h.fk)} = ${Number(p.fila.id)}`)).map((x) => x.fila);
    }
    const json = JSON.stringify(datos);
    await ej.execute(
      sql`insert into papelera_elementos (tipo, etiqueta, detalle, datos, bytes, eliminado_por) values (${tipo}, ${descripcion.etiqueta.slice(0, 300)}, ${descripcion.detalle ?? null}, ${json}::jsonb, ${json.length}, ${eliminadoPor})`,
    );
  }
  return principales.length;
}

/** Vuelve a insertar, tal cual estaban, las filas de un elemento de la Papelera. Lanza un error con el motivo si no se puede (ya hay otro igual, falta el usuario…). */
export async function reinsertarElemento(ej: Ejecutor, tipo: TipoElemento, datos: Record<string, unknown>): Promise<void> {
  const forma = FORMAS[tipo];
  const fila = datos.fila as Record<string, unknown>;
  await ej.execute(sql`insert into ${sql.raw(forma.tabla)} select * from jsonb_populate_record(null::${sql.raw(forma.tabla)}, ${JSON.stringify(fila)}::jsonb)`);
  for (const h of forma.hijas ?? []) {
    const lista = (datos[h.tabla] as Record<string, unknown>[] | undefined) ?? [];
    for (let i = 0; i < lista.length; i += 200) {
      await ej.execute(sql`insert into ${sql.raw(h.tabla)} select r.* from jsonb_populate_recordset(null::${sql.raw(h.tabla)}, ${JSON.stringify(lista.slice(i, i + 200))}::jsonb) r`);
    }
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
