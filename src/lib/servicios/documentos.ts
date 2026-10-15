import sharp from "sharp";
import type { Ejecutor } from "@/db";
import { combinarDni, nombreCompleto, type DatosDni } from "@/lib/documentos/dni";
import { parsearPedido, type DatosPedido } from "@/lib/documentos/pedido";
import type { RegionFoto } from "@/lib/documentos/tarjetas";
import { HttpError } from "@/lib/auth/sesion";
import { guardarAdjunto, MAX_BYTES_ADJUNTO, detectarMime, type AdjuntoDto } from "./adjuntos";
import { leerCatalogos } from "./catalogos";
import { leerTarjetasDeImagen, type TarjetaLeida } from "./dni-lectura";
import { enCola, imagenesDePdf, textoDeDocumento } from "./ocr";

/**
 * Lectura automática de documentos para rellenar fichas: el DNI (cliente y foto) y el pedido (expediente).
 * Nada se guarda en las fichas: se devuelven los datos para que el usuario los revise; los ficheros quedan como
 * adjuntos «pendientes» y se vinculan al registro cuando éste se guarda.
 */

export interface ResultadoDni {
  datos: DatosDni & { nombreCompleto: string | null };
  /** Adjuntos creados (pendientes de vincular): una imagen por cada cara de DNI encontrada. */
  adjuntos: AdjuntoDto[];
  /** Adjunto con la cara recortada del anverso, si se ha podido. */
  fotoId: number | null;
  lado: "anverso" | "reverso" | "desconocido";
  /** Tarjetas encontradas en el fichero. */
  tarjetas: number;
}

export interface ResultadoPedido {
  datos: DatosPedido;
  adjunto: AdjuntoDto;
  metodo: "texto-pdf" | "ocr";
}

/**
 * Recorta la fotografía del titular del anverso. Con la región localizada se usa tal cual (con la proporción de una
 * foto de carnet, anclada a la izquierda); sin ella no hay recorte. Devuelve JPEG de 300×380.
 */
