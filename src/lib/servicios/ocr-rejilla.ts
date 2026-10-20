import sharp from "sharp";
import { cadenaDeMotores, imagenesDePdf, ocrCeldas, ocrImagenes, tipoDeFichero } from "./ocr";
import { HttpError } from "@/lib/auth/sesion";
import { ajustesOcr, cargarAjustesOcr } from "./ocr-ajustes";

/**
 * Lectura de las matrículas de la rejilla de comisiones escaneada («Resultado PROPIO»): una tabla de varias filas con la
 * columna «Nº FASA / MATRÍCULA». El escáner la deja de lado, con filas amarillas y azules y apuntes a mano; leer la hoja
 * entera con OCR falla en muchas filas. Aquí se localiza la cuadrícula de la tabla y se lee cada celda de la matrícula
 * por separado, limitando los caracteres a los de una matrícula española (cuatro cifras y tres consonantes).
 */

export interface MatriculaLeida {
  /** Matrícula leída; si no es válida es lo que el OCR creyó ver, para que el usuario lo corrija. */
  matricula: string;
  /** Confianza en la lectura (0-100): 95 si dos lecturas distintas coinciden, 0 si no se ha podido leer bien. */
  confianza: number;
  valida: boolean;
}

export interface LecturaHoja {
  matriculas: MatriculaLeida[];
  /** Giro (grados) que se aplicó a la imagen para dejarla derecha. */
  giro: number;
}

export const CARACTERES = "0123456789BCDFGHJKLMNPRSTVWXYZ";
const MATRICULA = /^(\d{4})([BCDFGHJKLMNPRSTVWXYZ]{3})$/;
const UMBRAL_OSCURO = 125;
/** 300 ppp: con menos resolución las cifras 5, 6 y 8 se confunden entre sí. */
const ESCALA_LECTURA = 300 / 72;

interface Gris {
  datos: Buffer;
  ancho: number;
  alto: number;
}

export async function aGris(img: Buffer, giro: number): Promise<Gris> {
  const { data, info } = await sharp(img, { failOn: "none" }).rotate(giro).grayscale().raw().toBuffer({ resolveWithObject: true });
  return { datos: data, ancho: info.width, alto: info.height };
}

/** Tramos horizontales oscuros (líneas de la tabla) de al menos `minimo` píxeles, fila a fila. */
export function tramosHorizontales(g: Gris, minimo: number): { y: number; x: number; largo: number }[] {
  const salida: { y: number; x: number; largo: number }[] = [];
  for (let y = 0; y < g.alto; y++) {
    let ini = -1;
    let ultimo = -1;
    const cerrar = () => {
      if (ini >= 0 && ultimo - ini + 1 >= minimo) salida.push({ y, x: ini, largo: ultimo - ini + 1 });
      ini = -1;
    };
    for (let x = 0; x < g.ancho; x++) {
      if (g.datos[y * g.ancho + x] < UMBRAL_OSCURO) {
        if (ini < 0) ini = x;
        ultimo = x;
      } else if (ini >= 0 && x - ultimo > 2) {
        // el escáner deja alguna rotura en la línea: se tolera un hueco de hasta 2 píxeles
        cerrar();
      }
    }
    cerrar();
  }
  return salida;
}

/** Agrupa filas consecutivas en líneas (centro y x de inicio). */
export function lineasHorizontales(tramos: { y: number; x: number; largo: number }[]): { y: number; x: number; largo: number }[] {
  const lineas: { y: number; x: number; largo: number }[] = [];
  let i = 0;
  while (i < tramos.length) {
    const ini = tramos[i];
    let fin = ini;
    let j = i + 1;
    while (j < tramos.length && tramos[j].y - fin.y <= 1) {
      fin = tramos[j];
      j++;
    }
    lineas.push({ y: Math.round((ini.y + fin.y) / 2), x: ini.x, largo: ini.largo });
    i = j;
  }
  return lineas;
}

const mediana = (n: number[]) => {
  const o = [...n].sort((a, b) => a - b);
  return o.length === 0 ? 0 : o[Math.floor(o.length / 2)];
};

