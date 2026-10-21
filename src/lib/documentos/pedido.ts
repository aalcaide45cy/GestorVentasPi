import { modeloAprendido, proponerMarcaModelo, puntuarModelo } from "./modelos";
import { matriculasEnTexto } from "@/lib/rejilla/analizar";
import { buscarDniEnTexto, validarDni } from "./dni";

/**
 * Extracción de datos de un pedido de vehículo a partir de su texto.
 * - Formato Renault/Dacia («PEDIDO DE VEHÍCULO NUEVO/USADO»): lectura por estructura (cliente, NIF/NIE, domicilio,
 *   teléfono, correo, vendedor, modelo, fechas y promociones de financiación).
 * - Cualquier otro: lectura genérica por patrones (bastidor de 17 caracteres, matrícula, DNI/NIE, fechas rotuladas).
 * Modelo y forma de pago se comparan con los catálogos de la aplicación.
 */

/**
 * Separa «Calle X, 36, 4, B, Madrid, Madrid (28032)» en calle, población y código postal: el último trozo es la provincia
 * con el código postal entre paréntesis y el anterior, la población.
 */
export function partirDomicilio(texto: string | null): { domicilio: string | null; poblacion: string | null; codigoPostal: string | null } {
  if (!texto) return { domicilio: null, poblacion: null, codigoPostal: null };
  const cp = texto.match(/\((\d{5})\)/)?.[1] ?? null;
  const trozos = texto.replace(/\s*\(\d{5}\)\s*$/, "").split(",").map((t) => t.trim()).filter(Boolean);
  if (trozos.length >= 3) return { domicilio: trozos.slice(0, -2).join(", "), poblacion: trozos[trozos.length - 2], codigoPostal: cp };
  if (trozos.length === 2) return { domicilio: trozos[0], poblacion: trozos[1], codigoPostal: cp };
  return { domicilio: trozos[0] ?? null, poblacion: null, codigoPostal: cp };
}

export interface CatalogoPedido {
  modelos: { id: number; nombre: string; marca: string | null }[];
  tiposVenta: { id: number; nombre: string; categoria: string }[];
  /** Correcciones que el usuario ha enseñado antes («SANDERO EXPRESSION» → modelo X). */
  aliasModelos?: { alias: string; id: number }[];
  /** Nombres de todas las marcas del catálogo (también las que aún no tienen modelos). */
  marcas?: string[];
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
  /** Calle y número (sin población ni código postal). */
  domicilio: string | null;
  poblacion: string | null;
  codigoPostal: string | null;
  /** Vendedor que figura en el pedido. */
  vendedor: string | null;
  fechaExpediente: string | null;
  /** Fecha de entrega que figura en el documento (solo si es una fecha concreta). */
  fechaEntrega: string | null;
  fechaMatriculacion: string | null;
  /** Plazo de entrega previsto («12 Oct 2026 / 23 Oct 2026»), informativo. */
  plazoEntrega: { desde: string; hasta: string } | null;
  idModelo: number | null;
  /** Marca y modelo limpios del pedido (sin acabado, motor ni códigos), para proponer crearlos si no existen. */
  marcaPropuesta: string | null;
  modeloPropuesto: string | null;
  modeloTexto: string | null;
  idTipoDeVenta: number | null;
  /** «nuevo» (pedido de vehículo nuevo), «usado» (vehículo de ocasión vendido) o null si no se reconoce. */
  tipoPedido: "nuevo" | "usado" | null;
  /** false si el documento no tiene pinta de pedido (otro PDF con datos de un cliente): no debe crear ni adjuntarse a nada. */
  esPedido: boolean;
  /** Vehículo de retoma (usado que deja el cliente), de la sección «Valoración VO»: su matrícula nunca es la del coche vendido. */
  retoma: { matricula: string | null; vin: string | null; texto: string | null } | null;
  avisos: string[];
}

