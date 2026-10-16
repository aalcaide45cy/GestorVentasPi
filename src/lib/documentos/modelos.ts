/**
 * Emparejado de modelos del pedido con el catálogo, tolerante a abreviaturas: «R5» o «R 5» equivalen a «Renault 5»,
 * «R4» a «Renault 4», y «Renault 5» al modelo de catálogo «5» de la marca Renault (y al revés).
 */

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const limpiar = (s: string) => sinAcentos(s).replace(/\s+/g, " ").trim();

/** Nombre del modelo sin la marca delante («Renault 5» → «5»). */
export function nucleoModelo(nombre: string, marca: string | null): string {
  const n = limpiar(nombre);
  const m = marca ? limpiar(marca) : "";
  return m && n.startsWith(`${m} `) ? n.slice(m.length + 1) : n;
}

/** Formas en que un pedido puede escribir un modelo de catálogo (en mayúsculas y sin acentos). */
export function aliasDeModelo(nombre: string, marca: string | null): string[] {
  const n = limpiar(nombre);
  const m = marca ? limpiar(marca) : "";
  const nucleo = nucleoModelo(nombre, marca);
  const alias = new Set<string>([n]);
  if (m && nucleo) alias.add(`${m} ${nucleo}`);
  // Modelos numéricos o con número tras una sola letra (5, 4, 5 E-TECH): «R5», «R 5», «R-5»
  if (m && /^\d/.test(nucleo)) {
    const inicial = m[0];
    alias.add(`${inicial}${nucleo}`);
    alias.add(`${inicial} ${nucleo}`);
    alias.add(`${inicial}-${nucleo}`);
  }
  return [...alias].filter((a) => a.length >= 2);
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[ -]?");

/** Longitud de la mejor coincidencia de los alias del modelo en el texto, o 0 si no aparece. */
export function puntuarModelo(nombre: string, marca: string | null, texto: string): number {
  const t = sinAcentos(texto);
  let mejor = 0;
  for (const a of aliasDeModelo(nombre, marca)) {
    if (a.length > mejor && new RegExp(`(?<![A-Z0-9])${escapar(a)}(?![A-Z0-9])`).test(t)) mejor = a.length;
  }
  return mejor;
}

const PALABRAS_VACIAS = new Set(["NUEVO", "NUEVA", "NEW", "EL", "LA", "UN", "UNA"]);

/**
 * Clave con la que se «enseña» un modelo: las dos primeras palabras de la línea del pedido, sin la marca ni «Nuevo»
 * ni el precio («DACIA NUEVO SANDERO Expression Hybrid… 16.138,02 €» → «SANDERO EXPRESSION»). Devuelve null si no hay
 * texto aprovechable.
 */
export function claveAprendizaje(texto: string, marcas: string[]): string | null {
  const sinPrecio = limpiar(texto).replace(/\s+-?[\d.]+,\d{2}\s*€?\s*$/, "");
  const marcasN = new Set(marcas.map(limpiar));
  const palabras = sinPrecio.split(" ").filter((w) => w && !marcasN.has(w) && !PALABRAS_VACIAS.has(w));
  const clave = palabras.slice(0, 2).join(" ").replace(/[^A-Z0-9 .-]/g, "").trim();
  return clave.length >= 2 ? clave : null;
}

/** Modelos enseñados por el usuario cuya clave aparece en el texto; gana la clave más larga. */
export function modeloAprendido(texto: string, aprendidos: { alias: string; id: number }[]): number | null {
  const t = sinAcentos(texto);
  let mejor: { id: number; largo: number } | null = null;
  for (const a of aprendidos) {
    if ((!mejor || a.alias.length > mejor.largo) && new RegExp(`(?<![A-Z0-9])${escapar(a.alias)}(?![A-Z0-9])`).test(t)) mejor = { id: a.id, largo: a.alias.length };
  }
  return mejor?.id ?? null;
}
