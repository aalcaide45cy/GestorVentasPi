import { matriculasEnTexto } from "@/lib/rejilla/analizar";
import { buscarDniEnTexto, validarDni } from "./dni";

/**
 * Extracción de datos de un pedido de vehículo a partir de su texto.
 * - Formato Renault/Dacia («PEDIDO DE VEHÍCULO NUEVO/USADO»): lectura por estructura (cliente, NIF/NIE, domicilio,
 *   teléfono, correo, vendedor, modelo, fechas y promociones de financiación).
 * - Cualquier otro: lectura genérica por patrones (bastidor de 17 caracteres, matrícula, DNI/NIE, fechas rotuladas).
 * Modelo y forma de pago se comparan con los catálogos de la aplicación.
 */

export interface CatalogoPedido {
  modelos: { id: number; nombre: string; marca: string | null }[];
  tiposVenta: { id: number; nombre: string; categoria: string }[];
}

export interface DatosPedido {
  numeroPedido: string | null;
  vin: string | null;
  matricula: string | null;
  /** DNI/NIE/CIF del cliente. */
  dni: string | null;
  cliente: string | null;
  telefono: string | null;
  email: string | null;
  domicilio: string | null;
  /** Vendedor que figura en el pedido. */
  vendedor: string | null;
  fechaExpediente: string | null;
  /** Fecha de entrega que figura en el documento (solo si es una fecha concreta). */
  fechaEntrega: string | null;
  fechaMatriculacion: string | null;
  /** Plazo de entrega previsto («12 Oct 2026 / 23 Oct 2026»), informativo. */
  plazoEntrega: { desde: string; hasta: string } | null;
  idModelo: number | null;
  modeloTexto: string | null;
  idTipoDeVenta: number | null;
  avisos: string[];
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

const MESES: Record<string, number> = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };

