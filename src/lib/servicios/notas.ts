import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import sharp from "sharp";
import type { Ejecutor } from "@/db";
import { notas, notasCompartidos, notasFicheros, notasFicherosDatos, notasGrupos, usuarios } from "@/db/schema";
import { cifrarBuffer, descifrarBuffer } from "@/lib/auth/cifrado";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import {
  FORMATO_EXPORTACION,
  MAX_BYTES_CONTENIDO,
  MAX_BYTES_FICHERO_NOTA,
  ambitoDe,
  contenidoInicial,
  esquemaPaquete,
  normalizarEtiquetas,
  textoDeContenido,
  textoDeFlujo,
  type AmbitoGrupo,
  type ComparticionDto,
  type EntradaCambiarNota,
  type EntradaComparticion,
  type EntradaCrearNota,
  type EntradaGrupo,
  type FicheroNotaDto,
  type GrupoDto,
  type NotaDto,
  type NotaResumenDto,
  type PaqueteNotas,
  type PermisoNota,
  type TipoNota,
} from "@/lib/notas";
import { expedientes, clientes } from "@/db/schema";

/* ------------------------------ Grupos ------------------------------ */

const aGrupo = (f: typeof notasGrupos.$inferSelect): GrupoDto => ({ id: f.id, ambito: f.ambito as AmbitoGrupo, nombre: f.nombre, color: f.color, orden: f.orden });

export async function listarGrupos(ej: Ejecutor, u: UsuarioActual, ambito?: AmbitoGrupo): Promise<GrupoDto[]> {
  const filas = await ej.select().from(notasGrupos).where(and(eq(notasGrupos.idUsuario, u.idUsuario), ambito ? eq(notasGrupos.ambito, ambito) : undefined)).orderBy(asc(notasGrupos.orden), asc(notasGrupos.id));
  return filas.map(aGrupo);
}

export async function crearGrupo(ej: Ejecutor, u: UsuarioActual, e: EntradaGrupo): Promise<GrupoDto> {
  const [{ max }] = await ej.select({ max: sql<number>`coalesce(max(${notasGrupos.orden}), 0)::int` }).from(notasGrupos).where(and(eq(notasGrupos.idUsuario, u.idUsuario), eq(notasGrupos.ambito, e.ambito)));
  const [f] = await ej.insert(notasGrupos).values({ idUsuario: u.idUsuario, ambito: e.ambito, nombre: e.nombre, color: e.color, orden: max + 1 }).returning();
  return aGrupo(f);
}

async function grupoPropio(ej: Ejecutor, u: UsuarioActual, id: number) {
  const [g] = await ej.select().from(notasGrupos).where(and(eq(notasGrupos.id, id), eq(notasGrupos.idUsuario, u.idUsuario)));
  if (!g) throw new HttpError(404, "Grupo no encontrado");
  return g;
}

export async function actualizarGrupo(ej: Ejecutor, u: UsuarioActual, id: number, e: Pick<EntradaGrupo, "nombre" | "color">): Promise<GrupoDto> {
  await grupoPropio(ej, u, id);
  const [f] = await ej.update(notasGrupos).set({ nombre: e.nombre, color: e.color }).where(eq(notasGrupos.id, id)).returning();
  return aGrupo(f);
}

/** Borra el grupo; sus notas no se borran: quedan «sin grupo». */
export async function eliminarGrupo(ej: Ejecutor, u: UsuarioActual, id: number): Promise<void> {
  await grupoPropio(ej, u, id);
  await ej.delete(notasGrupos).where(eq(notasGrupos.id, id));
}

/* ------------------------------ Acceso ------------------------------ */

