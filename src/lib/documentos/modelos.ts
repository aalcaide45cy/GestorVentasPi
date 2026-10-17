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

/* ------------------------------------------------------------------ */
/* Marca y modelo del pedido: solo eso, sin acabados, motor ni códigos  */
/* ------------------------------------------------------------------ */

/** Marcas habituales, para reconocer la marca de un pedido aunque todavía no esté creada en la app. */
export const MARCAS_CONOCIDAS = [
  "Dacia", "Renault", "Nissan", "Mitsubishi", "Mobilize", "Alpine", "Seat", "Cupra", "Volkswagen", "Audi", "BMW", "Mercedes",
  "Toyota", "Hyundai", "Kia", "Ford", "Opel", "Peugeot", "Citroën", "DS", "Fiat", "Skoda", "Volvo", "Mazda", "Honda", "Suzuki",
  "Jeep", "Smart", "Tesla", "MG", "BYD", "Lexus", "Mini", "Land Rover", "Alfa Romeo", "Samsung", "Lancia", "Subaru", "Porsche",
  "Jaguar", "Lynk & Co", "Polestar", "Leapmotor", "Ssangyong", "Isuzu", "Iveco", "Maserati", "Abarth", "Ineos", "Omoda", "Jaecoo",
];

const NO_PALABRAS = new Set(["NUEVO", "NUEVA", "NEW", "EL", "LA", "UN", "UNA", "VEHICULO", "COCHE"]);
/** Palabras que, tras la primera, forman parte del nombre del modelo («Sandero Stepway»). */
const SEGUNDA_DEL_MODELO = new Set(["STEPWAY"]);
/** Primeras palabras que no son un modelo por sí solas («Grand Scenic»). */
const PRIMERA_COMPUESTA = new Set(["GRAND"]);
/** Siglas que se escriben en mayúsculas. */
const SIGLAS = new Set(["ASX", "GT", "RS", "EV", "SUV"]);

export interface CatalogoParaProponer {
  marcas: { id: number; nombre: string; modelos: { id: number; nombre: string }[] }[];
}

export interface PropuestaMarcaModelo {
  /** Nombre de la marca (el del catálogo si existe). */
  marca: string;
  modelo: string;
  idMarca: number | null;
  idModelo: number | null;
}

const bonito = (palabra: string): string => {
  if (/\d/.test(palabra) || SIGLAS.has(palabra.toUpperCase())) return palabra.toUpperCase();
  const p = palabra.toLowerCase();
  return p.charAt(0).toUpperCase() + p.slice(1);
};

/**
 * De la línea del pedido saca solo la marca y el modelo: «DACIA JOGGER extreme Eco-G 120 auto 7 plazas -SS2XT7 NCA6XGS» →
 * Dacia / Jogger. Si la marca o el modelo ya están en el catálogo devuelve sus identificadores, aunque el pedido traiga
 * acabados detrás. Todo lo que viene después del modelo (versión, motor, plazas, códigos, precio) se ignora.
 */
export function proponerMarcaModelo(texto: string, catalogo: CatalogoParaProponer): PropuestaMarcaModelo {
  const vacio: PropuestaMarcaModelo = { marca: "", modelo: "", idMarca: null, idModelo: null };
  const palabras = texto
    .replace(/\s+-?[\d.]+,\d{2}\s*(€|EUR)?\s*$/i, "")
    .split(/\s+/)
    .filter((w) => w && !NO_PALABRAS.has(sinAcentos(w)));
  if (palabras.length === 0) return vacio;
  const n = (i: number) => sinAcentos(palabras[i] ?? "");

  // Marca: la primera (o las dos primeras) palabras si son una marca conocida; si no, la primera marca del catálogo que aparezca
  const conocidas = [...catalogo.marcas.map((m) => m.nombre), ...MARCAS_CONOCIDAS];
  let marcaNombre: string | null = null;
  let usadas = 0;
  for (const nombre of conocidas) {
    const partes = nombre.split(" ");
    if (partes.every((p, i) => n(i) === sinAcentos(p)) && partes.length > usadas) {
      marcaNombre = nombre;
      usadas = partes.length;
    }
  }
  let resto = palabras.slice(usadas);
  if (marcaNombre === null) {
    // Abreviaturas de modelo sin marca: «R5», «R4» son Renault 5, Renault 4
    const r = /^R(\d{1,2})$/.exec(n(0));
    if (r) {
      marcaNombre = "Renault";
      resto = [r[1], ...palabras.slice(1)];
    } else {
      const i = palabras.findIndex((_, k) => catalogo.marcas.some((m) => sinAcentos(m.nombre) === n(k)));
      if (i >= 0) {
        marcaNombre = catalogo.marcas.find((m) => sinAcentos(m.nombre) === n(i))?.nombre ?? null;
        resto = palabras.slice(i + 1);
      } else {
        marcaNombre = bonito(palabras[0]);
        resto = palabras.slice(1);
      }
    }
  }
  const marcaCat = catalogo.marcas.find((m) => sinAcentos(m.nombre) === sinAcentos(marcaNombre ?? ""));
  const marca = marcaCat?.nombre ?? MARCAS_CONOCIDAS.find((m) => sinAcentos(m) === sinAcentos(marcaNombre ?? "")) ?? marcaNombre ?? "";

  // Modelo del catálogo: el más largo de la marca cuyas palabras abren el resto de la línea («Jogger», «Sandero Stepway»)
  const restoN = resto.map((w) => sinAcentos(w));
  let existente: { id: number; nombre: string } | null = null;
  let mejor = 0;
  for (const m of marcaCat?.modelos ?? []) {
    const tokens = nucleoModelo(m.nombre, marca).split(" ");
    if (tokens.length > mejor && tokens.every((t, i) => restoN[i] === t)) {
      existente = m;
      mejor = tokens.length;
    }
  }
  if (existente) return { marca, modelo: existente.nombre, idMarca: marcaCat?.id ?? null, idModelo: existente.id };

  // Modelo nuevo: la primera palabra (y la segunda si el modelo la lleva: «Sandero Stepway», «Grand Scenic»), sin códigos
  const utiles = resto.filter((w) => !/^-/.test(w));
  if (utiles.length === 0) return { marca, modelo: "", idMarca: marcaCat?.id ?? null, idModelo: null };
  let cuantas = 1;
  if (utiles.length > 1 && (PRIMERA_COMPUESTA.has(sinAcentos(utiles[0])) || SEGUNDA_DEL_MODELO.has(sinAcentos(utiles[1])))) cuantas = 2;
  const modelo = utiles.slice(0, cuantas).map(bonito).join(" ");
  return { marca, modelo, idMarca: marcaCat?.id ?? null, idModelo: null };
}
