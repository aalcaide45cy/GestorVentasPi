import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { eq, isNotNull } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { adjuntosDatos, ajustes, biblioteca, bibliotecaDatos, codigosRecuperacion, conexionDrive, contenidosCompartidos, usuarios } from "@/db/schema";
import { cifrar, cifrarBuffer, descifrarBuffer, descifrarBufferConSecreto, descifrarConSecreto } from "@/lib/auth/cifrado";
import { HttpError } from "@/lib/auth/sesion";

/**
 * Copias que se pueden restaurar en CUALQUIER instalación: los datos cifrados (documentos, secretos del doble factor y conexión
 * con Drive) usan una clave que sale de `APP_SECRET`, que es distinta en cada instalación. Para no depender del archivo `.env`,
 * el administrador fija una «clave de recuperación»: con ella se guarda dentro de la propia base (y por tanto dentro de cada copia)
 * el APP_SECRET de origen, protegido con esa clave. Al restaurar en otra instalación se indica la clave y todo se vuelve a cifrar
 * con el APP_SECRET de la instalación de destino.
 */

const CLAVE_ENVUELTA = "clave_recuperacion_envuelta";
const CLAVE_COMPROBACION = "comprobacion_secreto";
/** Copias portables: el APP_SECRET de origen, sin proteger, guardado en la propia base (y por tanto en cada copia). */
const CLAVE_PORTABLE = "clave_portable";
const AJUSTE_PORTABLES = "backup_portables";
const MINIMO_CLAVE = 10;

interface Envuelta {
  v: 1;
  sal: string;
  iv: string;
  etiqueta: string;
  datos: string;
}

function envolver(secreto: string, clave: string): string {
  const sal = randomBytes(16);
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", scryptSync(clave, sal, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }), iv);
  const datos = Buffer.concat([cifrador.update(secreto, "utf8"), cifrador.final()]);
  const e: Envuelta = { v: 1, sal: sal.toString("base64"), iv: iv.toString("base64"), etiqueta: cifrador.getAuthTag().toString("base64"), datos: datos.toString("base64") };
  return JSON.stringify(e);
}

function desenvolver(texto: string, clave: string): string | null {
  try {
    const e = JSON.parse(texto) as Envuelta;
    const d = createDecipheriv("aes-256-gcm", scryptSync(clave, Buffer.from(e.sal, "base64"), 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }), Buffer.from(e.iv, "base64"));
    d.setAuthTag(Buffer.from(e.etiqueta, "base64"));
    return Buffer.concat([d.update(Buffer.from(e.datos, "base64")), d.final()]).toString("utf8");
  } catch {
    return null; // clave incorrecta o dato dañado
  }
}

async function leer(ej: Ejecutor, clave: string): Promise<string | null> {
  const [f] = await ej.select().from(ajustes).where(eq(ajustes.clave, clave));
  return f?.valor ?? null;
}
async function escribir(ej: Ejecutor, clave: string, valor: string): Promise<void> {
  await ej.insert(ajustes).values({ clave, valor }).onConflictDoUpdate({ target: ajustes.clave, set: { valor } });
}

/** ¿Están activadas las copias portables? (por defecto, sí: la copia se descarga de un PC y se abre en otro sin pedir nada). */
export async function copiasPortablesActivas(ej: Ejecutor): Promise<boolean> {
  return (await leer(ej, AJUSTE_PORTABLES)) !== "false";
}

/**
 * Antes de cada copia: con las copias portables, deja dentro de la base el APP_SECRET de esta instalación, de modo que quien restaure la
 * copia en otra instalación no tenga que escribir nada (se vuelven a cifrar los datos solos). Sin ellas, se quita. Ojo: quien tenga el
 * archivo de la copia puede abrir los documentos y los secretos del doble factor; por eso se puede desactivar.
 */
export async function prepararPortabilidad(ej: Ejecutor): Promise<void> {
  if (await copiasPortablesActivas(ej)) {
    const secreto = process.env.APP_SECRET;
    if (secreto) await escribir(ej, CLAVE_PORTABLE, secreto);
  } else {
    await ej.delete(ajustes).where(eq(ajustes.clave, CLAVE_PORTABLE));
  }
}

