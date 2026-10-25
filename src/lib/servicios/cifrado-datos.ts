import { readFile, writeFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { ajustes } from "@/db/schema";
import { aTextoClaro, cifradoActivo, cifrarBufferReal, cifrarReal, descifrar, descifrarBuffer, descifrarBufferConSecreto, descifrarConSecreto, esFicheroClaro, esTextoClaro, fijarCifradoActivo, MARCA_CLARO } from "@/lib/auth/cifrado";
import { HttpError } from "@/lib/auth/sesion";
import { renovarComprobacion } from "./clave-recuperacion";
import { crearCopia } from "./copias";
import { TareaCancelada, type ContextoTarea } from "./tareas";

/**
 * Interruptor general del cifrado de datos (Configuración › Base de datos). Mientras está desactivado (por defecto) todo se guarda en claro; al activarlo,
 * lo nuevo se cifra y lo que ya estaba se convierte. Cambiar el interruptor hace antes una copia de seguridad y convierte por lotes, con avance. Lo que ya
 * esté guardado en el otro formato se sigue leyendo igual hasta que se convierte, así que nunca se pierde nada por el camino.
 */

const AJUSTE = "cifrado_activo";
const AJUSTE_AUTO = "cifrado_auto_claro";
const CLAVE_PORTABLE = "clave_portable";

/** Ficheros (bytea) que se cifran o no. */
const BYTEA = [
  { tabla: "adjuntos_datos", pk: "id_adjunto", col: "datos", nombre: "Documentos" },
  { tabla: "adjuntos_datos", pk: "id_adjunto", col: "miniatura", nombre: "Miniaturas" },
  { tabla: "biblioteca_datos", pk: "id_archivo", col: "datos", nombre: "Archivos de la biblioteca" },
  { tabla: "contenidos_compartidos", pk: "hash", col: "datos", nombre: "Documentos repetidos (guardados una sola vez)" },
  { tabla: "incidencias_capturas", pk: "id", col: "datos", nombre: "Capturas de las incidencias" },
  { tabla: "lecturas_pedidos", pk: "id", col: "datos", nombre: "Documentos en cola de lectura" },
] as const;

/** Textos cifrados (columna de una tabla) y su «propósito» de cifrado. */
const TEXTOS = [
  { tabla: "usuarios", pk: "id_usuario", col: "totp_secreto_cifrado", proposito: "totp", nombre: "Doble factor" },
  { tabla: "conexion_drive", pk: "id", col: "refresh_token_cifrado", proposito: "drive", nombre: "Conexión con Google Drive" },
] as const;
/** Valores de `ajustes` que van cifrados. */
const AJUSTES = [
  { clave: "drive_client_secreto", proposito: "drive" },
  { clave: "comprobacion_secreto", proposito: "comprobacion" },
  { clave: "incidencias_clave_recepcion", proposito: "cifrado-general" },
  { clave: "incidencias_principal_clave", proposito: "cifrado-general" },
] as const;

type Filas<T> = { rows: T[] };
const filas = async <T>(ej: Ejecutor, q: ReturnType<typeof sql>): Promise<T[]> => ((await ej.execute(q)) as unknown as Filas<T>).rows;
const tabla = (t: string) => sql.raw(`"${t}"`);

export interface EstadoCifrado {
  activo: boolean;
  /** Cuántos ficheros y textos están ya cifrados y cuántos en claro. */
  cifrados: number;
  enClaro: number;
}

/** Cómo está el cifrado: el interruptor y cuántos datos hay en cada formato. */
export async function estadoCifrado(ej: Ejecutor): Promise<EstadoCifrado> {
  let cifrados = 0;
  let enClaro = 0;
  for (const b of BYTEA) {
    const [r] = await filas<{ claro: number; cif: number }>(ej, sql`select count(*) filter (where substring(${sql.raw(`"${b.col}"`)} from 1 for 4) = '\\x47565030'::bytea)::int claro, count(*) filter (where substring(${sql.raw(`"${b.col}"`)} from 1 for 4) <> '\\x47565030'::bytea)::int cif from ${tabla(b.tabla)} where ${sql.raw(`"${b.col}"`)} is not null`);
    enClaro += r.claro;
    cifrados += r.cif;
  }
  for (const t of TEXTOS) {
    const [r] = await filas<{ claro: number; cif: number }>(ej, sql`select count(*) filter (where ${sql.raw(`"${t.col}"`)} like 'p0.%')::int claro, count(*) filter (where ${sql.raw(`"${t.col}"`)} not like 'p0.%')::int cif from ${tabla(t.tabla)} where ${sql.raw(`"${t.col}"`)} is not null and ${sql.raw(`"${t.col}"`)} <> ''`);
    enClaro += r.claro;
    cifrados += r.cif;
  }
  return { activo: cifradoActivo(), cifrados, enClaro };
}

async function leerAjuste(ej: Ejecutor, clave: string): Promise<string | null> {
  const [f] = await ej.select().from(ajustes).where(eq(ajustes.clave, clave));
  return f?.valor ?? null;
}
async function escribirAjuste(ej: Ejecutor, clave: string, valor: string): Promise<void> {
  await ej.insert(ajustes).values({ clave, valor }).onConflictDoUpdate({ target: ajustes.clave, set: { valor } });
}

/** Al arrancar el servidor: lee el interruptor guardado (sin dato guardado, desactivado). */
export async function cargarInterruptorCifrado(ej: Ejecutor): Promise<boolean> {
  const activo = (await leerAjuste(ej, AJUSTE)) === "true";
  fijarCifradoActivo(activo);
  return activo;
}

export interface ResumenConversion {
  convertidos: number;
  /** Datos que no se pueden abrir con la clave de esta instalación (vienen de otra) y se dejan como están. */
  ilegibles: number;
  copiaPrevia: string | null;
}

/** Otros secretos con los que probar a abrir lo que no se abre con el de esta instalación (por ejemplo, el que lleva dentro una copia portable). */
async function secretosAlternativos(ej: Ejecutor): Promise<string[]> {
  const actual = process.env.APP_SECRET ?? "";
  const p = await leerAjuste(ej, CLAVE_PORTABLE);
  return p && p !== actual && p.length >= 32 ? [p] : [];
}

/** Lo que hay dentro de un fichero guardado (en claro o cifrado con esta instalación o con otra conocida); null si no se puede abrir. */
function abrirFichero(raw: Buffer, proposito: string, otros: string[]): Buffer | null {
  try {
    return descifrarBuffer(raw, proposito);
  } catch {
    /* otra clave */
  }
  for (const s of otros) {
    try {
      return descifrarBufferConSecreto(s, raw, proposito);
    } catch {
      /* siguiente */
    }
  }
  return null;
}

function abrirTexto(raw: string, proposito: string, otros: string[]): string | null {
  try {
    return descifrar(raw, proposito);
  } catch {
    /* otra clave */
  }
  for (const s of otros) {
    try {
      return descifrarConSecreto(s, raw, proposito);
    } catch {
      /* siguiente */
    }
  }
  return null;
}

/** El fichero convertido al formato pedido, o null si ya estaba así (no hace falta tocarlo). */
function convertirFichero(raw: Buffer, activar: boolean, proposito: string, otros: string[]): Buffer | null | "ilegible" {
  const claro = esFicheroClaro(raw);
  if (!activar && claro) return null;
  const datos = abrirFichero(raw, proposito, otros);
  if (!datos) return "ilegible";
  if (activar) {
    if (!claro) {
      // Cifrado con esta instalación: ya está. Con otra clave que sí conocemos: hay que volver a cifrarlo con la de esta
      try {
        descifrarBuffer(raw, proposito);
        return null;
      } catch {
        return cifrarBufferReal(datos, proposito);
      }
    }
    return cifrarBufferReal(datos, proposito);
  }
  return Buffer.concat([MARCA_CLARO, datos]);
}

function convertirTexto(raw: string, activar: boolean, proposito: string, otros: string[]): string | null | "ilegible" {
  const claro = esTextoClaro(raw);
  if (!activar && claro) return null;
  const texto = abrirTexto(raw, proposito, otros);
  if (texto === null) return "ilegible";
  if (activar) {
    if (!claro) {
      try {
        descifrar(raw, proposito);
        return null;
      } catch {
        return cifrarReal(texto, proposito);
      }
    }
    return cifrarReal(texto, proposito);
  }
  return aTextoClaro(texto);
}

const LOTE = 20;

/** Convierte todo lo guardado al formato pedido (sin tocar el interruptor ni hacer copia): por lotes, con avance y cancelable. */
export async function convertirTodo(ej: Ejecutor, activar: boolean, ctx?: ContextoTarea): Promise<{ convertidos: number; ilegibles: number }> {
  const otros = await secretosAlternativos(ej);
  let convertidos = 0;
  let ilegibles = 0;
  const parar = (d: number) => {
    if (ctx?.cancelada()) throw new TareaCancelada(`Se ha parado a mitad: ${convertidos} datos convertidos (el resto se sigue leyendo bien en su formato)`);
    return d;
  };

  // Cuántos hay en total, para el avance
  let total = 0;
  for (const b of BYTEA) total += (await filas<{ n: number }>(ej, sql`select count(*)::int n from ${tabla(b.tabla)} where ${sql.raw(`"${b.col}"`)} is not null`))[0].n;
  for (const t of TEXTOS) total += (await filas<{ n: number }>(ej, sql`select count(*)::int n from ${tabla(t.tabla)} where ${sql.raw(`"${t.col}"`)} is not null`))[0].n;
  const ficherosCola = await filas<{ id: number; ruta: string }>(ej, sql`select id, ruta from lecturas_pedidos where ruta is not null`);
  total += ficherosCola.length;
  let hecho = 0;
  const avance = (texto: string) => ctx?.avance(hecho, total, texto);
  avance("Empezando…");

  for (const b of BYTEA) {
    const ids = (await filas<{ id: number }>(ej, sql`select ${sql.raw(`"${b.pk}"`)} id from ${tabla(b.tabla)} where ${sql.raw(`"${b.col}"`)} is not null order by 1`)).map((x) => x.id);
    for (let i = 0; i < ids.length; i += LOTE) {
      parar(hecho);
      const lote = ids.slice(i, i + LOTE);
      await ej.transaction(async (tx) => {
        for (const id of lote) {
          const [f] = await filas<{ d: Buffer }>(tx, sql`select ${sql.raw(`"${b.col}"`)} d from ${tabla(b.tabla)} where ${sql.raw(`"${b.pk}"`)} = ${id}`);
          if (!f?.d) continue;
          const nuevo = convertirFichero(Buffer.from(f.d), activar, "ficheros", otros);
          if (nuevo === "ilegible") ilegibles++;
          else if (nuevo) {
            await tx.execute(sql`update ${tabla(b.tabla)} set ${sql.raw(`"${b.col}"`)} = ${nuevo} where ${sql.raw(`"${b.pk}"`)} = ${id}`);
            convertidos++;
          }
        }
      });
      hecho += lote.length;
      avance(`${b.nombre}: ${Math.min(i + LOTE, ids.length).toLocaleString("es-ES")} de ${ids.length.toLocaleString("es-ES")}`);
    }
  }

  for (const t of TEXTOS) {
    const lista = await filas<{ id: number; v: string }>(ej, sql`select ${sql.raw(`"${t.pk}"`)} id, ${sql.raw(`"${t.col}"`)} v from ${tabla(t.tabla)} where ${sql.raw(`"${t.col}"`)} is not null`);
    for (const f of lista) {
      parar(hecho);
      hecho++;
      if (!f.v) continue;
      const nuevo = convertirTexto(f.v, activar, t.proposito, otros);
      if (nuevo === "ilegible") ilegibles++;
      else if (nuevo) {
        await ej.execute(sql`update ${tabla(t.tabla)} set ${sql.raw(`"${t.col}"`)} = ${nuevo} where ${sql.raw(`"${t.pk}"`)} = ${f.id}`);
        convertidos++;
      }
    }
    avance(`${t.nombre} listo`);
  }

  for (const a of AJUSTES) {
    const v = await leerAjuste(ej, a.clave);
    if (!v) continue;
    const nuevo = convertirTexto(v, activar, a.proposito, otros);
    if (nuevo === "ilegible") ilegibles++;
    else if (nuevo) {
      await escribirAjuste(ej, a.clave, nuevo);
      convertidos++;
    }
  }

  // Documentos que esperan su lectura: están en disco
  for (const f of ficherosCola) {
    parar(hecho);
    hecho++;
    try {
      const nuevo = convertirFichero(await readFile(f.ruta), activar, "ficheros", otros);
      if (nuevo === "ilegible") ilegibles++;
      else if (nuevo) {
        await writeFile(f.ruta, nuevo);
        convertidos++;
      }
    } catch {
      /* el fichero ya no está: la cola lo tratará como hasta ahora */
    }
  }
  avance("Terminado");
  await renovarComprobacion(ej);
  return { convertidos, ilegibles };
}

/**
 * Activa o desactiva el cifrado: copia de seguridad previa (si no se puede, no se cambia nada), guarda el interruptor y convierte todo lo ya guardado
 * por lotes. Lo nuevo se guarda ya en el formato elegido desde el principio.
 */
export async function cambiarCifrado(ej: Ejecutor, activar: boolean, idAdmin: number | null, ctx?: ContextoTarea): Promise<ResumenConversion> {
  if (activar && !process.env.APP_SECRET) throw new HttpError(500, "Para cifrar falta APP_SECRET en el archivo .env.");
  ctx?.avance(0, 0, "Haciendo la copia de seguridad previa…");
  let copiaPrevia: string | null = null;
  try {
    copiaPrevia = (await crearCopia(ej, "previa", idAdmin, `Antes de ${activar ? "activar" : "desactivar"} el cifrado de los datos. Restáurala si algo no era lo que esperabas.`)).nombre;
  } catch (e) {
    throw new HttpError(500, `No se ha cambiado nada: no se pudo crear la copia de seguridad previa (${e instanceof Error ? e.message : "error desconocido"}).`);
  }
  await escribirAjuste(ej, AJUSTE, activar ? "true" : "false");
  fijarCifradoActivo(activar);
  const r = await convertirTodo(ej, activar, ctx);
  return { ...r, copiaPrevia };
}

/**
 * Al arrancar, sin el cifrado activado, lo que quedara cifrado de antes (documentos, capturas, doble factor…) se deja en claro una vez: con copia previa y
 * avance, en segundo plano. Si algo falla se anota y se reintenta (hasta 3 veces) en el siguiente arranque; el botón de Configuración › Base de datos lo repite.
 */
export async function pendienteDeDejarEnClaro(ej: Ejecutor): Promise<boolean> {
  if (cifradoActivo()) return false;
  if (Number((await leerAjuste(ej, AJUSTE_AUTO)) ?? "0") >= 3) return false;
  return (await estadoCifrado(ej)).cifrados > 0;
}

export async function anotarIntentoAuto(ej: Ejecutor, intentos: number): Promise<void> {
  await escribirAjuste(ej, AJUSTE_AUTO, String(intentos));
}
export async function intentosAuto(ej: Ejecutor): Promise<number> {
  return Number((await leerAjuste(ej, AJUSTE_AUTO)) ?? "0");
}
