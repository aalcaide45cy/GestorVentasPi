import sharp from "sharp";
import { combinarDni, parsearAnverso, parsearFrente, parsearMrz, type DatosDni } from "@/lib/documentos/dni";
import { umbralAdaptativo } from "@/lib/documentos/imagen";
import { detectarTarjetas, localizarFoto, type RegionFoto } from "@/lib/documentos/tarjetas";
import { ocrImagenes } from "./ocr";

/**
 * Lectura de una o varias tarjetas de DNI dentro de una imagen (foto o página escaneada): las separa del fondo, las
 * endereza, decide si es anverso o reverso y extrae los datos. Cada paso es tolerante: lo que no se pueda leer se
 * devuelve vacío y la pantalla lo deja para rellenar a mano.
 */

export type LadoDni = "anverso" | "reverso" | "desconocido";

export interface TarjetaLeida {
  /** Tarjeta enderezada (horizontal, texto legible). */
  imagen: Buffer;
  lado: LadoDni;
  datos: DatosDni | null;
  /** Región de la fotografía del titular (solo anverso), si se ha localizado. */
  foto: RegionFoto | null;
}

const ALFABETO_MRZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";
type Variante = "rojo" | "umbral" | "gris";

/** Versiones de la tarjeta pensadas para el OCR (el fondo guilochado de la tarjeta confunde a una sola). */
async function variante(img: Buffer, tipo: Variante, ancho: number): Promise<Buffer> {
  const base = sharp(img, { failOn: "none" });
  if (tipo === "rojo") return base.extractChannel(0).resize({ width: ancho }).normalise().png().toBuffer();
  if (tipo === "umbral") return base.greyscale().resize({ width: ancho }).normalise().threshold(140).png().toBuffer();
  return base.greyscale().resize({ width: ancho }).normalise().png().toBuffer();
}

async function ocrTexto(img: Buffer, opciones: Parameters<typeof ocrImagenes>[1] = {}): Promise<string> {
  return (await ocrImagenes([img], opciones)).map((l) => l.texto).join("\n");
}

/** Versiones de la franja inferior (donde está la zona legible por máquina) preparadas para su OCR. */
async function franjasMrz(img: Buffer): Promise<(() => Promise<Buffer>)[]> {
  const meta = await sharp(img).metadata();
  const alto = meta.height ?? 0;
  const top = Math.round(alto * 0.58);
  const franja = await sharp(img, { failOn: "none" }).extract({ left: 0, top, width: meta.width ?? 1, height: Math.max(1, alto - top) }).toBuffer();
  return [
    () => sharp(franja).greyscale().resize({ width: 3000 }).normalise({ lower: 5, upper: 60 }).linear(1.8, -90).png().toBuffer(),
    () => umbralAdaptativo(franja, 3000, 35, 10),
    () => sharp(franja).greyscale().resize({ width: 3000 }).clahe({ width: 100, height: 40, maxSlope: 5 }).normalise().threshold(120).png().toBuffer(),
  ];
}

/** Giros posibles para dejar la tarjeta horizontal. */
async function giros(img: Buffer): Promise<number[]> {
  const m = await sharp(img).metadata();
  return (m.height ?? 0) > (m.width ?? 0) ? [90, 270] : [0, 180];
}

/**
 * Endereza la tarjeta por la fotografía (en el anverso está a la izquierda). Sin foto (reverso) devuelve los dos giros
 * posibles: no hay forma barata de saber cuál es el bueno y se decide al leer la zona legible por máquina.
 */
async function enderezar(tarjeta: Buffer): Promise<{ imagen: Buffer; foto: RegionFoto | null; alternativas: Buffer[] }> {
  const candidatos = await giros(tarjeta);
  const vistas = await Promise.all(
    candidatos.map(async (g) => {
      const imagen = await sharp(tarjeta, { failOn: "none" }).rotate(g).png().toBuffer();
      return { g, imagen, foto: await localizarFoto(imagen) };
    }),
  );
  const conFoto = vistas.filter((v) => v.foto && v.foto.x + v.foto.ancho / 2 < 0.5);
  if (conFoto.length >= 1) {
    const mejor = conFoto.sort((a, b) => (b.foto?.densidad ?? 0) - (a.foto?.densidad ?? 0))[0];
    return { imagen: mejor.imagen, foto: mejor.foto, alternativas: vistas.map((v) => v.imagen) };
  }
  return { imagen: vistas[0].imagen, foto: null, alternativas: vistas.map((v) => v.imagen) };
}