/** Deja en la base un dato cifrado conocido, para poder saber después (en cualquier instalación) si el APP_SECRET coincide. */
export async function asegurarComprobacion(ej: Ejecutor): Promise<void> {
  if (!(await leer(ej, CLAVE_COMPROBACION))) await escribir(ej, CLAVE_COMPROBACION, cifrar("ok", "comprobacion"));
}

/** Vuelve a escribir el dato de comprobación en el formato actual (cifrado o en claro), tras cambiar el interruptor del cifrado. */
export async function renovarComprobacion(ej: Ejecutor): Promise<void> {
  await escribir(ej, CLAVE_COMPROBACION, cifrar("ok", "comprobacion"));
}

export async function estadoClaveRecuperacion(ej: Ejecutor): Promise<{ configurada: boolean }> {
  return { configurada: !!(await leer(ej, CLAVE_ENVUELTA)) };
}

/** Fija (o cambia) la clave de recuperación: guarda el APP_SECRET de esta instalación protegido con ella. */
export async function configurarClaveRecuperacion(ej: Ejecutor, clave: string): Promise<void> {
  if (clave.length < MINIMO_CLAVE) throw new HttpError(400, `La clave de recuperación debe tener al menos ${MINIMO_CLAVE} caracteres.`);
  const secreto = process.env.APP_SECRET;
  if (!secreto) throw new HttpError(500, "Falta APP_SECRET en el entorno.");
  await asegurarComprobacion(ej);
  await escribir(ej, CLAVE_ENVUELTA, envolver(secreto, clave));
}

/** ¿Los datos cifrados de la base se pueden leer con este secreto? (sin datos cifrados que comprobar, sí). */
export async function secretoValido(ej: Ejecutor, secreto: string): Promise<boolean> {
  const canario = await leer(ej, CLAVE_COMPROBACION);
  const prueba = (f: () => unknown): boolean => {
    try {
      f();
      return true;
    } catch {
      return false;
    }
  };
  if (canario) return prueba(() => descifrarConSecreto(secreto, canario, "comprobacion"));
  // Copias hechas antes de existir la comprobación: se prueba con datos reales
  const [u] = await ej.select({ t: usuarios.totpSecretoCifrado }).from(usuarios).where(eq(usuarios.totpActivo, true)).limit(1);
  if (u?.t) return prueba(() => descifrarConSecreto(secreto, u.t as string, "totp"));
  const [a] = await ej.select({ d: adjuntosDatos.datos }).from(adjuntosDatos).where(isNotNull(adjuntosDatos.datos)).limit(1);
  if (a?.d) return prueba(() => descifrarBufferConSecreto(secreto, a.d as Buffer, "ficheros"));
  return true;
}

/** Secreto de origen a partir de lo que escribe el administrador: la clave de recuperación o el propio APP_SECRET de origen. */
export async function secretoDeOrigen(ej: Ejecutor, introducido: string): Promise<{ secreto: string; viaClave: boolean } | null> {
  const envuelta = await leer(ej, CLAVE_ENVUELTA);
  if (envuelta) {
    const s = desenvolver(envuelta, introducido);
    if (s && (await secretoValido(ej, s))) return { secreto: s, viaClave: true };
  }
  if (introducido.length >= 32 && (await secretoValido(ej, introducido))) return { secreto: introducido, viaClave: false };
  return null;
}

/**
 * Archivos de la biblioteca: vuelve a cifrar con el APP_SECRET de esta instalación los que se guardaron con `secretoOrigen`. Los que ya se leen con
 * el de esta instalación se dejan como están, así que se puede repetir sin riesgo. Devuelve cuántos ha vuelto a cifrar y cuántos no se pueden
 * abrir con ninguno de los dos secretos.
 */
