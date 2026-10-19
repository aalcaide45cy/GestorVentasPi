import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { InferenceSession } from "onnxruntime-node";
import { agruparCajas } from "./ocr-lineas";

/**
 * Motor «RapidOCR»: los modelos PP-OCRv5 de PaddleOCR (detección de texto + reconocimiento con alfabeto latino, que incluye
 * tildes y la «ñ») ejecutados con ONNX Runtime. Todo en local, en CPU (Raspberry Pi o PC) o, si el equipo la tiene, en GPU
 * (DirectML en Windows, CUDA en Linux con NVIDIA). El postproceso de la detección es propio (sin OpenCV): componentes
 * conexas del mapa de probabilidad ampliadas como hace el «unclip» de DB.
 */

export interface LineaRapida {
  texto: string;
  confianza: number;
}

export type ProveedorOnnx = "cpu" | "gpu";

interface Sesiones {
  det: InferenceSession;
  rec: InferenceSession;
  ort: typeof import("onnxruntime-node");
  proveedor: ProveedorOnnx;
  /** Proveedor realmente usado («cpu», «dml», «cuda»). */
  usado: string;
}

const MEDIA_DET = [0.485, 0.456, 0.406];
const DESV_DET = [0.229, 0.224, 0.225];
/** Lado largo máximo de la imagen que entra al detector (múltiplo de 32). Más alto lee mejor letra pequeña pero tarda más. */
const LADO_DETECCION = Number(process.env.OCR_LADO_DETECCION) || 1280;
/** Si la primera pasada sale con poca confianza (escaneo flojo), se repite con el detector a más resolución. */
const LADO_DETECCION_FINO = 2048;
/** Parte del texto con poca confianza a partir de la cual se repite la lectura con más resolución. */
const PARTE_DUDOSA = 0.08;
const UMBRAL_BINARIO = 0.3;
const UMBRAL_CAJA = 0.55;
const AMPLIAR = 1.6;
const ALTO_REC = 48;

const carpetaModelos = (): string => process.env.OCR_MODELOS_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "ocr-modelos");

let diccionario: string[] | null = null;
function cargarDiccionario(): string[] {
  if (!diccionario) diccionario = [...fs.readFileSync(path.join(carpetaModelos(), "diccionario-latin.txt"), "utf8").split(/\r?\n/), " "];
  return diccionario;
}

const cache = new Map<ProveedorOnnx, Promise<Sesiones>>();
let ultimoUsado = "cpu";

/** Proveedor con el que se cargaron los modelos por última vez (para mostrarlo en la configuración). */
export const proveedorUsado = (): string => ultimoUsado;

async function crearSesiones(proveedor: ProveedorOnnx): Promise<Sesiones> {
  const ort = await import("onnxruntime-node");
  const rutas = { det: path.join(carpetaModelos(), "det.onnx"), rec: path.join(carpetaModelos(), "rec.onnx") };
  if (!fs.existsSync(rutas.det) || !fs.existsSync(rutas.rec)) throw new Error("Faltan los modelos de RapidOCR (carpeta ocr-modelos).");
  const candidatos: string[][] = proveedor === "gpu" ? (process.platform === "win32" ? [["dml", "cpu"], ["cpu"]] : [["cuda", "cpu"], ["cpu"]]) : [["cpu"]];
  let ultimoError: unknown;
  for (const eps of candidatos) {
    try {
      // En CPU de una Raspberry (ARM64) cada lectura usa 2 hilos: con varias lecturas a la vez, ONNX con todos los núcleos por lectura saturaba el equipo
      const hilos = proveedor === "cpu" && process.arch === "arm64" ? { intraOpNumThreads: 2, interOpNumThreads: 1 } : {};
      const opciones = { executionProviders: eps, graphOptimizationLevel: "all" as const, logSeverityLevel: 3 as const, ...hilos };
      const [det, rec] = await Promise.all([ort.InferenceSession.create(rutas.det, opciones), ort.InferenceSession.create(rutas.rec, opciones)]);
      ultimoUsado = eps[0];
      return { det, rec, ort, proveedor, usado: eps[0] };
    } catch (e) {
      ultimoError = e;
    }
  }
  throw ultimoError instanceof Error ? ultimoError : new Error("No se pudo iniciar RapidOCR.");
}