/**
 * Documentos de la red que se parecen a un pedido pero no lo son (se descubrieron revisando miles de PDF): la hoja de prueba de
 * un vehículo de demostración, el anexo de condiciones de comercialización de vehículos de ocasión (Anexo VO), la información o
 * oferta de un vehículo, presupuestos y contratos. Si su cabecera lo dice, no es un pedido aunque lleve el mismo bloque de cliente.
 */
const CABECERA_QUE_NO_ES_PEDIDO = /HOJA\s+DE\s+PRUEBA|VEHICULO\s+DE\s+DEMOSTRACION|PRUEBA\s+DE\s+VEHICULO|ANEXO\s+(VO|A\s+LAS\s+CONDICIONES)|^\W*ANEXO\b|INFORMACION\s+DE\s+VEHICULO|OFERTA\s+(DE|FINANCIERA)|PRESUPUESTO|CONTRATO\s+DE/;
const SENAL_DE_PEDIDO = /PEDIDO\s+DE\s+VEH|N[UÚ]MERO\s+(DE\s+)?PEDIDO\s*:?\s*\d{5,}|(HOJA|ORDEN)\s+DE\s+PEDIDO/;

/** ¿La cabecera (ya sin acentos y en mayúsculas) es de uno de esos documentos que no son pedidos? */
export function cabeceraDeOtroDocumento(cabeceraNormalizada: string): boolean {
  return CABECERA_QUE_NO_ES_PEDIDO.test(cabeceraNormalizada.slice(0, 900));
}

/** Un pedido lleva «PEDIDO DE VEHÍCULO…» o «Número Pedido 12345678» arriba, y no es uno de los documentos de la lista anterior. */
export function textoDePedido(texto: string): boolean {
  const t = sinAcentos(texto.slice(0, 2500));
  return !cabeceraDeOtroDocumento(t) && SENAL_DE_PEDIDO.test(t);
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

const HONORIFICO = /^(?:(?:Sres|Sra|Srta|Sr|Don|Doña|Dña|Dª|D)\.?\s+)+/i;

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
  /** El OCR no leyó bien la letra del DNI y se ha calculado con sus 8 cifras. */
  dniCalculado?: boolean;
}

/** Pedido de Renault/Dacia: bloque «CLIENTE» a la izquierda, establecimiento a la derecha, «RESUMEN» con el modelo. */
/**
 * El OCR pierde la «@» de los correos o la confunde con «E», «Q», «G», «©» o un espacio, y a veces deforma el dominio
 * («hoimail», «gnail»). Si el resto cuadra con un proveedor conocido, se recompone el correo.
 */
function repararCorreo(c: string): string | null {
  const m = c.trim().match(/^([\w.+-]{3,}?)(?:\s*[EQG©@]\s*|\s+)(g[mn]a[il1]l|h[o0][tli1]{0,2}mail|outlook|yahoo|icloud|live|msn|me)\.([a-z.]{2,})$/);
  if (!m) return null;
  const d = m[2].toLowerCase();
  const dominio = d.startsWith("g") ? "gmail" : d.startsWith("h") ? "hotmail" : d;
  return `${m[1]}@${dominio}.${m[3]}`.toLowerCase();
}

const CONFUSIONES_CIFRA: Record<string, string> = { "0": "689", "1": "7", "2": "7", "3": "8", "4": "9", "5": "68", "6": "058", "7": "12", "8": "035690", "9": "048" };
const LETRA_A_CIFRA: Record<string, string> = { C: "0", O: "0", D: "0", Q: "0", I: "1", L: "1", S: "5", G: "6", B: "8" };

/**
 * DNI leído con errores de OCR: la primera cifra como letra («C3217051K») y/o una cifra confundida con otra parecida
 * (0/9, 1/7, 5/6, 3/8…). Solo se devuelve un DNI si exactamente uno de los cambios de una cifra hace cuadrar la letra.
 */