export async function recifrarBiblioteca(ej: Ejecutor, secretoOrigen: string): Promise<{ recifrados: number; yaLegibles: number; ilegibles: number }> {
  let recifrados = 0;
  let yaLegibles = 0;
  let ilegibles = 0;
  const ids = await ej.select({ id: bibliotecaDatos.idArchivo }).from(bibliotecaDatos);
  for (const { id } of ids) {
    const [d] = await ej.select().from(bibliotecaDatos).where(eq(bibliotecaDatos.idArchivo, id));
    if (!d.datos) continue; // su contenido está en los archivos compartidos (se vuelve a cifrar más abajo)
    try {
      descifrarBuffer(d.datos);
      yaLegibles++;
      continue;
    } catch {
      /* no se lee con la clave de esta instalación: se prueba con la de origen */
    }
    try {
      await ej.update(bibliotecaDatos).set({ datos: cifrarBuffer(descifrarBufferConSecreto(secretoOrigen, d.datos, "ficheros")) }).where(eq(bibliotecaDatos.idArchivo, id));
      recifrados++;
    } catch {
      ilegibles++;
    }
  }
  // Archivos repetidos guardados una sola vez (los comparten documentos y biblioteca)
  for (const { hash } of await ej.select({ hash: contenidosCompartidos.hash }).from(contenidosCompartidos)) {
    const [c] = await ej.select().from(contenidosCompartidos).where(eq(contenidosCompartidos.hash, hash));
    try {
      descifrarBuffer(c.datos);
      yaLegibles++;
      continue;
    } catch {
      /* no se lee con la clave de esta instalación: se prueba con la de origen */
    }
    try {
      await ej.update(contenidosCompartidos).set({ datos: cifrarBuffer(descifrarBufferConSecreto(secretoOrigen, c.datos, "ficheros")) }).where(eq(contenidosCompartidos.hash, hash));
      recifrados++;
    } catch {
      ilegibles++;
    }
  }
  return { recifrados, yaLegibles, ilegibles };
}

/**
 * Vuelve a cifrar con el APP_SECRET de esta instalación todo lo que estaba cifrado con `secretoOrigen`: documentos, secretos del
 * doble factor y conexión con Drive. Los códigos de recuperación del doble factor no se pueden trasladar (son huellas): se borran
 * y cada usuario genera otros nuevos.
 */
export async function recifrarTodo(ej: Ejecutor, secretoOrigen: string): Promise<{ adjuntos: number; usuarios: number }> {
  const actual = process.env.APP_SECRET;
  if (!actual) throw new HttpError(500, "Falta APP_SECRET en el entorno.");
  let nAdjuntos = 0;
  let nUsuarios = 0;
  await ej.transaction(async (tx) => {
    for (const u of await tx.select({ id: usuarios.idUsuario, t: usuarios.totpSecretoCifrado }).from(usuarios)) {
      if (!u.t) continue;
      await tx.update(usuarios).set({ totpSecretoCifrado: cifrar(descifrarConSecreto(secretoOrigen, u.t, "totp"), "totp") }).where(eq(usuarios.idUsuario, u.id));
      nUsuarios++;
    }
    const [drive] = await tx.select().from(conexionDrive);
    if (drive) await tx.update(conexionDrive).set({ refreshTokenCifrado: cifrar(descifrarConSecreto(secretoOrigen, drive.refreshTokenCifrado, "drive"), "drive") }).where(eq(conexionDrive.id, drive.id));
    // Documentos: de uno en uno para no cargar toda la tabla en memoria
    const ids = await tx.select({ id: adjuntosDatos.idAdjunto }).from(adjuntosDatos);
    for (const { id } of ids) {
      const [d] = await tx.select().from(adjuntosDatos).where(eq(adjuntosDatos.idAdjunto, id));
      await tx
        .update(adjuntosDatos)
        .set({ datos: d.datos ? cifrarBuffer(descifrarBufferConSecreto(secretoOrigen, d.datos, "ficheros")) : null, miniatura: d.miniatura ? cifrarBuffer(descifrarBufferConSecreto(secretoOrigen, d.miniatura, "ficheros")) : null })
        .where(eq(adjuntosDatos.idAdjunto, id));
      nAdjuntos++;
    }
    // Biblioteca de archivos: también va cifrada con la clave de la instalación
    await recifrarBiblioteca(tx, secretoOrigen);
    await tx.delete(codigosRecuperacion);
    await escribir(tx, CLAVE_COMPROBACION, cifrar("ok", "comprobacion"));
    await tx.delete(ajustes).where(eq(ajustes.clave, CLAVE_ENVUELTA)); // el de origen ya no vale: se vuelve a fijar en esta instalación
  });
  return { adjuntos: nAdjuntos, usuarios: nUsuarios };
}