async function accesoA(ej: Ejecutor, u: UsuarioActual, id: number): Promise<{ fila: typeof notas.$inferSelect; permiso: PermisoNota }> {
  const [fila] = await ej.select().from(notas).where(eq(notas.id, id));
  if (!fila) throw new HttpError(404, "Nota no encontrada");
  if (fila.idUsuario === u.idUsuario) return { fila, permiso: "propietario" };
  const comp = await ej.select().from(notasCompartidos).where(and(eq(notasCompartidos.idNota, id), or(eq(notasCompartidos.idUsuario, u.idUsuario), isNull(notasCompartidos.idUsuario))));
  if (comp.length === 0 || fila.eliminadoEn) throw new HttpError(404, "Nota no encontrada");
  return { fila, permiso: comp.some((c) => c.permiso === "edicion") ? "edicion" : "lectura" };
}

const poderEditar = (p: PermisoNota) => p === "propietario" || p === "edicion";

/* ------------------------------ Notas ------------------------------ */

const extractoDe = (texto: string): string => texto.replace(/\s+/g, " ").trim().slice(0, 160);

function aResumen(f: typeof notas.$inferSelect, permiso: PermisoNota, autor: string | null, compartida: boolean, nFicheros: number): NotaResumenDto {
  return {
    id: f.id,
    tipo: f.tipo as TipoNota,
    titulo: f.titulo,
    extracto: extractoDe(f.texto),
    color: f.color,
    fijada: f.fijada,
    etiquetas: f.etiquetas,
    id_grupo: f.idGrupo,
    id_expediente: f.idExpediente,
    id_cliente: f.idCliente,
    creado_en: f.creadoEn.toISOString(),
    actualizado_en: f.actualizadoEn.toISOString(),
    eliminado_en: f.eliminadoEn?.toISOString() ?? null,
    permiso,
    autor,
    compartida,
    n_ficheros: nFicheros,
  };
}

export interface FiltroNotas {
  tipos?: TipoNota[];
  papelera?: boolean;
}

/** Mis notas y las que me han compartido (la papelera solo enseña las mías). Sin el contenido, para que la lista sea ligera. */
export async function listarNotas(ej: Ejecutor, u: UsuarioActual, filtro: FiltroNotas = {}): Promise<NotaResumenDto[]> {
  const visible = filtro.papelera
    ? and(eq(notas.idUsuario, u.idUsuario), isNotNull(notas.eliminadoEn))
    : and(isNull(notas.eliminadoEn), or(eq(notas.idUsuario, u.idUsuario), sql`exists (select 1 from notas_compartidos c where c.id_nota = ${notas.id} and (c.id_usuario = ${u.idUsuario} or c.id_usuario is null))`));
  const filas = await ej
    .select({ n: notas, autor: usuarios.nombre })
    .from(notas)
    .leftJoin(usuarios, eq(notas.idUsuario, usuarios.idUsuario))
    .where(and(visible, filtro.tipos && filtro.tipos.length > 0 ? inArray(notas.tipo, filtro.tipos) : undefined))
    .orderBy(desc(notas.fijada), desc(notas.actualizadoEn))
    .limit(3000);
  if (filas.length === 0) return [];
  const ids = filas.map((f) => f.n.id);
  const comps = await ej.select().from(notasCompartidos).where(inArray(notasCompartidos.idNota, ids));
  const ficheros = await ej.select({ id: notasFicheros.idNota, n: count() }).from(notasFicheros).where(inArray(notasFicheros.idNota, ids)).groupBy(notasFicheros.idNota);
  return filas.map(({ n, autor }) => {
    const propia = n.idUsuario === u.idUsuario;
    const suyos = comps.filter((c) => c.idNota === n.id);
    const permiso: PermisoNota = propia ? "propietario" : suyos.some((c) => (c.idUsuario === u.idUsuario || c.idUsuario === null) && c.permiso === "edicion") ? "edicion" : "lectura";
    return aResumen(n, permiso, propia ? null : autor, propia && suyos.length > 0, ficheros.find((x) => x.id === n.id)?.n ?? 0);
  });
}

const aFichero = (f: typeof notasFicheros.$inferSelect): FicheroNotaDto => ({ id: f.id, nombre: f.nombre, mime: f.mime, tamano: f.tamano, tiene_miniatura: f.tieneMiniatura, creado_en: f.creadoEn.toISOString() });

