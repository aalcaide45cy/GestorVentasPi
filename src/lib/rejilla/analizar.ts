/**
 * Lectura de la «rejilla» de comisiones que entrega la empresa: normalización de matrículas, importes en formato
 * español y extracción de filas desde una tabla (Excel/CSV) o desde texto reconocido por OCR. Todo es puro y sin
 * dependencias, para poder probarlo y usarlo tanto en el navegador como en el servidor.
 */

export interface FilaRejilla {
  matricula: string;
  cliente: string | null;
  financiacion: string | null;
  concepto: string | null;
  /** Céntimos; null si la hoja no trae importe legible. */
  importe: number | null;
  textoOriginal?: string | null;
  confianza?: number | null;
}

/** «1234-bcd», «1234 BCD», «M-1234-AB» → «1234BCD», «M1234AB». */
export function normalizarMatricula(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** ¿Tiene forma de matrícula española (actual 0000XXX o antigua provincial XX0000XX)? */
export function esMatricula(texto: string): boolean {
  const m = normalizarMatricula(texto);
  return /^\d{4}[A-Z]{3}$/.test(m) || /^[A-Z]{1,2}\d{4}[A-Z]{1,3}$/.test(m);
}

/** «1.234,56 €» → 123456; «(45,00)» y «-45,00» → -4500; sin importe legible → null. */
export function parseImporte(texto: string): number | null {
  let t = texto.trim().replace(/[€\s]|EUR/gi, "");
  if (t === "") return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) {
    negativo = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    negativo = !negativo;
    t = t.slice(1);
  }
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const ultimaComa = t.lastIndexOf(",");
  const ultimoPunto = t.lastIndexOf(".");
  let normal: string;
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    // el último separador es el decimal
    normal = ultimaComa > ultimoPunto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (ultimaComa >= 0) {
    normal = /,\d{1,2}$/.test(t) && t.indexOf(",") === ultimaComa ? t.replace(",", ".") : t.replace(/,/g, "");
  } else if (ultimoPunto >= 0) {
    normal = /\.\d{1,2}$/.test(t) && t.indexOf(".") === ultimoPunto ? t : t.replace(/\./g, "");
  } else {
    normal = t;
  }
  if (!/^\d+(\.\d+)?$/.test(normal)) return null;
  const n = Math.round(Number(normal) * 100);
  return negativo ? -n : n;
}

/* ------------------------------------------------------------------ */
/* Desde una tabla (Excel / CSV)                                        */
/* ------------------------------------------------------------------ */

export interface MapeoColumnas {
  /** Fila (índice) que contiene las cabeceras. */
  filaCabecera: number;
  matricula: number | null;
  cliente: number | null;
  financiacion: number | null;
  /** Una o varias columnas de importe: se suman y el nombre de cada columna pasa a ser el concepto. */
  importes: number[];
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Detecta la fila de cabeceras y propone qué columna es cada dato. */
export function proponerMapeo(matriz: string[][]): MapeoColumnas {
  const limite = Math.min(matriz.length, 20);
  let filaCabecera = 0;
  for (let i = 0; i < limite; i++) {
    if (matriz[i].some((c) => sinAcentos(String(c ?? "")).includes("matr"))) {
      filaCabecera = i;
      break;
    }
  }
  const cab = (matriz[filaCabecera] ?? []).map((c) => sinAcentos(String(c ?? "")).trim());
  const buscar = (patron: RegExp): number | null => {
    const i = cab.findIndex((c) => patron.test(c));
    return i >= 0 ? i : null;
  };
  const importesPosibles = cab.flatMap((c, i) => (/importe|comision|incentivo|prima|bonus|bruto|neto|€|eur/.test(c) ? [i] : []));
  const total = cab.findIndex((c) => /^total/.test(c));
  return {
    filaCabecera,
    matricula: buscar(/matr/),
    cliente: buscar(/cliente|nombre|titular/),
    financiacion: buscar(/financ|forma.*pago|tipo.*venta|pago/),
    importes: total >= 0 ? [total] : importesPosibles,
  };
}

/** Aplica el mapeo a la tabla y devuelve las filas con matrícula. */
export function filasDeMatriz(matriz: string[][], mapeo: MapeoColumnas): FilaRejilla[] {
  if (mapeo.matricula === null) return [];
  const cabecera = matriz[mapeo.filaCabecera] ?? [];
  const filas: FilaRejilla[] = [];
  for (let i = mapeo.filaCabecera + 1; i < matriz.length; i++) {
    const celdas = matriz[i];
    const matricula = String(celdas[mapeo.matricula] ?? "").trim();
    if (normalizarMatricula(matricula).length < 5) continue;
    const partes: { nombre: string; valor: number }[] = [];
    let hayImporte = false;
    for (const c of mapeo.importes) {
      const v = parseImporte(String(celdas[c] ?? ""));
      if (v !== null) {
        hayImporte = true;
        if (v !== 0) partes.push({ nombre: String(cabecera[c] ?? "").trim(), valor: v });
      }
    }
    const texto = (c: number | null) => (c === null ? null : String(celdas[c] ?? "").trim() || null);
    filas.push({
      matricula,
      cliente: texto(mapeo.cliente),
      financiacion: texto(mapeo.financiacion),
      concepto: mapeo.importes.length > 1 ? partes.map((p) => p.nombre).filter(Boolean).join(" + ") || null : null,
      importe: hayImporte ? partes.reduce((s, p) => s + p.valor, 0) : null,
      textoOriginal: celdas.map((c) => String(c ?? "").trim()).filter(Boolean).join(" | "),
    });
  }
  return filas;
}

/** Interpreta un CSV sencillo (separador «;», «,» o tabulador; comillas dobles). */
export function matrizDeCsv(texto: string): string[][] {
  const primera = texto.split(/\r?\n/, 1)[0] ?? "";
  const cuenta = (c: string) => primera.split(c).length - 1;
  const sep = cuenta(";") >= cuenta(",") && cuenta(";") >= cuenta("\t") ? ";" : cuenta("\t") > cuenta(",") ? "\t" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entrecomillado = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entrecomillado) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celda += '"';
          i++;
        } else entrecomillado = false;
      } else celda += c;
    } else if (c === '"') entrecomillado = true;
    else if (c === sep) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda);
      celda = "";
      if (fila.some((x) => x.trim() !== "")) filas.push(fila);
      fila = [];
    } else celda += c;
  }
  fila.push(celda);
  if (fila.some((x) => x.trim() !== "")) filas.push(fila);
  return filas;
}

