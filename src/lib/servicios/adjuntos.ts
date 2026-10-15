import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import sharp from "sharp";
import type { Ejecutor } from "@/db";
import { adjuntos, adjuntosDatos, clientes, expedientes } from "@/db/schema";
import { cifrarBuffer, descifrarBuffer } from "@/lib/auth/cifrado";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";

/**
 * Adjuntos (DNI, pedidos, PDF…): se guardan en PostgreSQL, cifrados con la clave de la aplicación, de modo que las
 * copias de seguridad (`pg_dump`, Google Drive) los incluyen sin tareas extra y los volcados no dejan DNI en claro.
 * Las imágenes se reducen y se limpian (se quitan los metadatos EXIF/GPS) y se genera una miniatura para la vista previa.
 */

export const MAX_BYTES_ADJUNTO = 15 * 1024 * 1024;
export const TIPOS_ADJUNTO = ["dni_frente", "dni_reverso", "pedido", "foto_cliente", "otro"] as const;
export type TipoAdjunto = (typeof TIPOS_ADJUNTO)[number];
export type MimeAdjunto = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export interface AdjuntoDto {
  id: number;
  tipo: TipoAdjunto;
  nombre: string;
  mime: string;
  tamano: number;
  tieneMiniatura: boolean;
  creadoEn: string;
  idCliente: number | null;
  idExpediente: number | null;
}

