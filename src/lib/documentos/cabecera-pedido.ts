/**
 * Refuerzo de la lectura de un pedido escaneado. El OCR de la página entera a veces se salta líneas sueltas de la cabecera (el «Número
 * Pedido», la fecha de «Emitido» o la línea del «Modelo»), sobre todo si la hoja está algo torcida. Si faltan, se vuelve a leer solo esa
 * franja de la hoja (ancha y baja, a más resolución relativa) y se completa el texto con las líneas que salgan bien. Esta parte es pura:
 * decide qué falta y cómo se mezcla; el recorte de la imagen y el OCR están en `servicios/ocr.ts`.
 */

const sinTildes = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

const REGEX_NUMERO = /N[úu]mero\s+Pedido\s+\d{5,}/i;
const REGEX_EMITIDO = /^\s*Emitido\b.*\b20\d{2}\b/i;
const REGEX_LINEA_MODELO = /^\s*Mode[lti1]o\s*:/i;

/** ¿Parece un pedido de Renault o Dacia de vehículo nuevo o de ocasión? Solo esos llevan este bloque de cabecera. */
export function pareceUnPedido(texto: string): boolean {
  return /PEDIDO\s+DE\s+VEH/.test(sinTildes(texto).toUpperCase());
}

export function lineaDeModelo(texto: string): string | null {
  return texto.split("\n").find((l) => REGEX_LINEA_MODELO.test(l)) ?? null;
}

/** Marcas que aparecen en la línea del modelo de un pedido: si no sale ninguna, la lectura de esa línea está rota (por ejemplo «Rullt Ci»). */
const MARCA = /\b(RENAULT|DACIA|ALPINE|MOBILIZE|NISSAN|PEUGEOT|SEAT|CUPRA|CITRO[EË]N|TOYOTA|FORD|BMW|MERCEDES|AUDI|VOLKSWAGEN|KIA|HYUNDAI|OPEL|FIAT|MINI|SKODA|VOLVO|JEEP|MAZDA|HONDA|SUZUKI|LAND\s*ROVER|TESLA|SMART|LEXUS|MICRO)\b/i;

const modeloTieneTexto = (l: string | null): boolean => !!l && /[A-Za-z]{3}/.test(sinTildes(l.replace(REGEX_LINEA_MODELO, "")).replace(/\d[\d.,]*\s*€/g, ""));

export interface Faltas {
  numero: boolean;
  emitido: boolean;
  modelo: boolean;
}

/** Qué le falta a la lectura de un pedido (vacío si no parece un pedido o está completa). */
export function faltasDeLaCabecera(texto: string): Faltas {
  if (!pareceUnPedido(texto)) return { numero: false, emitido: false, modelo: false };
  const lineas = texto.split("\n");
  return {
    numero: !REGEX_NUMERO.test(texto),
    emitido: !lineas.some((l) => REGEX_EMITIDO.test(l)),
    // Sin texto, o con texto sin ninguna marca reconocible (el OCR la ha roto)
    modelo: !modeloTieneTexto(lineaDeModelo(texto)) || !MARCA.test(sinTildes(lineaDeModelo(texto) ?? "")),
  };
}

export const hayFaltas = (f: Faltas): boolean => f.numero || f.emitido || f.modelo;

/**
 * Mezcla el texto de la hoja con las líneas leídas de una franja: el número y la fecha de la cabecera se ponen arriba si faltaban, y la
 * línea del modelo sustituye a la que salió vacía o rota. Lo que ya estaba bien no se toca.
 */
export function completarConBanda(texto: string, lineasBanda: string[]): string {
  const f = faltasDeLaCabecera(texto);
  if (!hayFaltas(f)) return texto;
  let lineas = texto.split("\n");
  const arriba: string[] = [];
  if (f.numero) {
    const n = lineasBanda.find((l) => REGEX_NUMERO.test(l));
    if (n) arriba.push(n.trim());
  }
  if (f.emitido) {
    const e = lineasBanda.find((l) => REGEX_EMITIDO.test(l));
    if (e) arriba.push(e.trim());
  }
  if (f.modelo) {
    const m = lineasBanda.find((l) => REGEX_LINEA_MODELO.test(l) && modeloTieneTexto(l) && MARCA.test(sinTildes(l)));
    if (m) {
      const i = lineas.findIndex((l) => REGEX_LINEA_MODELO.test(l));
      if (i >= 0) lineas[i] = m.trim();
      else lineas = [...lineas, m.trim()];
    }
  }
  return [...arriba, ...lineas].join("\n");
}