/**
 * Para una copia de otra instalación de la que no se tiene la clave: los datos cifrados no se pueden abrir, así que se quitan (los
 * documentos ya no tienen archivo, el doble factor de cada usuario vuelve a estar sin activar y se desconecta Google Drive) y todo lo
 * demás se conserva. Así cualquier copia se puede restaurar en cualquier equipo; cada usuario vuelve a activar su doble factor al entrar.
 */
export async function descartarDatosCifrados(ej: Ejecutor): Promise<{ adjuntos: number; usuarios: number }> {
  let nAdjuntos = 0;
  let nUsuarios = 0;
  await ej.transaction(async (tx) => {
    nAdjuntos = (await tx.delete(adjuntosDatos).returning({ id: adjuntosDatos.idAdjunto })).length;
    // Los archivos de la biblioteca van cifrados con la misma clave: sin ella no se pueden abrir, así que se quitan del todo (con su ficha)
    await tx.delete(bibliotecaDatos);
    await tx.delete(contenidosCompartidos);
    await tx.delete(biblioteca);
    nUsuarios = (await tx.update(usuarios).set({ totpSecretoCifrado: null, totpActivo: false, totpUltimoContador: null }).returning({ id: usuarios.idUsuario })).length;
    await tx.delete(conexionDrive);
    await tx.delete(codigosRecuperacion);
    await escribir(tx, CLAVE_COMPROBACION, cifrar("ok", "comprobacion"));
    await tx.delete(ajustes).where(eq(ajustes.clave, CLAVE_ENVUELTA));
  });
  return { adjuntos: nAdjuntos, usuarios: nUsuarios };
}

/**
 * Paso posterior a restaurar una copia: si sus datos cifrados no se leen con el APP_SECRET de esta instalación, pide la clave de
 * recuperación (o el APP_SECRET de origen) y los vuelve a cifrar. Si no se puede, falla (y la restauración se deshace).
 */
export async function ajustarCifradoTrasRestaurar(ej: Ejecutor, claveOrigen: string | undefined, sinClave = false): Promise<{ recifrado: boolean; descartado?: boolean }> {
  const actual = process.env.APP_SECRET ?? "";
  if (await secretoValido(ej, actual)) {
    await asegurarComprobacion(ej);
    return { recifrado: false };
  }
  // Copia portable: lleva dentro el secreto de origen, así que no hace falta pedir nada
  const portable = await leer(ej, CLAVE_PORTABLE);
  if (portable && portable !== actual && (await secretoValido(ej, portable))) {
    await recifrarTodo(ej, portable);
    await prepararPortabilidad(ej);
    return { recifrado: true };
  }
  const introducido = claveOrigen?.trim() ?? "";
  // Sin la clave y a petición de quien restaura: se conserva todo salvo lo que está cifrado con la clave de otra instalación
  if (!introducido && sinClave) {
    await descartarDatosCifrados(ej);
    await prepararPortabilidad(ej);
    return { recifrado: false, descartado: true };
  }
  if (!introducido) throw new HttpError(400, "Esta copia viene de otra instalación y sus datos cifrados (documentos, doble factor) usan otra clave. Escribe la «clave de recuperación» (o el APP_SECRET de la instalación de origen) para poder restaurarla.");
  const origen = await secretoDeOrigen(ej, introducido);
  if (!origen) throw new HttpError(400, "La clave de recuperación (o el APP_SECRET) no es correcta para esta copia.");
  await recifrarTodo(ej, origen.secreto);
  if (origen.viaClave) await configurarClaveRecuperacion(ej, introducido); // sigue valiendo la misma clave, ahora con el secreto de esta instalación
  return { recifrado: true };
}
