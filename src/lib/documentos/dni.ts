/**
 * Lectura de datos del DNI/NIE español a partir del texto reconocido por OCR.
 * - Reverso: la zona legible por máquina (MRZ, 3 líneas de 30 caracteres, norma ICAO 9303 TD1) trae el número de DNI,
 *   la fecha de nacimiento y el nombre con dígitos de control, así que es la fuente más fiable.
 * - Anverso: número, apellidos, nombre y fecha de nacimiento por etiquetas («APELLIDOS», «NOMBRE»…).
 * Todo es puro (sin dependencias) para poder probarlo.
 */

export interface DatosDni {
  dni: string | null;
  nombre: string | null;
  apellidos: string | null;
  /** AAAA-MM-DD */
  fechaNacimiento: string | null;
  sexo: "M" | "F" | null;
  caducidad: string | null;
  /** De dónde sale cada dato y qué se ha corregido o no se ha podido comprobar. */
  avisos: string[];
}

const LETRAS_DNI = "TRWAGMYFPDXBNJZSQVHLCKE";

export function letraDni(numero: number): string {
  return LETRAS_DNI[numero % 23];
}

/** DNI (8 cifras + letra) o NIE (X/Y/Z + 7 cifras + letra) con la letra de control correcta. */
export function validarDni(texto: string): boolean {
  const t = texto.toUpperCase().replace(/[\s-]/g, "");
  let m = t.match(/^(\d{8})([A-Z])$/);
  if (m) return letraDni(Number(m[1])) === m[2];
  m = t.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (m) return letraDni(Number(`${"XYZ".indexOf(m[1])}${m[2]}`)) === m[3];
  return false;
}

/** Dígito de control ICAO (pesos 7-3-1). */
export function digitoControl(campo: string): number {
  const pesos = [7, 3, 1];
  let suma = 0;
  for (let i = 0; i < campo.length; i++) {
    const c = campo[i];
    const v = c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55;
    suma += v * pesos[i % 3];
  }
  return suma % 10;
}

const A_DIGITO: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", G: "6", B: "8" };
const A_LETRA: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "5": "S", "6": "G", "8": "B" };
const soloDigitos = (s: string) => s.replace(/[A-Z]/g, (c) => A_DIGITO[c] ?? c);
const soloLetras = (s: string) => s.replace(/\d/g, (c) => A_LETRA[c] ?? c);