export async function leerNota(ej: Ejecutor, u: UsuarioActual, id: number): Promise<NotaDto> {
  const { fila, permiso } = await accesoA(ej, u, id);
  const [autor] = await ej.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.idUsuario, fila.idUsuario));
  const ficheros = await ej.select().from(notasFicheros).where(eq(notasFicheros.idNota, id)).orderBy(asc(notasFicheros.id));
  const comps = permiso === "propietario" ? await ej.select().from(notasCompartidos).where(eq(notasCompartidos.idNota, id)) : [];
  return { ...aResumen(fila, permiso, permiso === "propietario" ? null : (autor?.nombre ?? null), comps.length > 0, ficheros.length), contenido: fila.contenido, ficheros: ficheros.map(aFichero) };
}

const tamanoJson = (v: unknown): number => Buffer.byteLength(JSON.stringify(v ?? {}));
const textoDe = (tipo: TipoNota, contenido: unknown): string => (tipo === "nota" ? textoDeContenido(contenido) : textoDeFlujo(contenido)).slice(0, 200_000);

async function comprobarVinculos(ej: Ejecutor, idExpediente: number | null | undefined, idCliente: number | null | undefined): Promise<void> {
  if (idExpediente) {
    const [x] = await ej.select({ id: expedientes.idExpediente }).from(expedientes).where(and(eq(expedientes.idExpediente, idExpediente), isNull(expedientes.eliminadoEn)));
    if (!x) throw new HttpError(400, `No existe el expediente #EXP-${String(idExpediente).padStart(4, "0")}`);
  }
  if (idCliente) {
    const [x] = await ej.select({ id: clientes.id }).from(clientes).where(eq(clientes.id, idCliente));
    if (!x) throw new HttpError(400, "No existe ese cliente");
  }
}

export async function crearNota(ej: Ejecutor, u: UsuarioActual, e: EntradaCrearNota): Promise<NotaDto> {
  if (tamanoJson(e.contenido) > MAX_BYTES_CONTENIDO) throw new HttpError(413, "El contenido es demasiado grande");
  if (e.id_grupo) {
    const g = await grupoPropio(ej, u, e.id_grupo);
    if (g.ambito !== ambitoDe(e.tipo)) throw new HttpError(400, "Ese grupo es de otra sección");
  }
  await comprobarVinculos(ej, e.id_expediente, e.id_cliente);
  const contenido = e.contenido ?? contenidoInicial(e.tipo);
  const [f] = await ej
    .insert(notas)
    .values({ idUsuario: u.idUsuario, tipo: e.tipo, idGrupo: e.id_grupo ?? null, titulo: e.titulo, contenido, texto: textoDe(e.tipo, contenido), color: e.color ?? null, etiquetas: normalizarEtiquetas(e.etiquetas), idExpediente: e.id_expediente ?? null, idCliente: e.id_cliente ?? null })
    .returning();
  return leerNota(ej, u, f.id);
}