/** Tipo real por la firma del fichero (no se fía del nombre ni de la cabecera del navegador). */
export function detectarMime(datos: Buffer): MimeAdjunto | null {
  if (datos.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (datos[0] === 0x89 && datos.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (datos[0] === 0xff && datos[1] === 0xd8) return "image/jpeg";
  if (datos.subarray(0, 4).toString("latin1") === "RIFF" && datos.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/** Imagen limpia: orientación aplicada, máximo 2400 px, JPEG y sin metadatos. */
export async function normalizarImagen(datos: Buffer): Promise<{ datos: Buffer; miniatura: Buffer }> {
  const base = () => sharp(datos, { failOn: "error", limitInputPixels: 100_000_000 }).rotate().flatten({ background: "#ffffff" });
  try {
    return {
      datos: await base().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(),
      miniatura: await base().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer(),
    };
  } catch {
    throw new HttpError(400, "La imagen no se puede leer (¿está dañada?).");
  }
}

function aDto(a: typeof adjuntos.$inferSelect): AdjuntoDto {
  return {
    id: a.id,
    tipo: a.tipo as TipoAdjunto,
    nombre: a.nombre,
    mime: a.mime,
    tamano: a.tamano,
    tieneMiniatura: a.tieneMiniatura,
    creadoEn: a.creadoEn.toISOString(),
    idCliente: a.idCliente,
    idExpediente: a.idExpediente,
  };
}

export interface EntradaAdjunto {
  datos: Buffer;
  nombre: string;
  tipo: TipoAdjunto;
  idCliente?: number | null;
  idExpediente?: number | null;
  creadoPor: number;
  /** Para la foto del cliente: la miniatura es la propia imagen recortada. */
  miniaturaPropia?: Buffer;
}

/** Guarda un adjunto. Sin cliente ni expediente queda como «pendiente» hasta que se guarde el registro al que pertenece. */
export async function guardarAdjunto(ej: Ejecutor, e: EntradaAdjunto): Promise<AdjuntoDto> {
  if (e.datos.length === 0) throw new HttpError(400, "El fichero está vacío.");
  if (e.datos.length > MAX_BYTES_ADJUNTO) throw new HttpError(413, "El fichero es demasiado grande (máximo 15 MB).");
  const mime = detectarMime(e.datos);
  if (!mime) throw new HttpError(415, "Formato no admitido: sube un PDF o una imagen (JPG, PNG, WebP).");

  let contenido = e.datos;
  let miniatura: Buffer | null = e.miniaturaPropia ?? null;
  let mimeFinal: string = mime;
  if (mime !== "application/pdf") {
    const n = await normalizarImagen(e.datos);
    contenido = n.datos;
    miniatura = e.miniaturaPropia ?? n.miniatura;
    mimeFinal = "image/jpeg";
  }
  const nombre = e.nombre.replace(/[\\/\0]/g, "_").slice(0, 200) || "adjunto";

  return ej.transaction(async (tx) => {
    // Limpieza oportunista de subidas que nunca llegaron a vincularse a un registro
    await tx.delete(adjuntos).where(and(eq(adjuntos.ambito, "pendiente"), lt(adjuntos.creadoEn, new Date(Date.now() - 2 * 24 * 3600 * 1000))));
    const ambito = e.idExpediente ? "expediente" : e.idCliente ? "cliente" : "pendiente";
    const [fila] = await tx
      .insert(adjuntos)
      .values({ ambito, idCliente: e.idCliente ?? null, idExpediente: e.idExpediente ?? null, tipo: e.tipo, nombre, mime: mimeFinal, tamano: contenido.length, tieneMiniatura: miniatura !== null, creadoPor: e.creadoPor })
      .returning();
    await tx.insert(adjuntosDatos).values({ idAdjunto: fila.id, datos: cifrarBuffer(contenido), miniatura: miniatura ? cifrarBuffer(miniatura) : null });
    return aDto(fila);
  });
}

export async function listarAdjuntos(ej: Ejecutor, filtro: { idCliente?: number; idExpediente?: number }): Promise<AdjuntoDto[]> {
  if (!filtro.idCliente && !filtro.idExpediente) throw new HttpError(400, "Indica el cliente o el expediente");
  const filas = await ej
    .select()
    .from(adjuntos)
    .where(and(isNull(adjuntos.eliminadoEn), filtro.idExpediente ? eq(adjuntos.idExpediente, filtro.idExpediente) : eq(adjuntos.idCliente, filtro.idCliente as number)))
    .orderBy(desc(adjuntos.id));
  return filas.map(aDto);
}

export async function leerAdjunto(ej: Ejecutor, id: number, miniatura = false): Promise<{ meta: AdjuntoDto; datos: Buffer; mime: string } | null> {
  const [a] = await ej.select().from(adjuntos).where(and(eq(adjuntos.id, id), isNull(adjuntos.eliminadoEn)));
  if (!a) return null;
  const [d] = await ej.select().from(adjuntosDatos).where(eq(adjuntosDatos.idAdjunto, id));
  if (!d) return null;
  if (miniatura && d.miniatura) return { meta: aDto(a), datos: descifrarBuffer(d.miniatura), mime: "image/jpeg" };
  return { meta: aDto(a), datos: descifrarBuffer(d.datos), mime: a.mime };
}

/** Borrado lógico: deja de mostrarse, pero el fichero se conserva. Solo el administrador o quien lo subió. */
export async function eliminarAdjunto(ej: Ejecutor, usuario: UsuarioActual, id: number): Promise<void> {
  const [a] = await ej.select().from(adjuntos).where(and(eq(adjuntos.id, id), isNull(adjuntos.eliminadoEn)));
  if (!a) throw new HttpError(404, "Adjunto no encontrado");
  if (!esAdministrador(usuario.rol) && a.creadoPor !== usuario.idUsuario) throw new HttpError(403, "Solo puede eliminarlo el administrador o quien lo subió");
  await ej.transaction(async (tx) => {
    await tx.update(adjuntos).set({ eliminadoEn: new Date() }).where(eq(adjuntos.id, id));
    await tx.update(clientes).set({ fotoAdjuntoId: null }).where(eq(clientes.fotoAdjuntoId, id));
  });
}

/** Vincula adjuntos «pendientes» (subidos por el mismo usuario) a un cliente y/o expediente ya guardado. */
export async function vincularPendientes(ej: Ejecutor, ids: number[], destino: { idCliente?: number | null; idExpediente?: number | null }, idUsuario: number): Promise<number> {
  if (ids.length === 0) return 0;
  if (destino.idCliente) {
    const [c] = await ej.select({ id: clientes.id }).from(clientes).where(and(eq(clientes.id, destino.idCliente), isNull(clientes.eliminadoEn)));
    if (!c) throw new HttpError(404, "Cliente no encontrado");
  }
  if (destino.idExpediente) {
    const [x] = await ej.select({ id: expedientes.idExpediente }).from(expedientes).where(and(eq(expedientes.idExpediente, destino.idExpediente), isNull(expedientes.eliminadoEn)));
    if (!x) throw new HttpError(404, "Expediente no encontrado");
  }
  const filas = await ej
    .update(adjuntos)
    .set({ ambito: destino.idExpediente ? "expediente" : "cliente", idCliente: destino.idCliente ?? null, idExpediente: destino.idExpediente ?? null })
    .where(and(inArray(adjuntos.id, ids), eq(adjuntos.ambito, "pendiente"), eq(adjuntos.creadoPor, idUsuario)))
    .returning({ id: adjuntos.id, tipo: adjuntos.tipo, miniatura: adjuntos.tieneMiniatura });
  // La foto del cliente se enlaza automáticamente
  const foto = filas.find((f) => f.tipo === "foto_cliente" && f.miniatura);
  if (foto && destino.idCliente) await ej.update(clientes).set({ fotoAdjuntoId: foto.id }).where(eq(clientes.id, destino.idCliente));
  return filas.length;
}

/** Fija (o quita, con null) la foto de un cliente a partir de un adjunto suyo con miniatura. */
export async function establecerFotoCliente(ej: Ejecutor, idCliente: number, idAdjunto: number | null): Promise<void> {
  if (idAdjunto !== null) {
    const [a] = await ej.select().from(adjuntos).where(and(eq(adjuntos.id, idAdjunto), eq(adjuntos.idCliente, idCliente), isNull(adjuntos.eliminadoEn)));
    if (!a || !a.tieneMiniatura) throw new HttpError(400, "Ese adjunto no se puede usar como foto");
  }
  const filas = await ej.update(clientes).set({ fotoAdjuntoId: idAdjunto }).where(and(eq(clientes.id, idCliente), isNull(clientes.eliminadoEn))).returning({ id: clientes.id });
  if (filas.length === 0) throw new HttpError(404, "Cliente no encontrado");
}