/** Reverso: prueba cada versión de la franja en cada giro hasta que la zona legible pasa la comprobación. */
async function leerReverso(vistas: Buffer[], variantes = 3): Promise<{ imagen: Buffer; datos: DatosDni | null }> {
  const preparadas = await Promise.all(vistas.map(async (v) => ({ v, hacer: await franjasMrz(v) })));
  for (let i = 0; i < variantes; i++) {
    for (const { v, hacer } of preparadas) {
      const mrz = parsearMrz(await ocrTexto(await hacer[i](), { lista: ALFABETO_MRZ }));
      if (mrz && (mrz.dni || mrz.fechaNacimiento)) return { imagen: v, datos: mrz };
    }
  }
  return { imagen: vistas[0], datos: null };
}

/** Anverso: texto de la zona de campos (a la derecha de la foto) en varias versiones, más el de la tarjeta entera. */
async function leerAnverso(imagen: Buffer, foto: RegionFoto | null): Promise<DatosDni | null> {
  const meta = await sharp(imagen).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const campos: string[] = [];
  const generales: string[] = [];
  if (foto && W && H) {
    // Foto de carnet: unos 0,8 de ancho/alto; los campos empiezan a su derecha
    const anchoFoto = Math.min(foto.ancho, (foto.alto * 0.82 * H) / W);
    const left = Math.min(W - 10, Math.round((foto.x + anchoFoto) * W));
    const top = Math.max(0, Math.round((foto.y - 0.13) * H));
    const alto = Math.min(H - top, Math.round((foto.y + foto.alto + 0.03) * H) - top);
    const region = await sharp(imagen).extract({ left, top, width: Math.max(10, Math.round(W * 0.985) - left), height: Math.max(10, alto) }).toBuffer();
    for (const tipo of ["rojo", "gris", "umbral"] as const) campos.push(await ocrTexto(await variante(region, tipo, 1600), { psm: "bloque" }));
  } else {
    for (const tipo of ["rojo", "umbral"] as const) generales.push(await ocrTexto(await variante(imagen, tipo, 2400), { psm: "disperso" }));
  }
  return parsearFrente(campos, generales) ?? parsearAnverso([...campos, ...generales].join("\n"));
}

/** Lee una tarjeta ya recortada. */
export async function leerTarjeta(tarjeta: Buffer): Promise<TarjetaLeida> {
  const { imagen, foto, alternativas } = await enderezar(tarjeta);
  if (foto) {
    // Una «foto» poco densa puede ser el mapa o el fondo de un reverso: se comprueba si hay zona legible por máquina
    if (foto.densidad < 0.65) {
      const reverso = await leerReverso(alternativas, 1);
      if (reverso.datos) return { imagen: reverso.imagen, lado: "reverso", datos: reverso.datos, foto: null };
    }
    return { imagen, lado: "anverso", datos: await leerAnverso(imagen, foto), foto };
  }
  // Sin foto: reverso. Se lee la zona legible; si no se lee, la tarjeta queda adjunta para rellenar a mano
  const r = await leerReverso(alternativas);
  return { imagen: r.imagen, lado: "reverso", datos: r.datos, foto: null };
}

/** Lee todas las tarjetas de una imagen (hasta cuatro) y las devuelve con sus datos. */
export async function leerTarjetasDeImagen(img: Buffer): Promise<TarjetaLeida[]> {
  const tarjetas = await detectarTarjetas(img);
  const leidas: TarjetaLeida[] = [];
  for (const t of tarjetas) leidas.push(await leerTarjeta(t.imagen));
  return leidas;
}

export { combinarDni };