function titulo(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function fechaIcao(yymmdd: string, esNacimiento: boolean, hoy: Date): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  let anio = 2000 + yy;
  if (esNacimiento && anio > hoy.getUTCFullYear()) anio -= 100;
  return `${anio}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Corrige confusiones del OCR en «12345678Z» (cifras en las 8 primeras posiciones, letra al final) comprobando la letra de control. */
function repararDni(crudo: string): { dni: string; valido: boolean } {
  const limpio = crudo.replace(/</g, "").toUpperCase();
  const m = limpio.match(/^([0-9A-Z]{8})([A-Z0-9])$/);
  if (!m) return { dni: limpio, valido: false };
  const candidato = `${soloDigitos(m[1])}${soloLetras(m[2])}`;
  return { dni: candidato, valido: validarDni(candidato) };
}

/** Líneas del OCR reducidas al alfabeto de la zona legible (A-Z, 0-9 y «<»). */
function lineasLimpias(texto: string): string[] {
  return texto
    .toUpperCase()
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, "").replace(/[«‹›»]/g, "<").replace(/[^A-Z0-9<]/g, "<"))
    .filter((l) => l.length >= 16);
}

/**
 * Localiza las tres líneas de la MRZ por su contenido (no por su posición), porque el OCR suele añadir o quitar algún
 * carácter: la primera lleva «IDESP», la segunda termina en «ESP» tras las dos fechas y la tercera lleva «<<».
 */
export function lineasMrz(texto: string): string[] | null {
  const ls = lineasLimpias(texto);
  const i1 = ls.findIndex((l) => /(ID|1D|I0)ESP/.test(l));
  if (i1 < 0) return null;
  const p1 = ls[i1].search(/(ID|1D|I0)ESP/);
  const l1 = `ID${ls[i1].slice(p1 + 2)}`;
  // Segunda línea: acaba en ESP y lleva delante 15 caracteres (nacimiento, sexo, caducidad)
  let l2 = "";
  let i2 = -1;
  for (let i = i1 + 1; i < Math.min(ls.length, i1 + 3); i++) {
    const e = ls[i].search(/ESP/);
    if (e >= 14) {
      l2 = ls[i].slice(e - 15);
      i2 = i;
      break;
    }
  }
  if (i2 < 0) return null;
  const l3 = ls.slice(i2 + 1).find((l) => /[A-Z]{3,}/.test(l)) ?? "";
  return [l1, l2, l3];
}

/** Datos del reverso (MRZ). Devuelve null si no hay zona legible. */
export function parsearMrz(texto: string, hoy: Date = new Date()): DatosDni | null {
  const l = lineasMrz(texto);
  if (!l) return null;
  const avisos: string[] = [];
  const [l1, l2, l3] = l;

  // DNI: nueve caracteres al final de la primera línea (tras el número de soporte y su dígito de control)
  let dni: string | null = null;
  const m = l1.slice(15).match(/([0-9A-Z]{8}[A-Z0-9])<*$/) ?? l1.slice(5).match(/([0-9OIlSBZQD]{8}[A-Z0-9])<*$/);
  if (m) {
    const rep = repararDni(m[1]);
    if (/^\d{8}[A-Z]$|^[XYZ]\d{7}[A-Z]$/.test(rep.dni)) {
      dni = rep.dni;
      if (!rep.valido) avisos.push("La letra del DNI no coincide con el número: revísalo.");
    }
  }

  const nacimientoTxt = soloDigitos(l2.slice(0, 6));
  if (digitoControl(nacimientoTxt) !== Number(soloDigitos(l2[6] ?? "x"))) avisos.push("La fecha de nacimiento no supera la comprobación de la zona legible: revísala.");
  const caducidadTxt = soloDigitos(l2.slice(8, 14));
  const sexo = l2[7] === "M" || l2[7] === "F" ? l2[7] : null;

  const partes = l3.split("<<").filter(Boolean);
  const apellidos = partes[0] ? titulo(soloLetras(partes[0]).replace(/</g, " ")) : null;
  const nombre = partes[1] ? titulo(soloLetras(partes.slice(1).join(" ")).replace(/</g, " ")) : null;
  if (apellidos || nombre) avisos.push("El nombre se lee de la zona legible, que no lleva tildes ni «ñ»: revísalo.");

  return { dni, nombre, apellidos, fechaNacimiento: fechaIcao(nacimientoTxt, true, hoy), sexo: sexo as DatosDni["sexo"], caducidad: fechaIcao(caducidadTxt, false, hoy), avisos };
}

/** Letras que el OCR suele confundir con la letra de control real. */
const PARECIDAS: Record<string, string> = { Z: "27", S: "5", O: "0Q", B: "8", I: "1L", G: "6", D: "0", Q: "0O", L: "1", T: "17", A: "4", E: "3", R: "2", K: "X" };

/**
 * Busca un DNI/NIE en un texto. Acepta la letra exacta y, si el OCR la ha confundido con un carácter parecido
 * (7 por Z, 5 por S…), la corrige a partir del número (que sí se mantiene tal cual).
 */
export function buscarDniEnTexto(texto: string): { dni: string; corregido: boolean } | null {
  for (const m of texto.toUpperCase().matchAll(/(?<![A-Z0-9])([XYZ]?\d{7,8})[\s-]?([A-Z0-9])(?![A-Z0-9])/g)) {
    const numero = m[1];
    if (numero.length !== 8) continue;
    const base = /^[XYZ]/.test(numero) ? Number(`${"XYZ".indexOf(numero[0])}${numero.slice(1)}`) : Number(numero);
    const esperada = letraDni(base);
    if (m[2] === esperada) return { dni: `${numero}${esperada}`, corregido: false };
    if ((PARECIDAS[esperada] ?? "").includes(m[2])) return { dni: `${numero}${esperada}`, corregido: true };
  }
  return null;
}

/** Datos del anverso por etiquetas y patrones. */
export function parsearAnverso(texto: string): DatosDni | null {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const avisos: string[] = [];
  const hallado = buscarDniEnTexto(texto);
  const dni = hallado?.dni ?? null;
  if (hallado?.corregido) avisos.push("La letra del DNI se ha corregido a partir del número: compruébala.");
  const tras = (etiqueta: RegExp): string | null => {
    const i = lineas.findIndex((l) => etiqueta.test(l));
    if (i < 0) return null;
    // La etiqueta puede llevar el valor en la misma línea (tras «:») o en la siguiente
    const mismo = lineas[i].split(/[:/]/).pop() ?? "";
    const esEtiqueta = /^(NAME|NOM|NOMBRE|SURNAME|APELLIDOS|FIRST NAME)$/i.test(mismo.trim());
    const candidato = /^[A-ZÁÉÍÓÚÜÑ' -]{3,}$/i.test(mismo.trim()) && !esEtiqueta && !etiqueta.test(mismo) ? mismo : lineas[i + 1];
    return candidato && /^[A-ZÁÉÍÓÚÜÑ' -]{2,}$/i.test(candidato.trim()) ? candidato.trim() : null;
  };
  const apellidosBruto = tras(/APELLIDOS|SURNAME/i);
  const nombreBruto = tras(/^(NOMBRE|NAME|NOM)\b|\/\s*(NAME|NOM)\s*$/i);
  let fecha: string | null = null;
  const f = texto.match(/(\d{2})[\s./-](\d{2})[\s./-](\d{4})/);
  if (f && Number(f[2]) >= 1 && Number(f[2]) <= 12) fecha = `${f[3]}-${f[2]}-${f[1]}`;

  if (!dni && !apellidosBruto && !nombreBruto) return null;
  if (!dni) avisos.push("No se ha podido leer un número de DNI con letra válida.");
  if (fecha) avisos.push("La fecha del anverso es la primera que aparece: comprueba que es la de nacimiento.");
  return { dni, nombre: nombreBruto ? titulo(nombreBruto) : null, apellidos: apellidosBruto ? titulo(apellidosBruto) : null, fechaNacimiento: fecha, sexo: null, caducidad: null, avisos };
}

/** Une lo leído del reverso (más fiable en número y fecha) y del anverso (con tildes en el nombre). */
export function combinarDni(...fuentes: (DatosDni | null)[]): DatosDni {
  const validas = fuentes.filter((f): f is DatosDni => f !== null);
  const mrz = validas.find((f) => f.sexo !== null || f.caducidad !== null);
  const anverso = validas.find((f) => f !== mrz);
  const dniValido = (d: DatosDni | undefined) => (d?.dni && validarDni(d.dni) ? d.dni : null);
  const dni = dniValido(mrz) ?? dniValido(anverso) ?? mrz?.dni ?? anverso?.dni ?? null;
  return {
    dni,
    nombre: anverso?.nombre ?? mrz?.nombre ?? null,
    apellidos: anverso?.apellidos ?? mrz?.apellidos ?? null,
    fechaNacimiento: mrz?.fechaNacimiento ?? anverso?.fechaNacimiento ?? null,
    sexo: mrz?.sexo ?? null,
    caducidad: mrz?.caducidad ?? null,
    avisos: [...new Set(validas.flatMap((f) => f.avisos))],
  };
}

/** «Juan Antonio García López» (nombre + apellidos) para el campo único «nombre» del cliente. */
export function nombreCompleto(d: Pick<DatosDni, "nombre" | "apellidos">): string | null {
  const t = [d.nombre, d.apellidos].filter(Boolean).join(" ").trim();
  return t || null;
}

/* ------------------------------------------------------------------ */
/* Anverso leído por región (varias versiones de la imagen)             */
/* ------------------------------------------------------------------ */

const PALABRAS_ETIQUETA = new Set(
  [
    "ESPANA", "DOCUMENTO", "NACIONAL", "IDENTIDAD", "NATIONAL", "IDENTITY", "CARD", "REINO", "SOPORTE", "NUM", "EMISION", "VALIDEZ", "NACIONALIDAD",
    "NACIMIENTO", "SEXO", "APELLIDOS", "NOMBRE", "DNI", "ESP", "SURNAME", "NAME", "SEX", "DATE", "BIRTH", "NATIONALITY", "VALID", "UNTIL", "SUPPORT", "DE", "DEL", "LA", "EL",
  ].map((x) => x),
);

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

const CONECTORES = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "VAN", "VON"]);

/**
 * Líneas de texto «de nombre»: se aprovecha el principio de cada línea que sean palabras en mayúsculas (con tildes y
 * ñ) y se descarta la basura que el OCR pega detrás («SANTANA LO ”» → «SANTANA»). Sin palabras de etiqueta.
 */
function candidatosNombre(texto: string): string[] {
  const res: string[] = [];
  for (const crudo of texto.split(/\r?\n/)) {
    const palabras: string[] = [];
    for (const p of crudo.trim().split(/\s+/)) {
      if (!/^[A-ZÁÉÍÓÚÜÑ'-]+$/.test(p)) break;
      palabras.push(p);
    }
    // Quita por detrás las palabras sueltas de 1-2 letras que no sean conectores («LO», «N»)
    while (palabras.length > 0) {
      const u = palabras[palabras.length - 1];
      if (u.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, "").length < 3) palabras.pop();
      else break;
    }
    if (palabras.length === 0 || palabras.length > 4) continue;
    const l = palabras.join(" ");
    const limpias = sinTildes(l).replace(/[^A-Z ]/g, "").split(" ").filter(Boolean);
    if (limpias.length === 0 || limpias.some((w) => PALABRAS_ETIQUETA.has(w) && !CONECTORES.has(w))) continue;
    if (limpias.length === 1 && limpias[0].length < 3) continue;
    res.push(l);
  }
  return res;
}

/** Fechas dd mm aaaa de un texto, como AAAA-MM-DD. */
function fechasEnTexto(texto: string): string[] {
  const res: string[] = [];
  for (const m of texto.matchAll(/(?<!\d)(\d{2})\s*[ ./-]\s*(\d{2})\s*[ ./-]\s*((?:19|20)\d{2})(?!\d)/g)) {
    const mm = Number(m[2]);
    const dd = Number(m[1]);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) res.push(`${m[3]}-${m[2]}-${m[1]}`);
  }
  return res;
}

/**
 * Datos del anverso a partir del texto de la zona de campos (a la derecha de la foto) leído con varias versiones de
 * la imagen. Los nombres que salen en al menos dos versiones se consideran fiables (el ruido cambia de una a otra);
 * el primero(s) son los apellidos y el último el nombre. El DNI y la fecha de nacimiento (la más antigua) se buscan en
 * todos los textos, incluido `textosGenerales` (la tarjeta entera).
 */
export function parsearFrente(textosCampos: string[], textosGenerales: string[] = []): DatosDni | null {
  const todos = [...textosCampos, ...textosGenerales].join("\n");
  const avisos: string[] = [];
  const hallado = buscarDniEnTexto(todos);
  const fechas = fechasEnTexto(todos).sort();
  const nacimiento = fechas[0] ?? null;

  const porTexto = textosCampos.map(candidatosNombre);
  // Voto por palabras: una palabra es fiable si sale en al menos dos versiones (el ruido cambia de una a otra)
  const clave = (w: string) => sinTildes(w).toUpperCase();
  const conteo = new Map<string, number>();
  for (const lista of porTexto) for (const w of new Set(lista.flatMap((l) => l.split(" ").map(clave)))) conteo.set(w, (conteo.get(w) ?? 0) + 1);
  const minimo = textosCampos.length >= 2 ? 2 : 1;
  // La versión con más líneas fiables, conservando el orden y las repeticiones («GAYARRE», «GAYARRE»)
  let mejor: string[] = [];
  for (const lista of porTexto) {
    const filtrada = lista
      .map((l) =>
        l
          .split(" ")
          .filter((w) => (conteo.get(clave(w)) ?? 0) >= minimo)
          .join(" "),
      )
      .filter(Boolean);
    if (filtrada.length > mejor.length) mejor = filtrada;
  }
  let apellidos: string | null = null;
  let nombre: string | null = null;
  if (mejor.length >= 3) {
    apellidos = titulo(mejor.slice(0, mejor.length - 1).slice(0, 2).join(" "));
    nombre = titulo(mejor[mejor.length - 1]);
  } else if (mejor.length === 2) {
    apellidos = titulo(mejor[0]);
    nombre = titulo(mejor[1]);
  } else if (mejor.length === 1) {
    apellidos = titulo(mejor[0]);
  }
  if (!hallado && !apellidos && !nombre && !nacimiento) return null;
  if (hallado?.corregido) avisos.push("La letra del DNI se ha corregido a partir del número: compruébala.");
  if (!hallado) avisos.push("No se ha podido leer un número de DNI con letra válida.");
  if (apellidos || nombre) avisos.push("Nombre y apellidos leídos de la imagen: compruébalos.");
  return { dni: hallado?.dni ?? null, nombre, apellidos, fechaNacimiento: nacimiento, sexo: null, caducidad: null, avisos };
}