/** Cambia una nota. Sin permiso de edición no se puede; si `base` no coincide con la última versión guardada, otra persona la ha cambiado y se avisa en lugar de pisarla. */
export async function actualizarNota(ej: Ejecutor, u: UsuarioActual, id: number, e: EntradaCambiarNota): Promise<{ actualizado_en: string }> {
  const { fila, permiso } = await accesoA(ej, u, id);
  if (!poderEditar(permiso)) throw new HttpError(403, "Esta nota es solo para leer");
  if (fila.eliminadoEn) throw new HttpError(409, "La nota está en la papelera");
  if (e.base && new Date(e.base).getTime() !== fila.actualizadoEn.getTime()) throw new HttpError(409, "Otra persona ha cambiado esta nota mientras la editabas. Recarga para ver su versión.");
  if (e.contenido !== undefined && tamanoJson(e.contenido) > MAX_BYTES_CONTENIDO) throw new HttpError(413, "El contenido es demasiado grande");
  const soloPropietario = e.id_grupo !== undefined || e.fijada !== undefined || e.id_expediente !== undefined || e.id_cliente !== undefined;
  if (soloPropietario && permiso !== "propietario") throw new HttpError(403, "Solo quien creó la nota puede cambiar su grupo, su vínculo o fijarla");
  if (e.id_grupo) {
    const g = await grupoPropio(ej, u, e.id_grupo);
    if (g.ambito !== ambitoDe(fila.tipo as TipoNota)) throw new HttpError(400, "Ese grupo es de otra sección");
  }
  await comprobarVinculos(ej, e.id_expediente, e.id_cliente);
  const cambios: Partial<typeof notas.$inferInsert> = { actualizadoEn: new Date() };
  if (e.titulo !== undefined) cambios.titulo = e.titulo;
  if (e.contenido !== undefined) {
    cambios.contenido = e.contenido;
    cambios.texto = textoDe(fila.tipo as TipoNota, e.contenido);
  }
  if (e.color !== undefined) cambios.color = e.color ?? null;
  if (e.fijada !== undefined) cambios.fijada = e.fijada;
  if (e.etiquetas !== undefined) cambios.etiquetas = normalizarEtiquetas(e.etiquetas);
  if (e.id_grupo !== undefined) cambios.idGrupo = e.id_grupo ?? null;
  if (e.id_expediente !== undefined) cambios.idExpediente = e.id_expediente ?? null;
  if (e.id_cliente !== undefined) cambios.idCliente = e.id_cliente ?? null;
  const [f] = await ej.update(notas).set(cambios).where(eq(notas.id, id)).returning({ actualizadoEn: notas.actualizadoEn });
  return { actualizado_en: f.actualizadoEn.toISOString() };
}

async function propia(ej: Ejecutor, u: UsuarioActual, id: number) {
  const { fila, permiso } = await accesoA(ej, u, id);
  if (permiso !== "propietario") throw new HttpError(403, "Solo quien creó la nota puede hacer esto");
  return fila;
}

/** A la papelera de notas (se puede recuperar). */
export async function enviarAPapelera(ej: Ejecutor, u: UsuarioActual, id: number): Promise<void> {
  await propia(ej, u, id);
  await ej.update(notas).set({ eliminadoEn: new Date() }).where(eq(notas.id, id));
}

export async function restaurarNota(ej: Ejecutor, u: UsuarioActual, id: number): Promise<void> {
  await propia(ej, u, id);
  await ej.update(notas).set({ eliminadoEn: null }).where(eq(notas.id, id));
}

/** Borra la nota para siempre, con sus adjuntos. Solo desde la papelera. */
export async function eliminarDefinitivamente(ej: Ejecutor, u: UsuarioActual, id: number): Promise<void> {
  const f = await propia(ej, u, id);
  if (!f.eliminadoEn) throw new HttpError(409, "Primero hay que enviarla a la papelera");
  await ej.delete(notas).where(eq(notas.id, id));
}

export async function vaciarPapelera(ej: Ejecutor, u: UsuarioActual, tipos?: TipoNota[]): Promise<number> {
  const r = await ej.delete(notas).where(and(eq(notas.idUsuario, u.idUsuario), isNotNull(notas.eliminadoEn), tipos && tipos.length > 0 ? inArray(notas.tipo, tipos) : undefined)).returning({ id: notas.id });
  return r.length;
}

