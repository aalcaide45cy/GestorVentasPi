import { limpiarNif, normalizarMatricula } from "@/lib/identificadores";

/**
 * Lectura del «Detalle de la liquidación de pago» que envía la financiera (Mobilize Financial Services / RCI Banque) al concesionario
 * cuando paga una operación. Lo que importa de él: la fecha de pago (es la de contratación de la financiación), el bastidor, la
 * matrícula (solo en usados) y el documento del adquiriente (no el de la persona que representa a la financiera, que sale más
 * abajo con otro documento). Todo es puro, sobre el texto del PDF, para poder probarlo.
 */

export interface PagoRciLeido {
  numeroOperacion: string;
  /** AAAA-MM-DD */
  fechaPago: string;
  nif: string;
  nombre: string;
  bastidor: string;
  matricula: string;
  marca: string;
  modelo: string;
  /** Importe nominal del préstamo y total líquido al vendedor, en céntimos. */
  importeNominalCent: number | null;
  totalLiquidoCent: number | null;
  /** Qué no se ha podido leer (para enseñarlo y que se complete a mano). */
  faltan: string[];
}

const aIso = (d: string): string | null => {
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
};

const aCentimos = (t: string | undefined): number | null => {
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/** ¿Es un pago de la financiera? (cualquier otro documento se ignora en la zona de pagos). */
export function esPagoRci(texto: string): boolean {
  const t = texto.replace(/\s+/g, " ");
  return /LIQUIDACI[OÓ]N DE PAGO/i.test(t) && /(RCI Banque|Mobilize|CRLIQVEN)/i.test(t);
}

/** Entre dos rótulos del documento (o hasta el final). */
function seccion(texto: string, desde: RegExp, hasta: RegExp): string {
  const i = texto.search(desde);
  if (i < 0) return "";
  const resto = texto.slice(i);
  const j = resto.slice(1).search(hasta);
  return j < 0 ? resto : resto.slice(0, j + 1);
}

export function parsearPagoRci(texto: string): PagoRciLeido | null {
  if (!esPagoRci(texto)) return null;
  const plano = texto.replace(/\r/g, "");
  const una = plano.replace(/\s+/g, " ");

  // Los rótulos pueden ir juntos en una línea y los valores en la siguiente («NÚMERO DE OPERACIÓN FECHA DE PAGO PUNTO DE RED 2026… 17/08/2026 5081»)
  const numeroOperacion = una.match(/N[ÚU]MERO DE OPERACI[ÓO]N(?:\s+FECHA DE PAGO)?(?:\s+PUNTO DE RED)?\s+(\d{6,})/i)?.[1] ?? una.match(/N[º°]:\s*(\d{6,})/i)?.[1] ?? "";
  const fechaPago = aIso(una.match(/FECHA DE PAGO(?:\s+PUNTO DE RED)?\s+(?:\d{6,}\s+)?(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ?? "") ?? "";

  const vehiculo = seccion(plano, /DATOS VEH[ÍI]CULO/i, /DATOS ADQUIRIENTE/i);
  const vehiculoUna = vehiculo.replace(/\s+/g, " ");
  const bastidor = vehiculoUna.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)?.[1] ?? "";
  // La matrícula (si la hay) va antes de la fecha de matriculación y del bastidor; sin ella el hueco está vacío
  const trasRotulos = (vehiculoUna.split(/N[úu]mero de Chasis/i)[1] ?? "").trim();
  const matriculaCruda = trasRotulos.match(/\bE?\d{4}\s?[BCDFGHJKLMNPRSTVWXYZ]{3}\b/i)?.[0] ?? "";
  const matricula = normalizarMatricula(matriculaCruda);
  // Dos disposiciones: «Marca DACIA Modelo X Matrícula…» o los rótulos juntos y los valores debajo («Marca Modelo Matrícula … DACIA X 3881LYM …»)
  let marca = "";
  let modelo = "";
  const intercalado = vehiculoUna.match(/Marca\s+(\S+)\s+Modelo\s+(.+?)\s+Matr[íi]cula/i);
  if (intercalado && !/^Matr/i.test(intercalado[2])) {
    marca = intercalado[1];
    modelo = intercalado[2].trim();
  } else if (trasRotulos) {
    const [primero, ...resto] = trasRotulos.split(" ");
    marca = primero;
    const hasta = resto.findIndex((x) => x === bastidor || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(x) || (matriculaCruda !== "" && matriculaCruda.replace(/\s/g, "").startsWith(x)));
    modelo = (hasta < 0 ? resto : resto.slice(0, hasta)).join(" ").trim();
  }

  const adquiriente = seccion(plano, /DATOS ADQUIRIENTE/i, /DATOS DE LA PERSONA QUE REPRESENTA/i).replace(/\s+/g, " ");
  const ad = adquiriente.match(/Nombre y Apellidos\/Raz[óo]n Social:\s*(.+?)\s+N\.?I\.?F\.?:\s*([A-Z0-9][A-Z0-9 .-]{5,13}?)(?=\s+(?:Domicilio|C[óo]digo|$)|\s*$)/i);
  const nif = limpiarNif(ad?.[2] ?? "");
  const nombre = (ad?.[1] ?? "").trim();

  const importeNominalCent = aCentimos(una.match(/IMPORTE NOMINAL DEL PR[ÉE]STAMO\s+([\d.]+,\d{2})/i)?.[1]);
  const totalLiquidoCent = aCentimos(una.match(/TOTAL L[ÍI]QUIDO\s+([\d.]+,\d{2})/i)?.[1]);

  const faltan: string[] = [];
  if (!numeroOperacion) faltan.push("número de operación");
  if (!fechaPago) faltan.push("fecha de pago");
  if (!nif) faltan.push("documento del adquiriente");
  if (!bastidor && !matricula) faltan.push("bastidor");
  return { numeroOperacion, fechaPago, nif, nombre, bastidor, matricula, marca, modelo, importeNominalCent, totalLiquidoCent, faltan };
}
