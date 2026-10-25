import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { contenidosCompartidos } from "@/db/schema";
import { descifrarBuffer } from "@/lib/auth/cifrado";
import { HttpError } from "@/lib/auth/sesion";

/**
 * Archivos repetidos guardados una sola vez. Un mismo documento puede estar en varios sitios (el pedido de un expediente y su copia en la biblioteca, o
 * el mismo PDF subido dos veces): en vez de guardar cada copia, la primera deja su contenido en `contenidos_compartidos` y las fichas apuntan a él por el
 * hash del contenido. No se toca ni un byte del archivo (ni se reduce la calidad de nada): solo se evita guardar lo mismo más de una vez. Las rejillas
 * quedan fuera, siempre. Cuando ya nada apunta a un archivo compartido, la base de datos lo borra sola (disparador de la migración 0056).
 */

type Filas<T> = { rows: T[] };
const filas = async <T>(ej: Ejecutor, q: ReturnType<typeof sql>): Promise<T[]> => ((await ej.execute(q)) as unknown as Filas<T>).rows;

export const huellaDe = (datos: Buffer): string => createHash("sha256").update(datos).digest("hex");

/** El contenido (cifrado) de una ficha: el suyo o, si lo comparte, el del archivo compartido. */
export async function bytesCifrados(ej: Ejecutor, d: { datos: Buffer | null; contenidoHash: string | null }): Promise<Buffer> {
  if (d.datos) return d.datos;
  if (!d.contenidoHash) throw new HttpError(404, "El archivo no tiene contenido guardado");
  const [c] = await ej.select({ datos: contenidosCompartidos.datos }).from(contenidosCompartidos).where(eq(contenidosCompartidos.hash, d.contenidoHash));
  if (!c) throw new HttpError(404, "No se encuentra el contenido compartido de este archivo");
  return c.datos;
}

export interface ResultadoRepetidos {
  /** Archivos distintos que están repetidos. */
  grupos: number;
  /** Cuántas copias sobran (las que se quitan o se quitarían). */
  copiasSobrantes: number;
  /** Bytes que se liberan (o se liberarían). */
  bytesLiberados: number;
  /** Cuántas fichas se han mirado por primera vez (para saber su huella). */
  fichasMiradas: number;
}

/** Pone la huella a las fichas que aún no la tienen: las de la biblioteca ya la traen (`huella`); a los adjuntos hay que descifrarlos una vez. */
async function ponerHuellas(ej: Ejecutor): Promise<number> {
  // Biblioteca: su huella ya es el SHA-256 del contenido. Las rejillas se dejan sin huella a propósito: nunca se tocan.
  await ej.execute(sql`update biblioteca_datos d set contenido_hash = b.huella from biblioteca b where b.id = d.id_archivo and d.contenido_hash is null and b.categoria <> 'rejilla'`);
  const pendientes = await filas<{ id: number }>(ej, sql`select id_adjunto id from adjuntos_datos where contenido_hash is null and datos is not null order by 1`);
  let n = 0;
  for (const { id } of pendientes) {
    const [f] = await filas<{ d: Buffer }>(ej, sql`select datos d from adjuntos_datos where id_adjunto = ${id}`);
    if (!f) continue;
    let huella: string;
    try {
      huella = huellaDe(descifrarBuffer(f.d));
    } catch {
      continue; // no se puede abrir con la clave de esta instalación: se deja tal cual
    }
    await ej.execute(sql`update adjuntos_datos set contenido_hash = ${huella} where id_adjunto = ${id}`);
    n++;
  }
  return n;
}

/**
 * Mira qué archivos están repetidos y, si `quitar` es cierto, deja cada uno guardado una sola vez. Con `quitar` falso solo cuenta lo que se ahorraría.
 * Seguro de repetir: lo ya compartido no se vuelve a tocar.
 */