/** Duplica una nota (con sus adjuntos) en mi cuenta. */
export async function duplicarNota(ej: Ejecutor, u: UsuarioActual, id: number): Promise<NotaDto> {
  const { fila } = await accesoA(ej, u, id);
  const [nueva] = await ej
    .insert(notas)
    .values({ idUsuario: u.idUsuario, tipo: fila.tipo, idGrupo: fila.idUsuario === u.idUsuario ? fila.idGrupo : null, titulo: `${fila.titulo || "Sin título"} (copia)`.slice(0, 200), contenido: fila.contenido, texto: fila.texto, color: fila.color, etiquetas: fila.etiquetas, idExpediente: fila.idExpediente, idCliente: fila.idCliente })
    .returning();
  const originales = await ej.select().from(notasFicheros).where(eq(notasFicheros.idNota, id));
  const mapa = new Map<number, number>();
  for (const o of originales) {
    const [d] = await ej.select().from(notasFicherosDatos).where(eq(notasFicherosDatos.idFichero, o.id));
    if (!d) continue;
    const [n] = await ej.insert(notasFicheros).values({ idNota: nueva.id, nombre: o.nombre, mime: o.mime, tamano: o.tamano, tieneMiniatura: o.tieneMiniatura, creadoPor: u.idUsuario }).returning({ id: notasFicheros.id });
    await ej.insert(notasFicherosDatos).values({ idFichero: n.id, datos: d.datos, miniatura: d.miniatura });
    mapa.set(o.id, n.id);
  }
  if (mapa.size > 0) {
    const texto = JSON.stringify(fila.contenido).replace(/\/api\/notas\/ficheros\?id=(\d+)/g, (m, x: string) => `/api/notas/ficheros?id=${mapa.get(Number(x)) ?? x}`);
    await ej.update(notas).set({ contenido: JSON.parse(texto) as unknown }).where(eq(notas.id, nueva.id));
  }
  return leerNota(ej, u, nueva.id);
}

/* ------------------------------ Compartir ------------------------------ */

export async function leerComparticion(ej: Ejecutor, u: UsuarioActual, id: number): Promise<ComparticionDto> {
  await propia(ej, u, id);
  const con = await ej.select().from(notasCompartidos).where(eq(notasCompartidos.idNota, id));
  const lista = await ej.select({ id: usuarios.idUsuario, nombre: usuarios.nombre, bloqueado: usuarios.bloqueado }).from(usuarios).orderBy(asc(usuarios.nombre));
  return { con: con.map((c) => ({ id_usuario: c.idUsuario, permiso: c.permiso as "lectura" | "edicion" })), usuarios: lista.filter((x) => !x.bloqueado && x.id !== u.idUsuario).map((x) => ({ id: x.id, nombre: x.nombre ?? `Usuario ${x.id}` })) };
}

export async function fijarComparticion(ej: Ejecutor, u: UsuarioActual, id: number, e: EntradaComparticion): Promise<void> {
  await propia(ej, u, id);
  const ids = e.con.map((c) => c.id_usuario);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, "Una persona está repetida");
  if (ids.includes(u.idUsuario)) throw new HttpError(400, "No hace falta compartirla contigo");
  const validos = new Set((await ej.select({ id: usuarios.idUsuario }).from(usuarios)).map((x) => x.id));
  if (ids.some((x) => x !== null && !validos.has(x))) throw new HttpError(400, "Hay una persona que no existe");
  await ej.delete(notasCompartidos).where(eq(notasCompartidos.idNota, id));
  if (e.con.length > 0) await ej.insert(notasCompartidos).values(e.con.map((c) => ({ idNota: id, idUsuario: c.id_usuario, permiso: c.permiso })));
}

/* ------------------------------ Ficheros ------------------------------ */

