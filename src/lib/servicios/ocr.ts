import path from "node:path";
import { pathToFileURL } from "node:url";
import { HttpError } from "@/lib/auth/sesion";
import { filasDeTexto, type FilaRejilla } from "@/lib/rejilla/analizar";

/**
 * Reconocimiento (OCR) local de la rejilla en PDF o imagen. Todo se ejecuta en el propio equipo (Tesseract compilado a
 * WebAssembly, con el idioma español incluido): no se envía nada a internet y funciona igual en AMD64 y ARM64.
 *
 * - PDF con texto (lo habitual si se exporta desde Excel o un programa): se lee el texto directamente, sin OCR.
 * - PDF escaneado o foto: se rasteriza/lee la imagen y se reconoce con Tesseract.
 */

export const MAX_BYTES_OCR = 15 * 1024 * 1024;
const MAX_PAGINAS = 15;
const ESCALA_RASTER = 2.5;

export interface ResultadoOcr {
  filas: FilaRejilla[];
  texto: string;
  metodo: "texto-pdf" | "ocr";
  paginas: number;
  aviso: string | null;
}

export type TipoOcr = "pdf" | "imagen";

/** Detecta el tipo por la firma del fichero (no se fía del nombre ni de la cabecera). */
export function tipoDeFichero(datos: Buffer): TipoOcr | null {
  if (datos.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  const h = datos.subarray(0, 12);
  if (h[0] === 0x89 && h.subarray(1, 4).toString("latin1") === "PNG") return "imagen";
  if (h[0] === 0xff && h[1] === 0xd8) return "imagen";
  if (h.subarray(0, 4).toString("latin1") === "RIFF" && h.subarray(8, 12).toString("latin1") === "WEBP") return "imagen";
  if (h.subarray(0, 2).toString("latin1") === "BM") return "imagen";
  if ((h[0] === 0x49 && h[1] === 0x49 && h[2] === 0x2a) || (h[0] === 0x4d && h[1] === 0x4d && h[3] === 0x2a)) return "imagen";
  return null;
}

/** Solo un reconocimiento a la vez: el OCR consume mucha memoria y CPU, sobre todo en la Raspberry Pi. */
let cola: Promise<unknown> = Promise.resolve();
export function enCola<T>(tarea: () => Promise<T>): Promise<T> {
  const siguiente = cola.then(tarea, tarea);
  cola = siguiente.catch(() => undefined);
  return siguiente;
}

function carpetaIdioma(): string {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules", "@tesseract.js-data", "spa", "4.0.0_best_int");
}

export interface LineaOcr {
  texto: string;
  confianza: number;
}

export async function ocrImagenes(imagenes: Buffer[], opciones: { lista?: string } = {}): Promise<LineaOcr[]> {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("spa", 1, { langPath: carpetaIdioma(), gzip: true, cacheMethod: "none" });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1", ...(opciones.lista ? { tessedit_char_whitelist: opciones.lista } : {}) });
    const lineas: LineaOcr[] = [];
    for (const img of imagenes) {
      const { data } = await worker.recognize(img, {}, { blocks: true });
      for (const bloque of data.blocks ?? []) {
        for (const parrafo of bloque.paragraphs) {
          for (const l of parrafo.lines) {
            const t = l.text.replace(/\s+/g, " ").trim();
            if (t) lineas.push({ texto: t, confianza: Math.round(l.confidence) });
          }
        }
      }
    }
    return lineas;
  } finally {
    await worker.terminate();
  }
}

interface ItemTexto {
  str: string;
  transform: number[];
}

/** Agrupa los fragmentos de texto de una página PDF en líneas (misma altura) ordenadas de izquierda a derecha. */
function lineasDePagina(items: ItemTexto[]): string[] {
  const filas: { y: number; piezas: { x: number; s: string }[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const fila = filas.find((f) => Math.abs(f.y - y) <= 3);
    if (fila) fila.piezas.push({ x, s: it.str });
    else filas.push({ y, piezas: [{ x, s: it.str }] });
  }
  return filas
    .sort((a, b) => b.y - a.y)
    .map((f) =>
      f.piezas
        .sort((a, b) => a.x - b.x)
        .map((p) => p.s)
        .join("  "),
    );
}

async function abrirPdf(datos: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs")).href;
  try {
    return await pdfjs.getDocument({ data: new Uint8Array(datos), useSystemFonts: false, standardFontDataUrl: `${path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts").replaceAll("\\", "/")}/`, verbosity: 0 }).promise;
  } catch (e) {
    console.error("PDF no legible:", e instanceof Error ? e.message : e);
    throw new HttpError(400, "No se puede abrir el PDF (¿está dañado o protegido con contraseña?).");
  }
}

type DocumentoPdf = Awaited<ReturnType<typeof abrirPdf>>;

/** Dibuja las páginas del PDF como imágenes PNG. */
async function paginasComoImagenes(doc: DocumentoPdf, paginas: number): Promise<Buffer[]> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const imagenes: Buffer[] = [];
  for (let n = 1; n <= paginas; n++) {
    const pagina = await doc.getPage(n);
    const vista = pagina.getViewport({ scale: ESCALA_RASTER });
    const lienzo = createCanvas(Math.ceil(vista.width), Math.ceil(vista.height));
    const ctx = lienzo.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    await pagina.render({ canvas: lienzo as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vista }).promise;
    imagenes.push(lienzo.toBuffer("image/png"));
  }
  return imagenes;
}

