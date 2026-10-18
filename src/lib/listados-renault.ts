import * as XLSX from "xlsx";
import { limpiarTelefono, parseFechaFlexible } from "@/lib/fechas-import";

/**
 * Lectura inteligente de los listados que se descargan del sistema del fabricante (Expedientes, Llamadas de calidad…, en Excel o
 * CSV). Reconoce las columnas por su nombre aunque cambie el orden o sobren columnas, y no crea nada: solo sirve para completar
 * o corregir datos de expedientes que ya existen.
 */

export interface FilaListadoRenault {
  /** Número de fila del archivo (empieza en 2: la 1 es la cabecera). */
  fila: number;
  cliente: string;
  nif: string;
  codigoPostal: string;
  estado: string;
  /** «VO», «VN» o vacío, según la columna Tipo del listado. */
  tipo: string;
  marca: string;
  modelo: string;
  bastidor: string;
  matricula: string;
  /** Fecha que va entre paréntesis en la matrícula («3020NTH(15-10-2026)»): la de matriculación. */
  fechaDeMatricula: string | null;
  fCreado: string | null;
  fAfectacion: string | null;
  fMatriculacion: string | null;
  fEntrega: string | null;
  fFactura: string | null;
  email: string;
  telefono: string;
}

export type TipoListado = "expedientes" | "llamadas_calidad" | "desconocido";

export interface ListadoLeido {
  tipo: TipoListado;
  nombre: string;
  filas: FilaListadoRenault[];
  /** Columnas del archivo que se han reconocido y se usan, para enseñárselo a la persona. */
  columnasUsadas: string[];
  /** Columnas que no se han reconocido (se ignoran). */
  columnasIgnoradas: string[];
}

const sinAcentos = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Nombres con los que puede venir cada dato; se prefiere el nombre exacto antes que el que lo contiene. */
const SINONIMOS: Record<string, string[]> = {
  cliente: ["cliente", "nombre cliente", "titular"],
  nif: ["nif", "dni", "nie", "nif/nie", "dni/nie"],
  codigoPostal: ["codigo postal", "cp", "c.p."],
  estado: ["estado"],
  tipo: ["tipo", "vn/vo"],
  marca: ["marca"],
  modelo: ["modelo"],
  bastidor: ["bastidor", "vin", "chasis", "n. bastidor"],
  matricula: ["matricula", "patente"],
  fCreado: ["f. creado", "fecha creado", "fecha creacion", "creado"],
  fAfectacion: ["f. afect", "f. afectacion", "fecha afectacion", "afectacion"],
  fMatriculacion: ["fecha matriculacion", "f. matriculacion", "f. mat", "fecha de matriculacion"],
  fEntrega: ["entrega fijada", "fecha entrega", "f. entrega", "fecha de entrega"],
  fFactura: ["fecha factura", "f. factura", "fecha de factura", "fecha facturacion"],
  email: ["email cliente", "email", "correo cliente", "correo", "e-mail"],
  telefono: ["telefono", "movil", "tfno", "tel."],
};

/** Columnas que contienen el nombre de otra y no son la que se busca (p. ej. «Fecha mínima matriculación»). */
const EXCLUIR: Record<string, string[]> = { fMatriculacion: ["minima"], fEntrega: ["prueba"], estado: ["estimated"], tipo: ["venta", "destino"], telefono: [] };

function buscarColumna(cabeceras: { original: string; norm: string }[], dato: string): string | null {
  const nombres = SINONIMOS[dato];
  const excluidas = EXCLUIR[dato] ?? [];
  const valida = (c: { norm: string }) => !excluidas.some((x) => c.norm.includes(x));
  // Se respeta el orden de preferencia de los nombres (p. ej. «Tipo» antes que «VN/VO»)
  for (const nombre of nombres) {
    const exacta = cabeceras.find((c) => c.norm === nombre && valida(c));
    if (exacta) return exacta.original;
  }
  const parecida = cabeceras.find((c) => valida(c) && nombres.some((n) => n.length >= 5 && c.norm.includes(n)));
  return parecida?.original ?? null;
}