export async function archivosRepetidos(ej: Ejecutor, quitar: boolean): Promise<ResultadoRepetidos> {
  const fichasMiradas = await ponerHuellas(ej);
  const grupos = await filas<{ h: string; propias: number; tiene_compartido: boolean }>(
    ej,
    sql`select h, count(*)::int propias, exists (select 1 from contenidos_compartidos c where c.hash = h) tiene_compartido
        from (select contenido_hash h from adjuntos_datos where datos is not null and contenido_hash is not null
              union all select contenido_hash from biblioteca_datos where datos is not null and contenido_hash is not null) t
        group by h having count(*) >= 2 or exists (select 1 from contenidos_compartidos c where c.hash = h)`,
  );
  const r: ResultadoRepetidos = { grupos: 0, copiasSobrantes: 0, bytesLiberados: 0, fichasMiradas };
  for (const g of grupos) {
    const [{ bytes }] = await filas<{ bytes: string }>(
      ej,
      sql`select coalesce(sum(octet_length(datos)), 0) bytes from (select datos from adjuntos_datos where contenido_hash = ${g.h} and datos is not null union all select datos from biblioteca_datos where contenido_hash = ${g.h} and datos is not null) t`,
    );
    const [{ uno }] = await filas<{ uno: string }>(
      ej,
      sql`select coalesce(max(octet_length(datos)), 0) uno from (select datos from adjuntos_datos where contenido_hash = ${g.h} and datos is not null union all select datos from biblioteca_datos where contenido_hash = ${g.h} and datos is not null) t`,
    );
    // Si ya hay una copia compartida, se liberan todas las propias; si no, se queda una (que pasa a ser la compartida)
    const sobrantes = g.tiene_compartido ? g.propias : g.propias - 1;
    const liberados = g.tiene_compartido ? Number(bytes) : Number(bytes) - Number(uno);
    if (sobrantes <= 0) continue;
    r.grupos++;
    r.copiasSobrantes += sobrantes;
    r.bytesLiberados += liberados;
    if (quitar) await compartir(ej, g.h);
  }
  if (quitar && r.copiasSobrantes > 0) {
    // Devuelve al disco lo liberado (las tablas son pequeñas: dura unos segundos)
    for (const t of ["adjuntos_datos", "biblioteca_datos", "contenidos_compartidos"]) await ej.execute(sql.raw(`vacuum full "${t}"`)).catch(() => undefined);
  }
  return r;
}

/** Deja el archivo con esta huella guardado una sola vez (en `contenidos_compartidos`) y vacía el contenido de las fichas que lo repetían. */
async function compartir(ej: Ejecutor, huella: string): Promise<void> {
  await ej.transaction(async (tx) => {
    const [ya] = await tx.select({ hash: contenidosCompartidos.hash }).from(contenidosCompartidos).where(eq(contenidosCompartidos.hash, huella));
    if (!ya) {
      const [f] = await filas<{ d: Buffer }>(tx, sql`select d from (select datos d from adjuntos_datos where contenido_hash = ${huella} and datos is not null union all select datos from biblioteca_datos where contenido_hash = ${huella} and datos is not null) t limit 1`);
      if (!f) return;
      await tx.insert(contenidosCompartidos).values({ hash: huella, datos: f.d });
    }
    await tx.execute(sql`update adjuntos_datos set datos = null where contenido_hash = ${huella} and datos is not null`);
    await tx.execute(sql`update biblioteca_datos set datos = null where contenido_hash = ${huella} and datos is not null`);
  });
}

/**
 * Al guardar un archivo nuevo: si ya había otro igual, se comparte en el acto (así los repetidos no llegan a ocupar el doble). `huella` es la del
 * contenido sin cifrar. No hace nada si es el único.
 */
export async function compartirSiRepetido(ej: Ejecutor, huella: string): Promise<void> {
  const [r] = await filas<{ n: number; compartido: boolean }>(
    ej,
    sql`select (select count(*) from (select 1 from adjuntos_datos where contenido_hash = ${huella} union all select 1 from biblioteca_datos where contenido_hash = ${huella}) t)::int n,
               exists (select 1 from contenidos_compartidos where hash = ${huella}) compartido`,
  );
  if (r && (r.n >= 2 || r.compartido)) await compartir(ej, huella);
}