async function textoDePaginas(doc: DocumentoPdf, paginas: number): Promise<string> {
  const lineasTexto: string[] = [];
  for (let n = 1; n <= paginas; n++) {
    const pagina = await doc.getPage(n);
    const contenido = await pagina.getTextContent();
    lineasTexto.push(...lineasDePagina(contenido.items as unknown as ItemTexto[]));
  }
  return lineasTexto.join("\n");
}

/** Páginas de un PDF como imágenes (para leer un DNI o un pedido escaneado). */
export async function imagenesDePdf(datos: Buffer): Promise<{ imagenes: Buffer[]; texto: string }> {
  const doc = await abrirPdf(datos);
  try {
    const paginas = Math.min(doc.numPages, MAX_PAGINAS);
    const texto = await textoDePaginas(doc, paginas);
    return { imagenes: await paginasComoImagenes(doc, paginas), texto };
  } finally {
    await doc.cleanup?.();
  }
}

async function leerPdf(datos: Buffer, forzarOcr: boolean): Promise<ResultadoOcr> {
  const doc = await abrirPdf(datos);
  try {
    const paginas = Math.min(doc.numPages, MAX_PAGINAS);
    const texto = await textoDePaginas(doc, paginas);
    const filasTexto = filasDeTexto(texto);
    const aviso = doc.numPages > MAX_PAGINAS ? `El PDF tiene ${doc.numPages} páginas: solo se han leído las ${MAX_PAGINAS} primeras.` : null;
    if (!forzarOcr && filasTexto.length > 0) return { filas: filasTexto, texto, metodo: "texto-pdf", paginas, aviso };
    // Sin texto aprovechable: se dibuja cada página y se reconoce con OCR
    const lineas = await ocrImagenes(await paginasComoImagenes(doc, paginas));
    return { ...resultadoDeLineas(lineas), metodo: "ocr", paginas, aviso };
  } finally {
    await doc.cleanup?.();
  }
}

function resultadoDeLineas(lineas: LineaOcr[]): Pick<ResultadoOcr, "filas" | "texto" | "aviso"> {
  const texto = lineas.map((l) => l.texto).join("\n");
  const confianza = new Map(lineas.map((l) => [l.texto, l.confianza]));
  return { filas: filasDeTexto(texto, confianza), texto, aviso: null };
}

/** Lee la rejilla de un PDF o imagen y devuelve las filas candidatas (el usuario las revisa antes de guardar). */
export function reconocerRejilla(datos: Buffer, opciones: { forzarOcr?: boolean } = {}): Promise<ResultadoOcr> {
  if (datos.length === 0) throw new HttpError(400, "El fichero está vacío.");
  if (datos.length > MAX_BYTES_OCR) throw new HttpError(413, "El fichero es demasiado grande (máximo 15 MB).");
  const tipo = tipoDeFichero(datos);
  if (!tipo) throw new HttpError(415, "Formato no admitido: sube un PDF o una imagen (PNG, JPG, WebP).");
  return enCola(async () => {
    try {
      if (tipo === "pdf") return await leerPdf(datos, opciones.forzarOcr ?? false);
      const lineas = await ocrImagenes([datos]);
      return { ...resultadoDeLineas(lineas), metodo: "ocr" as const, paginas: 1 };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error("Error de OCR:", e instanceof Error ? e.message : e);
      throw new HttpError(500, "No se ha podido leer el fichero. Prueba con otra imagen o añade las filas a mano.");
    }
  });
}

/** Texto de un PDF (capa de texto si la hay; si no, OCR) o de una imagen. Sirve para pedidos y otros documentos. */
export function textoDeDocumento(datos: Buffer): Promise<{ texto: string; metodo: "texto-pdf" | "ocr" }> {
  if (datos.length === 0) throw new HttpError(400, "El fichero está vacío.");
  if (datos.length > MAX_BYTES_OCR) throw new HttpError(413, "El fichero es demasiado grande (máximo 15 MB).");
  const tipo = tipoDeFichero(datos);
  if (!tipo) throw new HttpError(415, "Formato no admitido: sube un PDF o una imagen (PNG, JPG, WebP).");
  return enCola(async () => {
    try {
      if (tipo === "imagen") return { texto: (await ocrImagenes([datos])).map((l) => l.texto).join("\n"), metodo: "ocr" as const };
      const doc = await abrirPdf(datos);
      try {
        const paginas = Math.min(doc.numPages, MAX_PAGINAS);
        const texto = await textoDePaginas(doc, paginas);
        if (texto.replace(/\s/g, "").length >= 40) return { texto, metodo: "texto-pdf" as const };
        return { texto: (await ocrImagenes(await paginasComoImagenes(doc, paginas))).map((l) => l.texto).join("\n"), metodo: "ocr" as const };
      } finally {
        await doc.cleanup?.();
      }
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error("Error de OCR:", e instanceof Error ? e.message : e);
      throw new HttpError(500, "No se ha podido leer el documento. Prueba con otra imagen.");
    }
  });
}