/** «3020NTH(15-10-2026)» → matrícula y fecha. */
export function separarMatricula(valor: unknown): { matricula: string; fecha: string | null } {
  const t = String(valor ?? "").trim();
  const m = t.match(/^([^(]*)\(\s*([^)]*)\)?\s*$/);
  if (!m) return { matricula: t.replace(/\s+/g, "").toUpperCase(), fecha: null };
  return { matricula: m[1].replace(/\s+/g, "").toUpperCase(), fecha: parseFechaFlexible(m[2]) };
}

const texto = (fila: Record<string, unknown>, columna: string | null): string => (columna ? String(fila[columna] ?? "").trim() : "");

/** Convierte el contenido de un Excel o CSV (como `ArrayBuffer`) en un listado reconocido. Lanza un `Error` con un texto claro. */
export function leerListadoRenault(datos: ArrayBuffer, nombre: string): ListadoLeido {
  const bytes = new Uint8Array(datos);
  const esCsv = /\.(csv|txt)$/i.test(nombre);
  // El CSV se lee como texto UTF-8 (con o sin BOM) para no estropear tildes ni eñes
  const libro = esCsv ? XLSX.read(new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, ""), { type: "string", raw: true }) : XLSX.read(bytes, { type: "array", cellDates: false });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "", raw: false, dateNF: "dd/mm/yyyy" });
  if (filas.length === 0) throw new Error(`«${nombre}» está vacío.`);
  const cabeceras = Object.keys(filas[0]).map((original) => ({ original, norm: sinAcentos(original) }));

  const col = Object.fromEntries(Object.keys(SINONIMOS).map((d) => [d, buscarColumna(cabeceras, d)])) as Record<string, string | null>;
  const usadas = new Set(Object.values(col).filter((c): c is string => c !== null));
  const llamadas = cabeceras.some((c) => c.norm.includes("fecha encuesta") || c.norm.includes("llamada"));
  const tipo: TipoListado = llamadas ? "llamadas_calidad" : col.matricula && (col.fAfectacion || col.fCreado) ? "expedientes" : "desconocido";
  if (!col.bastidor && !col.matricula && !col.nif && !col.cliente) throw new Error(`No he reconocido ninguna columna útil en «${nombre}» (busco Cliente, NIF, Bastidor, Matrícula…).`);

  const resultado: FilaListadoRenault[] = filas.map((f, i) => {
    const { matricula, fecha } = separarMatricula(f[col.matricula ?? ""]);
    return {
      fila: i + 2,
      cliente: texto(f, col.cliente),
      nif: texto(f, col.nif).replace(/\s+/g, "").toUpperCase(),
      codigoPostal: texto(f, col.codigoPostal).replace(/\.0$/, ""),
      estado: texto(f, col.estado),
      tipo: texto(f, col.tipo).toUpperCase(),
      marca: texto(f, col.marca),
      modelo: texto(f, col.modelo),
      bastidor: texto(f, col.bastidor).replace(/\s+/g, "").toUpperCase(),
      matricula,
      fechaDeMatricula: fecha,
      fCreado: col.fCreado ? parseFechaFlexible(f[col.fCreado]) : null,
      fAfectacion: col.fAfectacion ? parseFechaFlexible(f[col.fAfectacion]) : null,
      fMatriculacion: col.fMatriculacion ? parseFechaFlexible(f[col.fMatriculacion]) : null,
      fEntrega: col.fEntrega ? parseFechaFlexible(f[col.fEntrega]) : null,
      fFactura: col.fFactura ? parseFechaFlexible(f[col.fFactura]) : null,
      email: texto(f, col.email).toLowerCase(),
      telefono: col.telefono ? limpiarTelefono(f[col.telefono]) : "",
    };
  });
  // Filas sin nada con lo que identificar un expediente
  const validas = resultado.filter((f) => f.bastidor || f.matricula || f.nif || f.cliente);
  if (validas.length === 0) throw new Error(`«${nombre}» no tiene filas con datos que se puedan reconocer.`);
  return { tipo, nombre, filas: validas, columnasUsadas: [...usadas], columnasIgnoradas: cabeceras.map((c) => c.original).filter((c) => !usadas.has(c) && c.trim() !== "") };
}