export function repararNif(nif: string): string | null {
  const t = nif.toUpperCase().replace(/\s/g, "");
  const m = t.match(/^([A-Z]?)(\d{7,8})([A-Z])$/);
  if (!m) return null;
  let cifras = m[2];
  if (m[1]) {
    const c = LETRA_A_CIFRA[m[1]];
    if (!c || cifras.length !== 7) return null;
    cifras = c + cifras;
  }
  if (cifras.length !== 8) return null;
  if (validarDni(cifras + m[3])) return cifras + m[3];
  const validos = new Set<string>();
  for (let i = 0; i < 8; i++) {
    for (const alt of CONFUSIONES_CIFRA[cifras[i]] ?? "") {
      const prueba = cifras.slice(0, i) + alt + cifras.slice(i + 1);
      if (validarDni(prueba + m[3])) validos.add(prueba + m[3]);
    }
  }
  return validos.size === 1 ? [...validos][0] : null;
}

function leerEstructuraRenault(lineas: string[]): Estructura | null {
  // «CLIENTE  ESTABLECIMIENTO DE LA RED RENAULT» en una línea; en un escaneo flojo puede salir «CLIENTE» solo, con el establecimiento en la línea de al lado
  const iCliente = lineas.findIndex((l, i) => /^[^A-Za-z0-9]*CL[IiLl1|]ENTE\b/.test(l.trim()) && lineas.slice(Math.max(0, i - 2), i + 3).some((x) => /ESTABLECIMIENTO/i.test(x)));
  if (iCliente < 0) return null;
  const bloque = lineas.slice(iCliente + 1);
  const iResumen = bloque.findIndex((l) => /^RESUMEN\b/.test(l.trim()));
  let datos = iResumen >= 0 ? bloque.slice(0, iResumen) : bloque.slice(0, 12);
  // En un escaneo, la rayita o el logotipo de encima del nombre salen como una línea de basura: se salta hasta la línea del
  // cliente («Sr. D. …», «Sra. Doña …») o, si no hay tratamiento, hasta la primera que parezca un nombre
  const esNombre = (l: string) => {
    const c = primeraColumna(l).trim();
    const letras = (c.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) ?? []).length;
    return c.length >= 5 && /\s/.test(c) && letras / c.length >= 0.85 && !/\d/.test(c);
  };
  const iNombre = datos.findIndex((l) => HONORIFICO.test(primeraColumna(l).trim()));
  const iPlausible = iNombre >= 0 ? iNombre : datos.findIndex(esNombre);
  if (iPlausible > 0 && iPlausible < 4) datos = datos.slice(iPlausible);

  const e: Estructura = { numeroPedido: null, cliente: null, dni: null, domicilio: null, telefono: null, email: null, vendedor: null, fecha: null, plazo: null, modeloLinea: null };
  const num = lineas.join("\n").match(/N[úu]mero\s+Pedido\s+(\d{5,})/i);
  e.numeroPedido = num ? num[1] : null;
  const emitido = lineas.find((l) => /^Emitido/i.test(l.trim()));
  e.fecha = emitido ? (fechasEnTexto(emitido)[0] ?? null) : null;

  // Columna izquierda de cada línea del bloque del cliente
  const col = datos.map(primeraColumna);
  // El OCR lee a veces la «D.» del tratamiento como «E.» («Sr. E. Mario Muñoz»)
  e.cliente = col[0] ? col[0].replace(/^(Sra?\.?)\s+E\.\s+/i, "$1 D. ").replace(/^[A-Za-z](?=Do[ñn]a\b|Don\b)/, "").replace(HONORIFICO, "").trim() || null : null;
  let iNif = col.findIndex((c, i) => i > 0 && /^([A-Z]?\d{7,8}[A-Z]|[A-HJNP-SUVW]\d{7}[0-9A-J])$/i.test(c.replace(/\s/g, "")));
  if (iNif > 0) e.dni = col[iNif].replace(/\s/g, "").toUpperCase();
  else {
    // En un escaneo, la letra del DNI se lee a veces como una cifra («472321760» por «47232176Q») o se pierde: con las 8 cifras se calcula la letra
    iNif = col.findIndex((c, i) => i > 0 && i <= 3 && /^\d{8}([^A-Za-z\d]|\d)?$/.test(c.replace(/\s/g, "")));
    if (iNif > 0) {
      const base = col[iNif].replace(/\s/g, "").slice(0, 8);
      e.dni = base + "TRWAGMYFPDXBNJZSQVHLCKE"[Number(base) % 23];
      e.dniCalculado = true;
    }
  }
  const iCP = col.findIndex((c) => /\(\d{5}\)/.test(c));
  if (iNif > 0 && iCP > iNif) e.domicilio = [...col.slice(iNif + 1, iCP), col[iCP]].join(", ");
  const tel = col.slice(iCP + 1).flatMap((c) => c.split(/\s*[\/;]\s*/)).find((c) => /^\+?\d[\d\s]{7,13}$/.test(c.trim()));
  e.telefono = tel ? tel.replace(/\s/g, "") : null;
  const mail = col.slice(iCP + 1).find((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));
  // El OCR suele perder la «@» (y a veces la deja como «Q»): «luisimarino gmail.com»
  const mailSinArroba = col.slice(iCP + 1).map(repararCorreo).find(Boolean);
  e.email = mail ?? mailSinArroba ?? null;
  // Vendedor: el nombre que precede a la línea con su correo y teléfono (la segunda dirección de correo del bloque)
  const iVend = datos.findIndex((l, i) => i > 0 && /@|[a-z]Q[a-z]+\.(?:es|com)\b/.test(l) && /\d{9}/.test(l));
  if (iVend > 0) e.vendedor = primeraColumna(datos[iVend - 1]) || null;

  const modelo = lineas.find((l) => /^Mode[lti1]o\s*:/i.test(l.trim()));
  if (modelo) e.modeloLinea = modelo.replace(/^Mode[lti1]o\s*:\s*/i, "").replace(/\s{2,}-?[\d.]+,\d{2}\s*€\s*$/, "").replace(/\s{2,}/g, " ").trim();
  // Los pedidos de vehículos de ocasión no traen «Modelo:»: el vehículo va en el resumen, «Marca / Modelo / Versión: RENAULT Mégane S.T. … >[2535JXC]  12.620,00 €»
  else {
    const resumen = lineas.find((l) => /^[^A-Za-z0-9]*Marca\s*\/\s*Modelo\s*\/\s*Versi[oó]n\s*:/i.test(l.trim()));
    const texto = resumen
      ?.replace(/^[^A-Za-z0-9]*Marca\s*\/\s*Modelo\s*\/\s*Versi[oó]n\s*:\s*/i, "")
      .replace(/\s*>\s*\[.*$/, "")
      .replace(/\s{2,}-?[\d.]+,\d{2}\s*€\s*$/, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (texto) e.modeloLinea = texto.replace(/^(\S+)\s+\1\b/i, "$1");
  }

  // El OCR pega a veces el modelo con la versión («ARKANAesprit» por «ARKANA esprit»): se separa donde las mayúsculas dan paso a minúsculas
  if (e.modeloLinea) e.modeloLinea = e.modeloLinea.replace(/\b([A-ZÁÉÍÓÚÑ]{4,})([a-záéíóúñ]{3,})\b/g, "$1 $2");
  // Si la linea del modelo solo trae el importe (el nombre se perdio en el escaneo), no hay modelo
  if (e.modeloLinea && !/[A-Za-z]{3}/.test(e.modeloLinea.normalize("NFD").replace(/[̀-ͯ]/g, ""))) e.modeloLinea = null;
  const plazo = lineas.find((l) => /^Plazo\s+de\s+Entrega/i.test(l.trim()));
  if (plazo) {
    const fs = fechasEnTexto(plazo);
    if (fs.length >= 2) e.plazo = { desde: fs[0], hasta: fs[1] };
  }
  return e;
}

const ENCABEZADO_RETOMA = /^(?:FICHA\s+DE\s+)?(?:VALORACION|TASACION)\b.{0,45}$|^(?:RETOMA|VEHICULO\s+(?:USADO|DE\s+OCASION|DE\s+RETOMA))\b.{0,35}$/;
const LINEA_VALORACION_VO = /^(?:VALORACION|TASACION)\s+(?:VO|DE\s+VEHICULO\s+USADO)\b/;
const FIN_SECCION = /^(?:CLIENTE|RESUMEN|TOTAL|FORMA\s+DE\s+PAGO|PLAZO\s+DE\s+ENTREGA|ESTABLECIMIENTO|BASE\s+IMPONIBLE|SENAL|FIRMA|ESTIPULACIONES|PEDIDO\s+DE|HEMOS\s+RECIBIDO)\b/;

/**
 * Separa las líneas de la sección de retoma («Valoración VO», «Vehículo usado a entregar»…) del resto del pedido: lo que
 * figura ahí es el usado que deja el cliente, no el coche del expediente.
 */
export function separarRetoma(lineas: string[]): { principales: string[]; retoma: string[] } {
  const principales: string[] = [];
  const retoma: string[] = [];
  let dentro = 0;
  for (const l of lineas) {
    const n = sinAcentos(l).trim();
    if (dentro > 0 && !FIN_SECCION.test(n)) {
      retoma.push(l);
      dentro--;
      continue;
    }
    dentro = 0;
    // «Valoración VO: RENAULT Mégane … - Matrícula 9835DNC -0,00 €»: el dato va en la misma línea del encabezado
    if (LINEA_VALORACION_VO.test(n)) {
      retoma.push(l);
      dentro = 4;
      continue;
    }
    if (n.length <= 60 && ENCABEZADO_RETOMA.test(n) && !/[a-z]{3,}\s+[a-z]{3,}\s+[a-z]{3,}\s+[a-z]{3,}/.test(l)) {
      retoma.push(l);
      dentro = 14;
      continue;
    }
    principales.push(l);
  }
  return { principales, retoma };
}

/** Quita los bastidores (17 caracteres) de una línea: en «Matrícula 1504JPN Bastidor VF1…» la matrícula comparte línea con el bastidor. */
const sinBastidores = (l: string): string => l.replace(/(?<![A-Z0-9])[A-HJ-NP-Z0-9]{17}(?![A-Z0-9])/gi, " ");

export function parsearPedido(texto: string, catalogo: CatalogoPedido): DatosPedido {
  // Solo la primera hoja cuenta: las siguientes son las condiciones generales, que citan todas las formas de pago
  const corte = texto.search(/ESTIPULACIONES GENERALES|Queda prohibida la reproducci/i);
  const primera = corte > 0 ? texto.slice(0, corte) : texto;
  // La retoma puede estar en cualquier hoja; el resto del pedido solo se lee en la primera
  const { retoma: lineasRetoma } = separarRetoma(texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  const lineas = primera.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sinRetoma = separarRetoma(lineas).principales;
  const cabecera = sinAcentos(texto.slice(0, 1500));
  // Un pedido escaneado puede perder el rótulo «USADO»: se reconoce también por «Renew», «Uso anterior» o el régimen R.E.B.U.
  const señalesUsado = /PEDIDO\s+DE\s+VEHICULO\s+RENEW|\bUSO\s+ANTERIOR\b|REGIMEN\s+R\.?\s?E\.?\s?B\.?\s?U|VEHICULOS?\s+DE\s+OCASION|\bNUMERO\s+DE\s+STOCK\b|^KMS\b/m.test(sinAcentos(texto.slice(0, 6000)));
  const tipoPedido: DatosPedido["tipoPedido"] = /PEDIDO\s+DE\s+VEHICULO\s+NUEVO/.test(cabecera) ? "nuevo" : /PEDIDO\s+DE\s+VEHICULO\s+(?:USADO|DE\s+OCASION)/.test(cabecera) || señalesUsado ? "usado" : /^Mode[lti1]o\s*:/im.test(texto.slice(0, 4000)) && /^Tapicer[ií]a\s*:/im.test(texto.slice(0, 4000)) ? "nuevo" : /^Color\s*:/im.test(texto.slice(0, 4000)) && /^Tapicer[ií]a\s*:/im.test(texto.slice(0, 4000)) ? "nuevo" : null; // sin rótulo, la hoja con «Modelo / Color / Tapicería» es la de un coche nuevo
  const mayus = sinAcentos(sinRetoma.join("\n"));
  const avisos: string[] = [];
  const estructura = leerEstructuraRenault(lineas);

  // Bastidor y matrícula: sin direcciones de correo (su parte local puede tener 17 caracteres). En un pedido de Renault
  // de vehículo nuevo no hay ni uno ni otra: solo se aceptan si están rotulados («Bastidor», «Matrícula»).
  const sinCorreos = (t: string) => t.replace(/[^\s@]+@[^\s@]+/g, " ");
  const lineasBusqueda = estructura ? sinRetoma.filter((l) => /BASTIDOR|\bVIN\b|CHASIS|MATR[IÍ]CULA/i.test(l)) : sinRetoma.map(sinCorreos);
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

  // Un pedido de vehículo nuevo no tiene matrícula (la del usado de retoma se trata aparte)
  // En los pedidos de ocasión la «E» del distintivo ECO va pegada a la matrícula («E5919LZG»): se ignora
  const sinE = (m: string | null): string | null => (m ? m.replace(/^E(?=\d{4}[A-Z]{3}$)/, "") : m);
  const matricula = tipoPedido === "nuevo" ? null : sinE(lineasBusqueda.flatMap((l) => matriculasEnTexto(sinBastidores(l)))[0] ?? null);

  let retoma: DatosPedido["retoma"] = null;
  if (lineasRetoma.length > 0) {
    const cuerpo = lineasRetoma.map(sinCorreos);
    const vinRetoma = sinAcentos(cuerpo.join("\n")).match(/(?<![A-Z0-9])([A-HJ-NPR-Z0-9]{17})(?![A-Z0-9])/)?.[1] ?? null;
    const matriculaRetoma = sinE(cuerpo.flatMap((l) => matriculasEnTexto(sinBastidores(l)))[0] ?? null);
    const resumen = cuerpo.map((l) => l.replace(/\s{2,}-?[\d.]+,\d{2}\s*€?\s*$/, "").replace(/\s{2,}/g, " ").trim()).filter(Boolean).slice(0, 3).join(" · ").slice(0, 140) || null;
    retoma = { matricula: matriculaRetoma, vin: vinRetoma, texto: resumen };
  }

  let dni = estructura?.dni ?? null;
  // Un DNI mal leído por el OCR (cifras confundidas, la primera cifra como letra…): se corrige si con un solo cambio la letra cuadra
  if (dni && /^[A-WYZ]?\d{7,8}[A-Z]$/.test(dni) && !/^[XYZ]/.test(dni) && !validarDni(dni) && !/^[ABCDEFGHJNPQRSUVW]\d{7}[A-J]$/.test(dni)) {
    const arreglado = repararNif(dni);
    if (arreglado) {
      avisos.push(`El OCR no leyó bien el DNI («${dni}»): se ha corregido a ${arreglado}, que es el único que cuadra con su letra. Compruébalo con el pedido.`);
      dni = arreglado;
    } else avisos.push(`El DNI leído («${dni}») no es válido: su letra no cuadra con las cifras. Compruébalo con el pedido.`);
  }
  if (dni && estructura?.dniCalculado) avisos.push(`El OCR no leyó bien la letra del DNI: se ha calculado (${dni}) con sus 8 cifras. Compruébalo con el pedido.`);
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

  // Fecha del pedido: «Emitido», «Fecha de pedido…» o, si no, la de la firma («En Rivas, a Jueves, 08 Octubre 2026»)
  const fechaFirma = sinRetoma.map((l) => (/^En\s+.+,\s*a\s+/i.test(l) ? fechasEnTexto(l)[0] : undefined)).find(Boolean) ?? null;
  const fechaExpediente = estructura?.fecha ?? fechaTrasEtiqueta(sinRetoma, /FECHA\s*(DE\s*)?(PEDIDO|ORDEN|CONTRATO|EXPEDIENTE)|^FECHA\b|^EMITIDO/) ?? fechaFirma;
  const fechaEntrega = estructura ? null : fechaTrasEtiqueta(sinRetoma, /ENTREGA/);
  const fechaMatriculacion = fechaTrasEtiqueta(sinRetoma, /MATRICULACION/);

  // Modelo: el nombre de catálogo más largo que aparece en el texto (preferiblemente junto a su marca)
  const buscaEn = estructura?.modeloLinea ? sinAcentos(estructura.modeloLinea) : mayus;
  const candidatos = catalogo.modelos
    .map((m) => ({ m, puntos: puntuarModelo(m.nombre, m.marca, buscaEn) }))
    .filter((c) => c.puntos > 0)
    .sort((x, y) => y.puntos - x.puntos)
    .map((c) => c.m);
  const conMarca = candidatos.find((m) => m.marca && buscaEn.includes(sinAcentos(m.marca)));
  const idAprendido = modeloAprendido(buscaEn, catalogo.aliasModelos ?? []);
  // Solo marca y modelo: «DACIA JOGGER extreme Eco-G 120 …» es Dacia / Jogger; lo demás se ignora
  const marcasCatalogo = [...new Set([...(catalogo.marcas ?? []), ...catalogo.modelos.map((m) => m.marca).filter((m): m is string => !!m)])];
  const propuesta = estructura?.modeloLinea
    ? proponerMarcaModelo(estructura.modeloLinea, {
        marcas: marcasCatalogo.map((nombre, i) => ({ id: i + 1, nombre, modelos: catalogo.modelos.filter((m) => m.marca === nombre).map((m) => ({ id: m.id, nombre: m.nombre })) })),
      })
    : null;
  const modelo = (idAprendido !== null ? catalogo.modelos.find((m) => m.id === idAprendido) : null) ?? conMarca ?? candidatos[0] ?? (propuesta?.idModelo ? (catalogo.modelos.find((m) => m.id === propuesta.idModelo) ?? null) : null);
  if (candidatos.length > 1 && !conMarca && idAprendido === null) avisos.push("Aparecen varios modelos del catálogo en el pedido: comprueba el elegido.");
  if (estructura?.modeloLinea && !modelo) avisos.push(`La marca y el modelo del pedido («${[propuesta?.marca, propuesta?.modelo].filter(Boolean).join(" ")}») no están en tus catálogos: se propone crearlos.`);

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

  // Un pedido de Renault/Dacia sin descuento de financiación ni renting es de contado (se avisa para que se compruebe)
  if (estructura && idTipoDeVenta === null) {
    idTipoDeVenta = porCategoria("CONTADO");
    if (idTipoDeVenta !== null) avisos.push("El pedido no lleva financiación: se propone «Contado». Compruébalo.");
  }

  const hayAlgo = vin || matricula || dni || modelo || estructura;
  if (!hayAlgo) avisos.push("No se ha reconocido ningún dato útil en el documento.");
  else avisos.push("Lectura automática: comprueba cada dato antes de guardar.");
  if (retoma) avisos.push(`El pedido lleva un vehículo de retoma${retoma.matricula ? ` (${retoma.matricula})` : ""}: no se usa como matrícula del expediente.`);

  return {
    numeroPedido: estructura?.numeroPedido ?? null,
    vin,
    matricula,
    dni,
    cliente,
    telefono: estructura?.telefono ?? null,
    email: estructura?.email ?? null,
    ...partirDomicilio(estructura?.domicilio ?? null),
    vendedor: estructura?.vendedor ?? null,
    fechaExpediente,
    fechaEntrega,
    fechaMatriculacion,
    plazoEntrega: estructura?.plazo ?? null,
    idModelo: modelo?.id ?? null,
    marcaPropuesta: modelo ? (modelo.marca ?? null) : (propuesta?.marca || null),
    modeloPropuesto: modelo ? modelo.nombre : (propuesta?.modelo || null),
    modeloTexto: modelo?.nombre ?? ([propuesta?.marca, propuesta?.modelo].filter(Boolean).join(" ") || estructura?.modeloLinea) ?? null,
    idTipoDeVenta,
    tipoPedido,
    esPedido: textoDePedido(texto),
    retoma,
    avisos,
  };
}