export async function recortarFotoDni(anverso: Buffer, foto: RegionFoto | null): Promise<Buffer | null> {
  if (!foto) return null;
  try {
    const { width: W, height: H } = await sharp(anverso, { failOn: "none" }).metadata();
    if (!W || !H) return null;
    const alto = Math.round(foto.alto * H);
    const ancho = Math.min(Math.round(foto.ancho * W), Math.round(alto * 0.82));
    const left = Math.max(0, Math.round(foto.x * W));
    const top = Math.max(0, Math.round(foto.y * H));
    return await sharp(anverso, { failOn: "none" })
      .extract({ left, top, width: Math.min(ancho, W - left), height: Math.min(alto, H - top) })
      .resize(300, 380, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return null;
  }
}

/** Imágenes del fichero: él mismo si es una imagen, o sus páginas (hasta 4) si es un PDF escaneado. */
async function imagenesDelFichero(datos: Buffer): Promise<Buffer[]> {
  const mime = detectarMime(datos);
  if (!mime) throw new HttpError(415, "Formato no admitido: sube una imagen (JPG, PNG, WebP) o un PDF.");
  if (mime === "application/pdf") return (await imagenesDePdf(datos)).imagenes.slice(0, 4);
  return [datos];
}

/**
 * Lee un DNI. Admite una foto, o una página escaneada con una o dos tarjetas (anverso y reverso, giradas o no), y un
 * PDF de varias páginas. Cada cara se guarda como adjunto, se extraen nombre, DNI y fecha de nacimiento y se recorta la
 * foto del titular.
 */
export async function leerDni(ej: Ejecutor, idUsuario: number, nombreFichero: string, datos: Buffer): Promise<ResultadoDni> {
  if (datos.length === 0) throw new HttpError(400, "El fichero está vacío.");
  if (datos.length > MAX_BYTES_ADJUNTO) throw new HttpError(413, "El fichero es demasiado grande (máximo 15 MB).");

  const imagenes = await imagenesDelFichero(datos);
  const tarjetas: TarjetaLeida[] = await enCola(async () => {
    try {
      const res: TarjetaLeida[] = [];
      for (const imagen of imagenes) {
        for (const t of await leerTarjetasDeImagen(imagen)) if (res.length < 4) res.push(t);
      }
      return res;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error("Error leyendo el DNI:", e instanceof Error ? e.message : e);
      throw new HttpError(500, "No se ha podido leer el DNI. Prueba con una imagen más nítida, con buena luz y sin reflejos.");
    }
  });

  const combinado = combinarDni(...tarjetas.map((t) => t.datos));
  const hayDatos = !!(combinado.dni || combinado.nombre || combinado.apellidos || combinado.fechaNacimiento);
  const avisos = [...combinado.avisos];
  if (!hayDatos) avisos.push("No se han podido leer datos del documento (la imagen puede estar muy clara o borrosa). Los documentos quedan adjuntos para rellenar los datos a mano.");

  const adjuntos: AdjuntoDto[] = [];
  let fotoId: number | null = null;
  const guardadas = tarjetas.length > 0 ? tarjetas : [];
  let nAnverso = 0;
  let nReverso = 0;
  for (const t of guardadas) {
    const esFrente = t.lado === "anverso";
    const nombre = esFrente ? `dni-anverso${++nAnverso > 1 ? `-${nAnverso}` : ""}.jpg` : `dni-reverso${++nReverso > 1 ? `-${nReverso}` : ""}.jpg`;
    adjuntos.push(await guardarAdjunto(ej, { datos: t.imagen, nombre, tipo: esFrente ? "dni_frente" : "dni_reverso", creadoPor: idUsuario }));
    if (esFrente && fotoId === null) {
      const recorte = await recortarFotoDni(t.imagen, t.foto);
      if (recorte) {
        const foto = await guardarAdjunto(ej, { datos: recorte, nombre: "foto-cliente.jpg", tipo: "foto_cliente", creadoPor: idUsuario, miniaturaPropia: recorte });
        fotoId = foto.id;
        adjuntos.push(foto);
      }
    }
  }
  // Sin tarjetas reconocidas: el fichero original queda adjunto igualmente
  if (adjuntos.length === 0) adjuntos.push(await guardarAdjunto(ej, { datos, nombre: nombreFichero, tipo: "dni_frente", creadoPor: idUsuario }));

  const lado: ResultadoDni["lado"] = tarjetas.some((t) => t.lado === "anverso") ? "anverso" : tarjetas.some((t) => t.lado === "reverso") ? "reverso" : "desconocido";
  return { datos: { ...combinado, avisos, nombreCompleto: nombreCompleto(combinado) }, adjuntos, fotoId, lado, tarjetas: tarjetas.length };
}

/** Lee un pedido (PDF o imagen) y propone los datos del expediente comparando con los catálogos. */
export async function leerPedido(ej: Ejecutor, idUsuario: number, nombreFichero: string, datos: Buffer): Promise<ResultadoPedido> {
  const { texto, metodo } = await textoDeDocumento(datos);
  const catalogos = await leerCatalogos(ej);
  const marcas = new Map(catalogos.marcas.map((m) => [m.id_marca, m.nombre]));
  const parsed = parsearPedido(texto, {
    modelos: catalogos.modelos.map((m) => ({ id: m.id_modelo, nombre: m.nombre_modelo, marca: m.marca_id ? (marcas.get(m.marca_id) ?? null) : null })),
    tiposVenta: catalogos.tiposVenta.map((t) => ({ id: t.id_tipo_de_venta, nombre: t.nombre_tipo_venta, categoria: t.categoria })),
  });
  const adjunto = await guardarAdjunto(ej, { datos, nombre: nombreFichero, tipo: "pedido", creadoPor: idUsuario });
  return { datos: parsed, adjunto, metodo };
}