/** Posiciones x de las líneas verticales (columnas oscuras) dentro de una banda de la imagen. */
export function lineasVerticales(g: Gris, y0: number, y1: number, x0: number, x1: number): number[] {
  const alto = y1 - y0;
  const xs: number[] = [];
  let enLinea = false;
  let ini = 0;
  for (let x = Math.max(0, x0); x < Math.min(g.ancho, x1); x++) {
    let oscuros = 0;
    for (let y = y0; y < y1; y++) if (g.datos[y * g.ancho + x] < UMBRAL_OSCURO) oscuros++;
    const esLinea = oscuros > alto * 0.5;
    if (esLinea && !enLinea) ini = x;
    if (!esLinea && enLinea) xs.push(Math.round((ini + x - 1) / 2));
    enLinea = esLinea;
  }
  return xs;
}

interface Celda {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

type Linea = { y: number; x: number; largo: number };

/** Las filas de una tabla van a intervalos regulares: devuelve el tramo más largo de líneas con ese ritmo. */
function tablaRegular(lineas: Linea[]): { tabla: Linea[]; paso: number } | null {
  if (lineas.length < 4) return null;
  const paso = mediana(lineas.slice(1).map((l, i) => l.y - lineas[i].y).filter((s) => s > 5));
  if (paso <= 5) return null;
  let tabla: Linea[] = [];
  let actual: Linea[] = [];
  for (const l of lineas) {
    const ultima = actual[actual.length - 1];
    if (ultima && (l.y - ultima.y < paso * 0.7 || l.y - ultima.y > paso * 1.4)) {
      if (actual.length > tabla.length) tabla = actual;
      actual = [];
    }
    actual.push(l);
  }
  if (actual.length > tabla.length) tabla = actual;
  return tabla.length < 4 ? null : { tabla, paso };
}

/** Celdas de la columna de matrículas: una por fila de la tabla. */
export function celdasMatricula(g: Gris): Celda[] {
  const tolerancia = Math.round(g.ancho * 0.012);
  const tramos = tramosHorizontales(g, Math.round(g.ancho * 0.1));
  // La tabla de matrículas es la de la mitad izquierda con más filas regulares (la hoja trae otras tablas).
  let mejor: { x0: number; tabla: Linea[]; paso: number } | null = null;
  for (const t of tramos.filter((o) => o.x < g.ancho * 0.4)) {
    const candidata = tablaRegular(lineasHorizontales(tramos.filter((o) => Math.abs(o.x - t.x) <= tolerancia)));
    if (candidata && candidata.tabla.length >= 5 && (!mejor || candidata.tabla.length > mejor.tabla.length)) mejor = { x0: t.x, ...candidata };
  }
  if (!mejor) return [];
  const { x0, tabla, paso } = mejor;
  const yIni = tabla[0].y;
  const yFin = tabla[tabla.length - 1].y;
  const verticales = lineasVerticales(g, yIni + 3, Math.min(yFin, yIni + paso * 8) - 3, x0 - tolerancia * 2, x0 + Math.round(g.ancho * 0.3));
  const izquierda = verticales.find((x) => Math.abs(x - x0) <= tolerancia * 3);
  if (izquierda === undefined) return [];
  const derecha = verticales.find((x) => x > izquierda + g.ancho * 0.05);
  if (derecha === undefined) return [];
  const celdas: Celda[] = [];
  for (let i = 0; i + 1 < tabla.length; i++) {
    const alto = tabla[i + 1].y - tabla[i].y;
    if (alto < paso * 0.7 || alto > paso * 1.4) continue;
    celdas.push({ x: izquierda + 4, y: tabla[i].y + 3, ancho: derecha - izquierda - 8, alto: alto - 6 });
  }
  return celdas;
}

/** Recorte binarizado de la celda (tinta negra sobre blanco), sin los bordes de la tabla. */
async function celdaBinaria(img: Buffer, c: Celda, umbral = 140): Promise<{ datos: Buffer; ancho: number; alto: number }> {
  const { data, info } = await sharp(img, { failOn: "none" })
    .extract({ left: c.x, top: c.y, width: c.ancho, height: c.alto })
    .grayscale()
    .normalise()
    .threshold(umbral)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { datos: data, ancho: info.width, alto: info.height };
}

/** Separa los caracteres de la celda por las columnas en blanco que hay entre ellos. */
function segmentos(b: { datos: Buffer; ancho: number; alto: number }): { x0: number; x1: number }[] {
  const hay = (x: number) => {
    for (let y = 0; y < b.alto; y++) if (b.datos[y * b.ancho + x] === 0) return true;
    return false;
  };
  const salida: { x0: number; x1: number }[] = [];
  let ini = -1;
  for (let x = 0; x <= b.ancho; x++) {
    const tinta = x < b.ancho && hay(x);
    if (tinta && ini < 0) ini = x;
    if (!tinta && ini >= 0) {
      if (x - ini >= 3) salida.push({ x0: ini, x1: x - 1 });
      ini = -1;
    }
  }
  return salida;
}

/** Recorta un carácter suelto, con margen blanco y un tamaño cómodo para el OCR. */
async function recorteCaracter(b: { datos: Buffer; ancho: number; alto: number }, s: { x0: number; x1: number }, altura = 70): Promise<Buffer> {
  return sharp(b.datos, { raw: { width: b.ancho, height: b.alto, channels: 1 } })
    .extract({ left: s.x0, top: 0, width: s.x1 - s.x0 + 1, height: b.alto })
    .resize({ height: altura, fit: "contain", background: "#ffffff" })
    .extend({ top: 16, bottom: 16, left: 16, right: 16, background: "#ffffff" })
    .png()
    .toBuffer();
}

/**
 * ¿Hay algo escrito en la celda? Las celdas vacías solo traen ruido del escáner, y la franja que queda entre la cabecera y la primera
 * fila solo trae el borde de la tabla: por eso solo cuenta la tinta del centro de la celda, no la de los bordes.
 */
export function celdaConTinta(g: Gris, c: Celda): boolean {
  const y0 = c.y + Math.round(c.alto * 0.25);
  const y1 = c.y + Math.round(c.alto * 0.75);
  const x0 = c.x + Math.round(c.ancho * 0.1);
  const x1 = c.x + Math.round(c.ancho * 0.9);
  let oscuros = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (g.datos[y * g.ancho + x] < 110) oscuros++;
  return oscuros > (x1 - x0) * (y1 - y0) * 0.02;
}

/** Matrícula que contiene el texto que leyó un motor de OCR (con las confusiones típicas corregidas), o null. */
export function matriculaDeTexto(texto: string): string | null {
  const limpio = texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const directa = limpio.match(/\d{4}[BCDFGHJKLMNPRSTVWXYZ]{3}/);
  if (directa) return directa[0];
  for (let i = 0; i + 7 <= limpio.length; i++) {
    const r = repararMatricula(limpio.slice(i, i + 7));
    if (r) return r;
  }
  return null;
}

const A_CIFRA: Record<string, string> = { S: "5", O: "0", I: "1", B: "8", Z: "2", G: "6", T: "7", L: "1", D: "0" };
const A_LETRA: Record<string, string> = { "5": "S", "0": "D", "8": "B", "1": "L", "2": "Z", "6": "G", "7": "T" };

/** Corrige confusiones típicas del OCR según la posición: cifras en las cuatro primeras, consonantes en las tres últimas. */
function repararMatricula(texto: string): string | null {
  if (texto.length !== 7) return null;
  const r = [...texto].map((c, i) => (i < 4 ? A_CIFRA[c] ?? c : A_LETRA[c] ?? c)).join("");
  return MATRICULA.test(r) ? r : null;
}

/** Recorte de la celda en grises, listo para leer la línea entera. */
async function recorteLinea(img: Buffer, c: Celda): Promise<Buffer> {
  return sharp(img, { failOn: "none" })
    .extract({ left: c.x, top: c.y, width: c.ancho, height: c.alto })
    .resize({ height: 90 })
    .grayscale()
    .normalise()
    .extend({ top: 12, bottom: 12, left: 12, right: 12, background: "#ffffff" })
    .png()
    .toBuffer();
}

/** Carácter más repetido (en empate, el primero que apareció). */
function mayoria(chars: string[]): string {
  const cuenta = new Map<string, number>();
  for (const c of chars) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  return [...cuenta].sort((x, y) => y[1] - x[1])[0][0];
}

/** Lee las matrículas de una imagen de la rejilla (PNG/JPG). Prueba los giros habituales de un escáner. */
export async function leerMatriculasDeImagen(imagen: Buffer): Promise<LecturaHoja> {
  await cargarAjustesOcr();
  // Motor de OCR elegido (RapidOCR, Apple Vision…): lee cada celda y su lectura cuenta como un voto más, el primero; con Tesseract
  // solo se usan las lecturas propias de la rejilla
  const motores = cadenaDeMotores(ajustesOcr().motor);
  for (const giro of [270, 90, 0, 180]) {
    const girada = await sharp(imagen, { failOn: "none" }).rotate(giro).png().toBuffer();
    const g = await aGris(girada, 0);
    const celdas = celdasMatricula(g).filter((c) => celdaConTinta(g, c));
    if (celdas.length === 0) continue;
    // Lectura 1: la celda entera como una línea. Lectura 2: carácter a carácter (cifras en las cuatro primeras
    // posiciones y consonantes en las tres últimas), que evita confusiones como 5/S o 0/O.
    const lineas = await ocrCeldas(await Promise.all(celdas.map((c) => recorteLinea(girada, c))), CARACTERES);
    // Lecturas carácter a carácter con distinto umbral y tamaño: si una letra se confunde (P/D, 1/4…) las otras la corrigen por voto
    const VARIANTES: { umbral: number; altura: number }[] = [
      { umbral: 140, altura: 70 },
      { umbral: 175, altura: 96 },
      { umbral: 110, altura: 96 },
      { umbral: 125, altura: 130 },
      { umbral: 160, altura: 130 },
      { umbral: 190, altura: 70 },
    ];
    const porCaracter: string[][] = [];
    for (const c of celdas) {
      const lecturas: string[] = [];
      for (const v of VARIANTES) {
        const bin = await celdaBinaria(girada, c, v.umbral);
        const trozos = segmentos(bin);
        if (trozos.length !== 7) continue;
        const imgs = await Promise.all(trozos.map((t) => recorteCaracter(bin, t, v.altura)));
        const cifras = await ocrCeldas(imgs.slice(0, 4), "0123456789", "caracter");
        const letras = await ocrCeldas(imgs.slice(4), "BCDFGHJKLMNPRSTVWXYZ", "caracter");
        lecturas.push([...cifras, ...letras].map((l) => l.texto.replace(/\s/g, "")).join(""));
      }
      porCaracter.push(lecturas);
    }
    const delMotor: (string | null)[] = [];
    if (motores.length > 0) {
      for (const c of celdas) {
        try {
          const lineas = await ocrImagenes([await recorteLinea(girada, c)], { motorElegido: true, psm: "disperso" });
          delMotor.push(matriculaDeTexto(lineas.map((l) => l.texto).join("")));
        } catch {
          delMotor.push(null);
        }
      }
    }
    const matriculas: MatriculaLeida[] = [];
    const vistas = new Set<string>();
    for (let i = 0; i < celdas.length; i++) {
      const a = lineas[i].texto.replace(/\s/g, "").toUpperCase();
      const motor = delMotor[i] ?? null;
      const validas = [...(motor ? [motor] : []), ...(MATRICULA.test(a) ? [a] : []), ...porCaracter[i].filter((x) => MATRICULA.test(x))];
      const b = porCaracter[i][0] ?? "";
      // Voto por posición entre todas las lecturas válidas (la línea entera cuenta como una más)
      // (la lectura del motor elegido cuenta doble: gana los empates)
      const votos = motor ? [motor, ...validas] : validas;
      const votada = validas.length > 0 ? [...validas[0]].map((_, k) => mayoria(votos.map((x) => x[k]))).join("") : "";
      const unanimes = validas.length >= 2 && validas.every((x) => x === validas[0]);
      const reparada = validas.length > 0 ? null : repararMatricula(a) ?? repararMatricula(b);
      const elegida = validas.length > 0 ? (MATRICULA.test(votada) ? votada : validas[0]) : reparada ?? (a || b);
      const valida = MATRICULA.test(elegida);
      const acuerdo = validas.filter((x) => x === elegida).length;
      const confianza = !valida ? 0 : reparada ? 40 : unanimes && validas.length >= 3 ? 98 : unanimes ? 95 : acuerdo >= 2 && acuerdo * 2 > validas.length ? 85 : validas.length === 1 ? 70 : 55;
      if (valida && vistas.has(elegida)) continue;
      if (valida) vistas.add(elegida);
      if (elegida.length >= 5) matriculas.push({ matricula: elegida, confianza, valida });
    }
    if (matriculas.length > 0) return { matriculas, giro };
  }
  return { matriculas: [], giro: 0 };
}

/** Lee las matrículas de un PDF escaneado o de una imagen. Devuelve una lectura por página. */
export async function leerMatriculasDeFichero(datos: Buffer): Promise<LecturaHoja[]> {
  const tipo = tipoDeFichero(datos);
  if (!tipo) throw new HttpError(415, "Formato no admitido: sube un PDF o una imagen (PNG, JPG, WebP).");
  const imagenes = tipo === "pdf" ? (await imagenesDePdf(datos, ESCALA_LECTURA)).imagenes : [datos];
  const lecturas: LecturaHoja[] = [];
  for (const img of imagenes) lecturas.push(await leerMatriculasDeImagen(img));
  return lecturas;
}