/** El tipo real por la firma del archivo (no se fía del nombre ni de lo que diga el navegador). */
export function mimeDeFichero(datos: Buffer): string {
  const cab = datos.subarray(0, 12);
  if (cab.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (cab[0] === 0x89 && cab.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (cab[0] === 0xff && cab[1] === 0xd8) return "image/jpeg";
  if (cab.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (cab.subarray(0, 4).toString("latin1") === "RIFF" && cab.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return "application/octet-stream";
}

export async function subirFichero(ej: Ejecutor, u: UsuarioActual, idNota: number, nombre: string, datos: Buffer): Promise<FicheroNotaDto> {
  const { permiso } = await accesoA(ej, u, idNota);
  if (!poderEditar(permiso)) throw new HttpError(403, "Esta nota es solo para leer");
  if (datos.length === 0) throw new HttpError(400, "El fichero está vacío.");
  if (datos.length > MAX_BYTES_FICHERO_NOTA) throw new HttpError(413, "El fichero es demasiado grande (máximo 500 MB).");
  const mime = mimeDeFichero(datos);
  let miniatura: Buffer | null = null;
  if (mime.startsWith("image/") && mime !== "image/gif") {
    try {
      miniatura = await sharp(datos, { failOn: "none", limitInputPixels: 200_000_000 }).rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
    } catch {
      miniatura = null;
    }
  }
  const limpio = nombre.replace(/[\\/\0]/g, "_").slice(0, 200) || "archivo";
  const [f] = await ej.insert(notasFicheros).values({ idNota, nombre: limpio, mime, tamano: datos.length, tieneMiniatura: miniatura !== null, creadoPor: u.idUsuario }).returning();
  await ej.insert(notasFicherosDatos).values({ idFichero: f.id, datos: cifrarBuffer(datos), miniatura: miniatura ? cifrarBuffer(miniatura) : null });
  await ej.update(notas).set({ actualizadoEn: new Date() }).where(eq(notas.id, idNota));
  return aFichero(f);
}

export async function leerFichero(ej: Ejecutor, u: UsuarioActual, id: number, miniatura = false): Promise<{ nombre: string; mime: string; datos: Buffer }> {
  const [f] = await ej.select().from(notasFicheros).where(eq(notasFicheros.id, id));
  if (!f) throw new HttpError(404, "Fichero no encontrado");
  await accesoA(ej, u, f.idNota);
  const [d] = await ej.select().from(notasFicherosDatos).where(eq(notasFicherosDatos.idFichero, id));
  if (!d) throw new HttpError(404, "Fichero no encontrado");
  if (miniatura && d.miniatura) return { nombre: f.nombre, mime: "image/jpeg", datos: descifrarBuffer(d.miniatura) };
  return { nombre: f.nombre, mime: f.mime, datos: descifrarBuffer(d.datos) };
}

export async function eliminarFichero(ej: Ejecutor, u: UsuarioActual, id: number): Promise<void> {
  const [f] = await ej.select().from(notasFicheros).where(eq(notasFicheros.id, id));
  if (!f) throw new HttpError(404, "Fichero no encontrado");
  const { permiso } = await accesoA(ej, u, f.idNota);
  if (!poderEditar(permiso)) throw new HttpError(403, "Esta nota es solo para leer");
  await ej.delete(notasFicheros).where(eq(notasFicheros.id, id));
  await ej.update(notas).set({ actualizadoEn: new Date() }).where(eq(notas.id, f.idNota));
}

/* ------------------------------ Exportar e importar ------------------------------ */

/** Todas mis notas y flujos (los de `tipos`, o todos), con sus grupos y adjuntos, en un paquete para guardar en un archivo. */
export async function exportarNotas(ej: Ejecutor, u: UsuarioActual, tipos?: TipoNota[], conFicheros = true): Promise<PaqueteNotas> {
  const filas = await ej.select().from(notas).where(and(eq(notas.idUsuario, u.idUsuario), isNull(notas.eliminadoEn), tipos && tipos.length > 0 ? inArray(notas.tipo, tipos) : undefined)).orderBy(asc(notas.id));
  const grupoIds = new Set(filas.map((f) => f.idGrupo).filter((x): x is number => x !== null));
  const grupos = (await ej.select().from(notasGrupos).where(eq(notasGrupos.idUsuario, u.idUsuario))).filter((g) => grupoIds.has(g.id));
  const ficheros: PaqueteNotas["ficheros"] = [];
  if (conFicheros && filas.length > 0) {
    const lista = await ej.select().from(notasFicheros).where(inArray(notasFicheros.idNota, filas.map((f) => f.id)));
    for (const f of lista) {
      const [d] = await ej.select().from(notasFicherosDatos).where(eq(notasFicherosDatos.idFichero, f.id));
      if (d) ficheros.push({ id: f.id, id_nota: f.idNota, nombre: f.nombre, mime: f.mime, datos: descifrarBuffer(d.datos).toString("base64") });
    }
  }
  return {
    formato: FORMATO_EXPORTACION,
    version: 1,
    exportado_en: new Date().toISOString(),
    grupos: grupos.map((g) => ({ id: g.id, ambito: g.ambito as AmbitoGrupo, nombre: g.nombre, color: g.color })),
    notas: filas.map((f) => ({ id: f.id, tipo: f.tipo as TipoNota, titulo: f.titulo, contenido: f.contenido, color: f.color, fijada: f.fijada, etiquetas: f.etiquetas, id_grupo: f.idGrupo, creado_en: f.creadoEn.toISOString() })),
    ficheros,
  };
}

/** Importa un paquete como notas y flujos nuevos míos: los grupos con el mismo nombre se reutilizan y los adjuntos se vuelven a enlazar. Nunca pisa nada. */
export async function importarNotas(ej: Ejecutor, u: UsuarioActual, crudo: unknown): Promise<{ notas: number; grupos: number; ficheros: number }> {
  const r = esquemaPaquete.safeParse(crudo);
  if (!r.success) throw new HttpError(400, "El archivo no es un paquete de notas válido");
  const p = r.data;
  return ej.transaction(async (tx) => {
    const existentes = await tx.select().from(notasGrupos).where(eq(notasGrupos.idUsuario, u.idUsuario));
    const mapaGrupo = new Map<number, number>();
    let gruposNuevos = 0;
    for (const g of p.grupos) {
      const ya = existentes.find((x) => x.ambito === g.ambito && x.nombre.toLowerCase() === g.nombre.toLowerCase());
      if (ya) mapaGrupo.set(g.id, ya.id);
      else {
        const creado = await crearGrupo(tx, u, { ambito: g.ambito, nombre: g.nombre, color: g.color });
        existentes.push({ id: creado.id, idUsuario: u.idUsuario, ambito: g.ambito, nombre: g.nombre, color: g.color, orden: creado.orden, creadoEn: new Date() });
        mapaGrupo.set(g.id, creado.id);
        gruposNuevos++;
      }
    }
    const mapaNota = new Map<number, number>();
    const mapaFichero = new Map<number, number>();
    let nFicheros = 0;
    for (const n of p.notas) {
      const contenido = (n.contenido && typeof n.contenido === "object" ? n.contenido : contenidoInicial(n.tipo)) as Record<string, unknown>;
      const [f] = await tx
        .insert(notas)
        .values({ idUsuario: u.idUsuario, tipo: n.tipo, idGrupo: n.id_grupo !== null ? (mapaGrupo.get(n.id_grupo) ?? null) : null, titulo: n.titulo, contenido, texto: textoDe(n.tipo, contenido), color: n.color, fijada: n.fijada, etiquetas: normalizarEtiquetas(n.etiquetas) })
        .returning({ id: notas.id });
      mapaNota.set(n.id, f.id);
    }
    for (const fi of p.ficheros) {
      const idNota = mapaNota.get(fi.id_nota);
      if (idNota === undefined) continue;
      const datos = Buffer.from(fi.datos, "base64");
      const nuevo = await subirFichero(tx, u, idNota, fi.nombre, datos);
      mapaFichero.set(fi.id, nuevo.id);
      nFicheros++;
    }
    if (mapaFichero.size > 0) {
      for (const idNueva of mapaNota.values()) {
        const [f] = await tx.select({ contenido: notas.contenido }).from(notas).where(eq(notas.id, idNueva));
        const original = JSON.stringify(f.contenido);
        if (!original.includes("/api/notas/ficheros?id=")) continue;
        const nuevo = original.replace(/\/api\/notas\/ficheros\?id=(\d+)/g, (m, x: string) => `/api/notas/ficheros?id=${mapaFichero.get(Number(x)) ?? x}`);
        await tx.update(notas).set({ contenido: JSON.parse(nuevo) as unknown }).where(eq(notas.id, idNueva));
      }
    }
    return { notas: mapaNota.size, grupos: gruposNuevos, ficheros: nFicheros };
  });
}
