import sharp from "sharp";
import type { Ejecutor } from "@/db";
import { combinarDni, nombreCompleto, parsearAnverso, parsearMrz, type DatosDni } from "@/lib/documentos/dni";
import { parsearPedido, type DatosPedido } from "@/lib/documentos/pedido";
import { HttpError } from "@/lib/auth/sesion";
import { guardarAdjunto, MAX_BYTES_ADJUNTO, detectarMime, type AdjuntoDto } from "./adjuntos";
import { leerCatalogos } from "./catalogos";
import { enCola, imagenesDePdf, ocrImagenes, textoDeDocumento } from "./ocr";

/**
 * Lectura automática de documentos para rellenar fichas: el DNI (cliente y foto) y el pedido (expediente).
 * Nada se guarda en las fichas: se devuelven los datos para que el usuario los revise; el fichero queda como
 * adjunto «pendiente» y se vincula al registro cuando éste se guarda.
 */

export interface ResultadoDni {
  datos: DatosDni & { nombreCompleto: string | null };
  /** Adjuntos creados (pendientes de vincular). */
  adjuntos: AdjuntoDto[];
  /** Adjunto con la cara recortada del anverso, si se ha podido. */
  fotoId: number | null;
  lado: "anverso" | "reverso" | "desconocido";
}

export interface ResultadoPedido {
  datos: DatosPedido;
  adjunto: AdjuntoDto;
  metodo: "texto-pdf" | "ocr";
}

const ALFABETO_MRZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";

/** Imagen preparada para OCR: orientada, en grises, contrastada y con ancho suficiente. */
async function prepararParaOcr(img: Buffer, ancho = 2200): Promise<Buffer> {
  return sharp(img, { failOn: "none", limitInputPixels: 100_000_000 }).rotate().greyscale().normalise().resize({ width: ancho, withoutEnlargement: false }).png().toBuffer();
}

/**
 * Recorta la fotografía del titular del anverso del DNI español (a la izquierda). Es una región fija proporcional:
 * funciona si la foto del documento ocupa casi todo el encuadre. Devuelve JPEG de 300×380.
 */
export async function recortarFotoDni(anverso: Buffer): Promise<Buffer | null> {
  try {
    const base = sharp(anverso, { failOn: "none", limitInputPixels: 100_000_000 }).rotate();
    const { width, height } = await base.metadata();
    if (!width || !height) return null;
    // Si la tarjeta se fotografió en vertical, se endereza
    const horizontal = width >= height ? base : sharp(await base.rotate(90).toBuffer());
    const meta = width >= height ? { w: width, h: height } : { w: height, h: width };
    const region = { left: Math.round(meta.w * 0.035), top: Math.round(meta.h * 0.2), width: Math.round(meta.w * 0.3), height: Math.round(meta.h * 0.62) };
    return await horizontal.extract(region).resize(300, 380, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    return null;
  }
}

async function imagenesDelFichero(datos: Buffer): Promise<{ imagenes: Buffer[]; textoPdf: string }> {
  const mime = detectarMime(datos);
  if (!mime) throw new HttpError(415, "Formato no admitido: sube una imagen (JPG, PNG, WebP) o un PDF.");
  if (mime === "application/pdf") {
    const { imagenes, texto } = await imagenesDePdf(datos);
    return { imagenes: imagenes.slice(0, 2), textoPdf: texto };
  }
  return { imagenes: [datos], textoPdf: "" };
}

/** Lee un DNI (una cara por fichero; un PDF puede traer las dos) y devuelve nombre, número, fecha de nacimiento y foto. */
export async function leerDni(ej: Ejecutor, idUsuario: number, nombreFichero: string, datos: Buffer): Promise<ResultadoDni> {
  if (datos.length === 0) throw new HttpError(400, "El fichero está vacío.");
  if (datos.length > MAX_BYTES_ADJUNTO) throw new HttpError(413, "El fichero es demasiado grande (máximo 15 MB).");

  const { imagenes } = await imagenesDelFichero(datos);
  const lecturas = await enCola(async () => {
    const res: { imagen: Buffer; mrz: DatosDni | null; anverso: DatosDni | null }[] = [];
    for (const imagen of imagenes) {
      try {
        const lista = await prepararParaOcr(imagen);
        const completo = (await ocrImagenes([lista])).map((l) => l.texto).join("\n");
        // Zona legible por máquina: franja inferior del reverso, solo con el alfabeto permitido
        const meta = await sharp(lista).metadata();
        const alto = meta.height ?? 0;
        const franja = await sharp(lista)
          .extract({ left: 0, top: Math.round(alto * 0.55), width: meta.width ?? 1, height: Math.max(1, alto - Math.round(alto * 0.55)) })
          .toBuffer();
        const textoMrz = (await ocrImagenes([franja], { lista: ALFABETO_MRZ })).map((l) => l.texto).join("\n");
        const mrz = parsearMrz(textoMrz) ?? parsearMrz(completo);
        res.push({ imagen, mrz, anverso: parsearAnverso(completo) });
      } catch (e) {
        if (e instanceof HttpError) throw e;
        console.error("Error leyendo el DNI:", e instanceof Error ? e.message : e);
        throw new HttpError(500, "No se ha podido leer el DNI. Prueba con una foto más nítida, con buena luz y sin reflejos.");
      }
    }
    return res;
  });

  const combinado = combinarDni(...lecturas.flatMap((l) => [l.mrz, l.anverso]));
  const hayDatos = !!(combinado.dni || combinado.nombre || combinado.apellidos || combinado.fechaNacimiento);
  const avisos = [...combinado.avisos];
  if (!hayDatos) avisos.push("No se han podido leer datos del documento. Prueba con una foto más nítida.");

  // El primer fichero es el que se guarda como adjunto; su tipo depende de la cara leída
  const principal = lecturas[0];
  const esReverso = !!principal?.mrz;
  const lado: ResultadoDni["lado"] = !principal ? "desconocido" : esReverso ? "reverso" : principal.anverso ? "anverso" : "desconocido";
  const adjuntos: AdjuntoDto[] = [await guardarAdjunto(ej, { datos, nombre: nombreFichero, tipo: esReverso ? "dni_reverso" : "dni_frente", creadoPor: idUsuario })];

  // Foto del titular: del anverso (o del primer fichero si no se ha reconocido ninguna cara)
  let fotoId: number | null = null;
  const fuenteFoto = lecturas.find((l) => !l.mrz) ?? null;
  if (fuenteFoto) {
    const recorte = await recortarFotoDni(fuenteFoto.imagen);
    if (recorte) {
      const foto = await guardarAdjunto(ej, { datos: recorte, nombre: "foto-cliente.jpg", tipo: "foto_cliente", creadoPor: idUsuario, miniaturaPropia: recorte });
      fotoId = foto.id;
      adjuntos.push(foto);
    }
  }
  return { datos: { ...combinado, avisos, nombreCompleto: nombreCompleto(combinado) }, adjuntos, fotoId, lado };
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