export function cargarRapido(proveedor: ProveedorOnnx): Promise<Sesiones> {
  let s = cache.get(proveedor);
  if (!s) {
    s = crearSesiones(proveedor);
    // Si falla, la próxima vez se vuelve a intentar
    s.catch(() => cache.delete(proveedor));
    cache.set(proveedor, s);
  }
  return s;
}

/** Comprueba si el motor puede arrancar con ese proveedor (para la configuración): devuelve el proveedor real o el motivo del fallo. */
export async function probarRapido(proveedor: ProveedorOnnx): Promise<{ ok: true; usado: string } | { ok: false; motivo: string }> {
  try {
    const s = await cargarRapido(proveedor);
    // En «gpu» se exige que no haya caído a CPU
    if (proveedor === "gpu" && s.usado === "cpu") return { ok: false, motivo: "No hay una GPU utilizable (ONNX Runtime ha caído a CPU)." };
    return { ok: true, usado: s.usado };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message.slice(0, 200) : "No se pudo iniciar" };
  }
}

interface Caja {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  puntos: number;
}

/** Cajas de texto (en coordenadas de la imagen original) a partir del mapa de probabilidad del detector. */
function cajasDelMapa(prob: Float32Array, an: number, al: number, escalaX: number, escalaY: number, anchoOrig: number, altoOrig: number): Caja[] {
  const visto = new Uint8Array(an * al);
  const pila = new Int32Array(an * al);
  const cajas: Caja[] = [];
  for (let i = 0; i < an * al; i++) {
    if (visto[i] || prob[i] <= UMBRAL_BINARIO) continue;
    let tope = 0;
    pila[tope++] = i;
    visto[i] = 1;
    let minX = an;
    let maxX = 0;
    let minY = al;
    let maxY = 0;
    let n = 0;
    let suma = 0;
    while (tope > 0) {
      const p = pila[--tope];
      const x = p % an;
      const y = (p - x) / an;
      n++;
      suma += prob[p];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && !visto[p - 1] && prob[p - 1] > UMBRAL_BINARIO) {
        visto[p - 1] = 1;
        pila[tope++] = p - 1;
      }
      if (x < an - 1 && !visto[p + 1] && prob[p + 1] > UMBRAL_BINARIO) {
        visto[p + 1] = 1;
        pila[tope++] = p + 1;
      }
      if (y > 0 && !visto[p - an] && prob[p - an] > UMBRAL_BINARIO) {
        visto[p - an] = 1;
        pila[tope++] = p - an;
      }
      if (y < al - 1 && !visto[p + an] && prob[p + an] > UMBRAL_BINARIO) {
        visto[p + an] = 1;
        pila[tope++] = p + an;
      }
    }
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (Math.min(w, h) < 3 || n < 12 || suma / n < UMBRAL_CAJA) continue;
    // «Unclip» de DB: el mapa marca solo el núcleo del texto; se amplía en proporción a su área y perímetro
    const d = (w * h * AMPLIAR) / (2 * (w + h));
    const x0 = Math.max(0, (minX - d) * escalaX);
    const y0 = Math.max(0, (minY - d) * escalaY);
    const x1 = Math.min(anchoOrig, (maxX + 1 + d) * escalaX);
    const y1 = Math.min(altoOrig, (maxY + 1 + d) * escalaY);
    if (x1 - x0 >= 6 && y1 - y0 >= 6) cajas.push({ x0, y0, x1, y1, puntos: n });
  }
  return cajas;
}