/* ------------------------------------------------------------------ */
/* Desde texto (OCR de PDF o fotos)                                     */
/* ------------------------------------------------------------------ */

const DIGITO_CONFUNDIDO: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", S: "5", B: "8", Z: "2" };

/** Corrige confusiones típicas del OCR en la parte numérica de una matrícula actual (0000 XXX). */
function corregirDigitos(token: string): string {
  return token.replace(/[A-Z]/gi, (c) => DIGITO_CONFUNDIDO[c.toUpperCase()] ?? c);
}

/** Todas las matrículas que aparecen en una línea (corrigiendo confusiones del OCR en los 4 números). */
export function matriculasEnTexto(linea: string): string[] {
  const encontradas: string[] = [];
  const mayus = linea.toUpperCase();
  for (const m of mayus.matchAll(/(?<![A-Z0-9])([0-9OQDILSBZ]{4})[\s.-]{0,3}([A-Z]{3})(?![A-Z0-9])/g)) {
    const num = corregirDigitos(m[1]);
    if (/^\d{4}$/.test(num) && !/^[AEIOU]{3}$/.test(m[2])) encontradas.push(`${num}${m[2]}`);
  }
  for (const m of mayus.matchAll(/(?<![A-Z0-9])([A-Z]{1,2})[\s.-]{0,3}(\d{4})[\s.-]{0,3}([A-Z]{1,3})(?![A-Z0-9])/g)) {
    const completa = `${m[1]}${m[2]}${m[3]}`;
    if (!encontradas.includes(completa) && !encontradas.some((e) => e.includes(m[2] + m[3]))) encontradas.push(completa);
  }
  return encontradas;
}

/** Importes que aparecen en una línea (formato español: 1.234,56; también 45,00 € o -12,50). */
export function importesEnTexto(linea: string): number[] {
  const res: number[] = [];
  for (const m of linea.matchAll(/(?<![\d.,])-?\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?(?!\d)|(?<![\d.,])-?\d+,\d{2}(?!\d)|(?<![\d.,])-?\d+\.\d{2}(?![\d.])/g)) {
    const v = parseImporte(m[0]);
    if (v !== null) res.push(v);
  }
  return res;
}

const FINANCIACION = /\b(contado|cr[eé]dito|financiad[oa]|financiaci[oó]n|renting|leasing|preference|renault\s*financiaciones|rci|cetelem|santander)\b/i;

/** Filas de la rejilla a partir de texto libre: una por línea que contenga una matrícula. */
export function filasDeTexto(texto: string, confianzaPorLinea?: Map<string, number>): FilaRejilla[] {
  const filas: FilaRejilla[] = [];
  for (const crudo of texto.split(/\r?\n/)) {
    const linea = crudo.trim();
    if (!linea) continue;
    const matriculas = matriculasEnTexto(linea);
    if (matriculas.length === 0) continue;
    const importes = importesEnTexto(linea);
    const financ = linea.match(FINANCIACION)?.[0] ?? null;
    // Cliente: lo que queda de la línea sin matrículas, importes ni palabras de financiación
    let resto = linea
      .replace(/(?<![A-Za-z0-9])[0-9OQDILSBZ]{4}[\s.-]?[A-Za-z]{3}(?![A-Za-z0-9])/gi, " ")
      .replace(/(?<![A-Za-z0-9])[A-Za-z]{1,2}[\s.-]?\d{4}[\s.-]?[A-Za-z]{1,3}(?![A-Za-z0-9])/g, " ")
      .replace(/-?\(?\d[\d.,]*\)?\s*€?/g, " ")
      .replace(new RegExp(FINANCIACION.source, "gi"), " ");
    resto = resto.replace(/[|;:_]+/g, " ").replace(/\s+/g, " ").trim();
    const nombre =
      resto
        .match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'.-]{2,}(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'.-]{2,}){0,5}/g)
        ?.sort((a, b) => b.length - a.length)[0] ?? null;
    filas.push({
      matricula: matriculas[0],
      cliente: nombre && nombre.length >= 3 ? nombre : null,
      financiacion: financ,
      concepto: null,
      // Con varios importes en la línea se toma el último (la hoja suele cerrar con el total del coche); el usuario lo revisa
      importe: importes.length ? importes[importes.length - 1] : null,
      textoOriginal: linea,
      confianza: confianzaPorLinea?.get(linea) ?? null,
    });
  }
  return filas;
}