function aIso(d: string, m: string, a: string): string | null {
  const dd = Number(d);
  const mm = Number(m);
  let aa = Number(a);
  if (aa < 100) aa += 2000;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || aa < 1990 || aa > 2100) return null;
  return `${aa}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Fechas «08 Oct 2026», «8 octubre 2026» o «08/10/2026» de un texto, como AAAA-MM-DD. */
function fechasEnTexto(texto: string): string[] {
  const res: string[] = [];
  for (const m of sinAcentos(texto).matchAll(/(?<!\d)(\d{1,2})\s+([A-Z]{3,10})\.?\s+(?:DE\s+)?(\d{4})(?!\d)/g)) {
    const mes = MESES[m[2].slice(0, 3)];
    if (mes) {
      const f = aIso(m[1], String(mes), m[3]);
      if (f) res.push(f);
    }
  }
  for (const m of texto.matchAll(/(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?!\d)/g)) {
    const f = aIso(m[1], m[2], m[3]);
    if (f) res.push(f);
  }
  return res;
}

/** Primera fecha que aparece en la línea de la etiqueta o en la siguiente. */
function fechaTrasEtiqueta(lineas: string[], etiqueta: RegExp): string | null {
  for (let i = 0; i < lineas.length; i++) {
    if (!etiqueta.test(sinAcentos(lineas[i]))) continue;
    for (const l of [lineas[i], lineas[i + 1] ?? ""]) {
      const f = fechasEnTexto(l)[0];
      if (f) return f;
    }
  }
  return null;
}

/** Primera «columna» de una línea (las columnas del PDF se separan con dos o más espacios). */
const primeraColumna = (l: string): string => l.split(/\s{2,}/)[0].trim();

const HONORIFICO = /^(?:Sr\.?|Sra\.?|Srta\.?|Sres\.?)?\s*(?:Don|Doña|Dña\.?|D\.|Dª)?\s+/i;

interface Estructura {
  numeroPedido: string | null;
  cliente: string | null;
  dni: string | null;
  domicilio: string | null;
  telefono: string | null;
  email: string | null;
  vendedor: string | null;
  fecha: string | null;
  plazo: { desde: string; hasta: string } | null;
  modeloLinea: string | null;
}

/** Pedido de Renault/Dacia: bloque «CLIENTE» a la izquierda, establecimiento a la derecha, «RESUMEN» con el modelo. */
function leerEstructuraRenault(lineas: string[]): Estructura | null {
  const iCliente = lineas.findIndex((l) => /^CLIENTE\b/.test(l.trim()) && /ESTABLECIMIENTO/i.test(l));
  if (iCliente < 0) return null;
  const bloque = lineas.slice(iCliente + 1);
  const iResumen = bloque.findIndex((l) => /^RESUMEN\b/.test(l.trim()));
  const datos = iResumen >= 0 ? bloque.slice(0, iResumen) : bloque.slice(0, 12);

  const e: Estructura = { numeroPedido: null, cliente: null, dni: null, domicilio: null, telefono: null, email: null, vendedor: null, fecha: null, plazo: null, modeloLinea: null };
  const num = lineas.join("\n").match(/N[úu]mero\s+Pedido\s+(\d{5,})/i);
  e.numeroPedido = num ? num[1] : null;
  const emitido = lineas.find((l) => /^Emitido/i.test(l.trim()));
  e.fecha = emitido ? (fechasEnTexto(emitido)[0] ?? null) : null;

  // Columna izquierda de cada línea del bloque del cliente
  const col = datos.map(primeraColumna);
  e.cliente = col[0] ? col[0].replace(HONORIFICO, "").trim() || null : null;
  const iNif = col.findIndex((c, i) => i > 0 && /^[A-Z]?\d{7,8}[A-Z]$/i.test(c.replace(/\s/g, "")));
  if (iNif > 0) e.dni = col[iNif].replace(/\s/g, "").toUpperCase();
  const iCP = col.findIndex((c) => /\(\d{5}\)/.test(c));
  if (iNif > 0 && iCP > iNif) e.domicilio = [...col.slice(iNif + 1, iCP), col[iCP]].join(", ");
  const tel = col.slice(iCP + 1).find((c) => /^\+?\d[\d\s]{7,13}$/.test(c));
  e.telefono = tel ? tel.replace(/\s/g, "") : null;
  const mail = col.slice(iCP + 1).find((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));
  e.email = mail ?? null;
  // Vendedor: el nombre que precede a la línea con su correo y teléfono (la segunda dirección de correo del bloque)
  const iVend = datos.findIndex((l, i) => i > 0 && /@/.test(l) && /\d{9}/.test(l));
  if (iVend > 0) e.vendedor = primeraColumna(datos[iVend - 1]) || null;

  const modelo = lineas.find((l) => /^Modelo:/i.test(l.trim()));
  if (modelo) e.modeloLinea = modelo.replace(/^Modelo:\s*/i, "").replace(/\s{2,}-?[\d.]+,\d{2}\s*€\s*$/, "").replace(/\s{2,}/g, " ").trim();

  const plazo = lineas.find((l) => /^Plazo\s+de\s+Entrega/i.test(l.trim()));
  if (plazo) {
    const fs = fechasEnTexto(plazo);
    if (fs.length >= 2) e.plazo = { desde: fs[0], hasta: fs[1] };
  }
  return e;
}

export function parsearPedido(texto: string, catalogo: CatalogoPedido): DatosPedido {
  // Solo la primera hoja cuenta: las siguientes son las condiciones generales, que citan todas las formas de pago
  const corte = texto.search(/ESTIPULACIONES GENERALES|Queda prohibida la reproducci/i);
  const primera = corte > 0 ? texto.slice(0, corte) : texto;
  const lineas = primera.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const mayus = sinAcentos(primera);
  const avisos: string[] = [];
  const estructura = leerEstructuraRenault(lineas);

  // Bastidor y matrícula: sin direcciones de correo (su parte local puede tener 17 caracteres). En un pedido de Renault
  // de vehículo nuevo no hay ni uno ni otra: solo se aceptan si están rotulados («Bastidor», «Matrícula»).
  const sinCorreos = (t: string) => t.replace(/[^\s@]+@[^\s@]+/g, " ");
  const lineasBusqueda = estructura ? lineas.filter((l) => /BASTIDOR|\bVIN\b|CHASIS|MATR[IÍ]CULA/i.test(l)) : lineas.map(sinCorreos);
  const textoBusqueda = lineasBusqueda.join("\n");
  // Bastidor: 17 caracteres alfanuméricos sin I, O ni Q (el OCR confunde O/0 e I/1: se corrigen)
  let vin: string | null = null;
  for (const m of sinAcentos(textoBusqueda).matchAll(/(?<![A-Z0-9])([A-Z0-9]{17})(?![A-Z0-9])/g)) {
    const c = m[1].replace(/O/g, "0").replace(/I/g, "1").replace(/Q/g, "0");
    if (/\d/.test(c) && /[A-Z]/.test(c)) {
      vin = c;
      break;
    }
  }

  const matricula = lineasBusqueda.flatMap((l) => (/\b[A-HJ-NP-Z0-9]{17}\b/i.test(l) ? [] : matriculasEnTexto(l)))[0] ?? null;

  let dni = estructura?.dni ?? null;
  if (dni && !validarDni(dni) && !/^[A-Z]\d{8}$|^[A-Z]\d{7}[A-Z0-9]$/.test(dni)) dni = buscarDniEnTexto(dni)?.dni ?? dni;
  if (!dni) dni = buscarDniEnTexto(mayus)?.dni ?? null;

  let cliente = estructura?.cliente ?? null;
  if (!cliente) {
    const i = lineas.findIndex((l) => /^(CLIENTE|TITULAR|COMPRADOR|NOMBRE Y APELLIDOS|NOMBRE)\b/i.test(sinAcentos(l)));
    if (i >= 0) {
      const mismo = lineas[i].replace(/^[^:]*:\s*/, "");
      const cand = mismo !== lineas[i] ? mismo : lineas[i + 1];
      if (cand && /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'. -]{4,}$/.test(cand)) cliente = cand.replace(/\s+/g, " ").trim();
    }
  }

  const fechaExpediente = estructura?.fecha ?? fechaTrasEtiqueta(lineas, /FECHA\s*(DE\s*)?(PEDIDO|ORDEN|CONTRATO|EXPEDIENTE)|^FECHA\b|^EMITIDO/);
  const fechaEntrega = estructura ? null : fechaTrasEtiqueta(lineas, /ENTREGA/);
  const fechaMatriculacion = fechaTrasEtiqueta(lineas, /MATRICULACION/);

  // Modelo: el nombre de catálogo más largo que aparece en el texto (preferiblemente junto a su marca)
  const buscaEn = estructura?.modeloLinea ? sinAcentos(estructura.modeloLinea) : mayus;
  const candidatos = catalogo.modelos
    .filter((m) => m.nombre.trim().length >= 2 && new RegExp(`(?<![A-Z0-9])${sinAcentos(m.nombre).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Z0-9])`).test(buscaEn))
    .sort((a, b) => b.nombre.length - a.nombre.length);
  const conMarca = candidatos.find((m) => m.marca && buscaEn.includes(sinAcentos(m.marca)));
  const modelo = conMarca ?? candidatos[0] ?? null;
  if (candidatos.length > 1 && !conMarca) avisos.push("Aparecen varios modelos del catálogo en el pedido: comprueba el elegido.");
  if (estructura?.modeloLinea && !modelo) avisos.push(`El modelo del pedido («${estructura.modeloLinea}») no está en tus catálogos: elígelo a mano.`);

  // Forma de pago por palabras clave de la primera hoja (promociones de financiación, renting…)
  let idTipoDeVenta: number | null = null;
  const porCategoria = (cat: string) => catalogo.tiposVenta.find((t) => t.categoria === cat)?.id ?? null;
  // Un descuento o promoción de «crédito», «financiación» o «preference» indica que el expediente no es de contado: se
  // cambia el tipo. Se miran solo las líneas de descuento (no el resto del pedido, que puede citar la financiación en
  // otros contextos). Preference es más específico que crédito.
  const lineasDescuento = lineas.filter((l) => /PROMOCION|\bDTO\b|DTO\.|DESCUENTO|BONIFICACION|AYUDA/.test(sinAcentos(l)));
  const dto = sinAcentos(lineasDescuento.join("\n"));
  if (/PREFERENCE/.test(dto)) idTipoDeVenta = porCategoria("PREFERENCE");
  else if (/CREDITO|FINANCIA|\bRCI\b|PRESTAMO/.test(dto)) idTipoDeVenta = porCategoria("CREDITO");
  else if (/RENTING|ARRENDAMIENTO/.test(dto)) idTipoDeVenta = porCategoria("RENTING");
  if (idTipoDeVenta !== null) avisos.push("El pedido lleva un descuento de financiación: se ha cambiado el tipo de venta.");
  // Documentos que no son un pedido de Renault: se buscan además las palabras clave en todo el texto
  if (!estructura && idTipoDeVenta === null) {
    if (/RENTING|ARRENDAMIENTO/.test(mayus)) idTipoDeVenta = porCategoria("RENTING");
    else if (/PREFERENCE/.test(mayus)) idTipoDeVenta = porCategoria("PREFERENCE");
    else if (/FINANCIA|CREDITO|PRESTAMO|\bRCI\b/.test(mayus)) idTipoDeVenta = porCategoria("CREDITO");
    else if (/CONTADO|TRANSFERENCIA/.test(mayus)) idTipoDeVenta = porCategoria("CONTADO");
    const porNombre = catalogo.tiposVenta.find((t) => t.nombre.length >= 4 && mayus.includes(sinAcentos(t.nombre)));
    if (porNombre) idTipoDeVenta = porNombre.id;
  }

  const hayAlgo = vin || matricula || dni || modelo || estructura;
  if (!hayAlgo) avisos.push("No se ha reconocido ningún dato útil en el documento.");
  else avisos.push("Lectura automática: comprueba cada dato antes de guardar.");

  return {
    numeroPedido: estructura?.numeroPedido ?? null,
    vin,
    matricula,
    dni,
    cliente,
    telefono: estructura?.telefono ?? null,
    email: estructura?.email ?? null,
    domicilio: estructura?.domicilio ?? null,
    vendedor: estructura?.vendedor ?? null,
    fechaExpediente,
    fechaEntrega,
    fechaMatriculacion,
    plazoEntrega: estructura?.plazo ?? null,
    idModelo: modelo?.id ?? null,
    modeloTexto: modelo?.nombre ?? estructura?.modeloLinea ?? null,
    idTipoDeVenta,
    avisos,
  };
}