async function detectar(s: Sesiones, img: Buffer, ancho: number, alto: number, lado: number): Promise<Caja[]> {
  const factor = Math.min(1, lado / Math.max(ancho, alto));
  const an = Math.max(32, Math.round((ancho * factor) / 32) * 32);
  const al = Math.max(32, Math.round((alto * factor) / 32) * 32);
  const { data } = await sharp(img, { failOn: "none" }).removeAlpha().resize(an, al, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const plano = an * al;
  const entrada = new Float32Array(3 * plano);
  // Los modelos de Paddle esperan BGR
  for (let i = 0; i < plano; i++) {
    entrada[i] = (data[i * 3 + 2] / 255 - MEDIA_DET[0]) / DESV_DET[0];
    entrada[plano + i] = (data[i * 3 + 1] / 255 - MEDIA_DET[1]) / DESV_DET[1];
    entrada[2 * plano + i] = (data[i * 3] / 255 - MEDIA_DET[2]) / DESV_DET[2];
  }
  const salida = await s.det.run({ [s.det.inputNames[0]]: new s.ort.Tensor("float32", entrada, [1, 3, al, an]) });
  const mapa = salida[s.det.outputNames[0]].data as Float32Array;
  return cajasDelMapa(mapa, an, al, ancho / an, alto / al, ancho, alto);
}

/** Cuántos recortes de texto se leen de una vez: menos llamadas al modelo (clave en GPU, donde cada llamada cuesta) y mejor uso de la CPU. */
const LOTE_REC = Number(process.env.OCR_LOTE_REC) || 8;

/** Texto (CTC) de la salida del reconocedor para un elemento del lote. */
function decodificar(v: Float32Array, desde: number, pasos: number, clases: number): LineaRapida | null {
  const dic = cargarDiccionario();
  let texto = "";
  let previo = 0;
  let suma = 0;
  let n = 0;
  for (let k = 0; k < pasos; k++) {
    let mejor = 0;
    let pm = -Infinity;
    const base = desde + k * clases;
    for (let c = 0; c < clases; c++) {
      const x = v[base + c];
      if (x > pm) {
        pm = x;
        mejor = c;
      }
    }
    if (mejor !== 0 && mejor !== previo) {
      texto += dic[mejor - 1] ?? "";
      suma += pm;
      n++;
    }
    previo = mejor;
  }
  texto = texto.trim();
  return texto ? { texto, confianza: Math.round((n ? suma / n : 0) * 100) } : null;
}

/**
 * Lee todos los recortes de una página. Se ordenan por anchura y se leen de ocho en ocho, rellenando hasta la anchura del más ancho del
 * lote (múltiplo de 32, para que en GPU haya pocas formas distintas): así una página son unas pocas llamadas al modelo, no una por texto.
 */
async function reconocerCajas(s: Sesiones, img: Buffer, cajas: Caja[]): Promise<(LineaRapida | null)[]> {
  const resultado: (LineaRapida | null)[] = new Array(cajas.length).fill(null);
  const recortes = await Promise.all(
    cajas.map(async (caja, indice) => {
      const left = Math.floor(caja.x0);
      const top = Math.floor(caja.y0);
      const width = Math.max(1, Math.ceil(caja.x1) - left);
      const height = Math.max(1, Math.ceil(caja.y1) - top);
      const ancho = Math.min(3200, Math.max(16, Math.ceil((ALTO_REC * width) / height / 8) * 8));
      const { data } = await sharp(img, { failOn: "none" }).removeAlpha().extract({ left, top, width, height }).resize(ancho, ALTO_REC, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
      return { indice, ancho, data };
    }),
  );
  recortes.sort((a, b) => a.ancho - b.ancho);
  for (let k = 0; k < recortes.length; k += LOTE_REC) {
    const lote = recortes.slice(k, k + LOTE_REC);
    const anchoLote = Math.min(3200, Math.ceil(Math.max(...lote.map((r) => r.ancho)) / 32) * 32);
    const plano = anchoLote * ALTO_REC;
    // Lo que sobra a la derecha de un recorte queda a cero (el color medio tras normalizar)
    const entrada = new Float32Array(lote.length * 3 * plano);
    lote.forEach((r, e) => {
      const base = e * 3 * plano;
      for (let y = 0; y < ALTO_REC; y++) {
        for (let x = 0; x < r.ancho; x++) {
          const o = (y * r.ancho + x) * 3;
          const d = y * anchoLote + x;
          entrada[base + d] = (r.data[o + 2] / 255 - 0.5) / 0.5;
          entrada[base + plano + d] = (r.data[o + 1] / 255 - 0.5) / 0.5;
          entrada[base + 2 * plano + d] = (r.data[o] / 255 - 0.5) / 0.5;
        }
      }
    });
    const salida = await s.rec.run({ [s.rec.inputNames[0]]: new s.ort.Tensor("float32", entrada, [lote.length, 3, ALTO_REC, anchoLote]) });
    const t = salida[s.rec.outputNames[0]];
    const [, pasos, clases] = t.dims as number[];
    const v = t.data as Float32Array;
    lote.forEach((r, e) => {
      // Solo los pasos que corresponden al recorte (el resto es el relleno)
      const utiles = Math.min(pasos, Math.ceil((r.ancho / anchoLote) * pasos) + 1);
      resultado[r.indice] = decodificar(v, e * pasos * clases, utiles, clases);
    });
  }
  return resultado;
}

export interface OpcionesRapido {
  proveedor: ProveedorOnnx;
  /** Un hueco grande entre dos textos de la misma línea (otra columna) se marca con dos espacios. */
  columnas?: boolean;
  confianzaMinima?: number;
}

interface Leida {
  caja: Caja;
  texto: string;
  confianza: number;
}

/** Parte del texto (por longitud) leída con menos de 75 de confianza. */
const parteDudosa = (l: Leida[]): number => {
  const total = l.reduce((a, x) => a + x.texto.length, 0);
  return total === 0 ? 1 : l.filter((x) => x.confianza < 75).reduce((a, x) => a + x.texto.length, 0) / total;
};

async function leerImagen(s: Sesiones, img: Buffer, ancho: number, alto: number, lado: number, confianzaMinima?: number): Promise<Leida[]> {
  const cajas = await detectar(s, img, ancho, alto, lado);
  const lecturas = await reconocerCajas(s, img, cajas);
  const leidas: Leida[] = [];
  cajas.forEach((caja, i) => {
    const r = lecturas[i];
    if (r && (confianzaMinima === undefined || r.confianza >= confianzaMinima)) leidas.push({ caja, ...r });
  });
  return leidas;
}

/** Reconoce el texto de imágenes y lo devuelve en líneas, de arriba abajo y de izquierda a derecha. */
export async function ocrImagenesRapido(imagenes: Buffer[], opciones: OpcionesRapido): Promise<LineaRapida[]> {
  const s = await cargarRapido(opciones.proveedor);
  const lineas: LineaRapida[] = [];
  for (const img of imagenes) {
    const meta = await sharp(img, { failOn: "none" }).metadata();
    if (!meta.width || !meta.height) continue;
    let leidas = await leerImagen(s, img, meta.width, meta.height, LADO_DETECCION, opciones.confianzaMinima);
    // Escaneo flojo: se repite con más resolución y se queda la pasada que lee con más confianza
    if (parteDudosa(leidas) > PARTE_DUDOSA && Math.max(meta.width, meta.height) > LADO_DETECCION) {
      const fina = await leerImagen(s, img, meta.width, meta.height, LADO_DETECCION_FINO, opciones.confianzaMinima);
      if (parteDudosa(fina) < parteDudosa(leidas)) leidas = fina;
    }
    lineas.push(...agruparCajas(leidas.map((l) => ({ ...l.caja, texto: l.texto, confianza: l.confianza })), opciones.columnas));
  }
  return lineas;
}
