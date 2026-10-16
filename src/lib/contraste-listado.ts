import * as XLSX from "xlsx";
import { limpiarMatricula, parseFechaFlexible } from "@/lib/fechas-import";

/** Una venta del listado del fabricante (Excel), ya normalizada. */
export interface FilaListado {
  fila: number;
  numero: string;
  cliente: string;
  nif: string;
  estado: string;
  /** Venta de vehículo usado (columna «Tipo» = VO). */
  usado: boolean;
  marca: string;
  modelo: string;
  bastidor: string;
  matricula: string;
  f_creado: string | null;
  f_afect: string | null;
  f_mat: string | null;
  f_entrega: string | null;
}

/** Datos mínimos de un expediente de la app para poder compararlo. */
export interface ExpedienteApp {
  id_expediente: number;
  cliente: string;
  nif: string;
  marca: string;
  modelo: string;
  bastidor: string;
  matricula: string;
  f_expediente: string | null;
  f_afectacion: string | null;
  f_matriculacion: string | null;
  f_entrega: string | null;
}

export type CampoContraste = "Cliente" | "NIF" | "Marca" | "Modelo" | "Matrícula" | "Fecha expediente" | "Fecha afectación" | "Fecha matriculación" | "Fecha entrega";

export interface Diferencia {
  campo: CampoContraste;
  excel: string;
  app: string;
}

export interface ResultadoContraste {
  totales: { filasExcel: number; anuladas: number; expedientesApp: number };
  coinciden: { fila: FilaListado; id_expediente: number }[];
  difieren: { fila: FilaListado; id_expediente: number; diferencias: Diferencia[] }[];
  soloExcel: FilaListado[];
  soloApp: ExpedienteApp[];
  duplicadosExcel: { clave: string; filas: FilaListado[] }[];
  duplicadosApp: { clave: string; expedientes: ExpedienteApp[] }[];
  /** Rango de fechas del listado que se ha usado para decidir qué expedientes de la app «faltan» en el Excel. */
  rango: { desde: string; hasta: string } | null;
}

/* ------------------------------------------------------------------ */
/* Lectura del Excel                                                   */
/* ------------------------------------------------------------------ */

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const texto = (v: unknown) => String(v ?? "").trim();

/** Lee el primer libro del listado. Lanza `Error` con el texto que verá el usuario. */
export function leerListadoVentas(datos: ArrayBuffer): FilaListado[] {
  const libro = XLSX.read(new Uint8Array(datos), { type: "array", cellDates: true });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "" });
  if (filas.length === 0) throw new Error("El archivo Excel está vacío.");

  const claves = Object.keys(filas[0]);
  const clave = (...nombres: string[]) => {
    const buscados = nombres.map(normalizar);
    return claves.find((k) => buscados.includes(normalizar(k))) ?? "";
  };
  const kCliente = clave("Cliente");
  const kBastidor = clave("Bastidor");
  if (!kCliente || !kBastidor) throw new Error("El listado debe tener, al menos, las columnas «Cliente» y «Bastidor».");
  const k = {
    numero: clave("#"),
    nif: clave("NIF"),
    estado: clave("Estado"),
    tipo: clave("Tipo"),
    marca: clave("Marca"),
    modelo: clave("Modelo"),
    matricula: clave("Matrícula"),
    creado: clave("F. Creado"),
    afect: clave("F. Afect"),
    mat: clave("Fecha matriculación"),
    entrega: clave("Entrega fijada"),
  };
  const celda = (f: Record<string, unknown>, c: string) => (c ? texto(f[c]) : "");
  const fecha = (f: Record<string, unknown>, c: string) => (c ? parseFechaFlexible(f[c]) : null);

  return filas
    .map((f, i) => ({
      fila: i + 2,
      numero: celda(f, k.numero),
      cliente: celda(f, kCliente),
      nif: celda(f, k.nif),
      estado: celda(f, k.estado),
      usado: normalizar(celda(f, k.tipo)).startsWith("vo"),
      marca: celda(f, k.marca),
      modelo: celda(f, k.modelo),
      bastidor: celda(f, kBastidor),
      matricula: limpiarMatricula(celda(f, k.matricula)),
      f_creado: fecha(f, k.creado),
      f_afect: fecha(f, k.afect),
      f_mat: fecha(f, k.mat),
      f_entrega: fecha(f, k.entrega),
    }))
    .filter((f) => f.cliente !== "" || f.bastidor !== "");
}

/* ------------------------------------------------------------------ */
/* Comparación (función pura)                                          */
/* ------------------------------------------------------------------ */

const claveVin = (v: string) => v.replace(/\s+/g, "").toUpperCase();
const claveMatricula = (m: string) => m.replace(/[\s-]+/g, "").toUpperCase();
const claveNif = (n: string) => n.replace(/[\s.-]+/g, "").toUpperCase();

function agrupar<T>(items: T[], clave: (t: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const it of items) {
    const c = clave(it);
    if (!c) continue;
    const l = mapa.get(c);
    if (l) l.push(it);
    else mapa.set(c, [it]);
  }
  return mapa;
}

/** Los nombres de modelo del fabricante y los del catálogo se escriben distinto («CLIO (CL6)» / «Clio»): basta con que uno empiece por el otro. */
function mismoModelo(a: string, b: string): boolean {
  const x = normalizar(a);
  const y = normalizar(b);
  return x === y || x.startsWith(y) || y.startsWith(x);
}

function diferenciasEntre(f: FilaListado, e: ExpedienteApp): Diferencia[] {
  const d: Diferencia[] = [];
  const texto = (campo: CampoContraste, excel: string, app: string, igual: (a: string, b: string) => boolean = (a, b) => normalizar(a) === normalizar(b)) => {
    if (excel && !igual(excel, app)) d.push({ campo, excel, app });
  };
  texto("Cliente", f.cliente, e.cliente);
  texto("NIF", f.nif, e.nif, (a, b) => claveNif(a) === claveNif(b));
  texto("Marca", f.marca, e.marca);
  texto("Modelo", f.modelo, e.modelo, mismoModelo);
  texto("Matrícula", f.matricula, e.matricula, (a, b) => claveMatricula(a) === claveMatricula(b));
  const fecha = (campo: CampoContraste, excel: string | null, app: string | null) => {
    if (excel && excel !== app) d.push({ campo, excel, app: app ?? "" });
  };
  fecha("Fecha expediente", f.f_creado, e.f_expediente);
  fecha("Fecha afectación", f.f_afect, e.f_afectacion);
  // En un usado la «matriculación» del listado es la primera del coche (p. ej. 2017), no la de la venta: no se compara.
  if (!f.usado) fecha("Fecha matriculación", f.f_mat, e.f_matriculacion);
  fecha("Fecha entrega", f.f_entrega, e.f_entrega);
  return d;
}

/**
 * Contrasta el listado con los expedientes de la app, sin modificar nada.
 * Se empareja por bastidor; las ventas todavía sin bastidor se emparejan, si no hay duda, por NIF (o nombre)
 * con un expediente de la app que tampoco lo tenga. Las filas «Anulado» no son ventas y solo se cuentan.
 */
export function contrastarListado(filas: FilaListado[], app: ExpedienteApp[]): ResultadoContraste {
  const anuladas = filas.filter((f) => normalizar(f.estado) === "anulado");
  const ventas = filas.filter((f) => normalizar(f.estado) !== "anulado");

  const porVin = agrupar(app, (e) => claveVin(e.bastidor));
  const duplicadosApp = [...porVin.entries()].filter(([, l]) => l.length > 1).map(([c, expedientes]) => ({ clave: c, expedientes }));
  const duplicadosExcel = [...agrupar(ventas, (f) => claveVin(f.bastidor)).entries()]
    .filter(([, l]) => l.length > 1)
    .map(([c, filasDup]) => ({ clave: c, filas: filasDup }));

  const usados = new Set<number>();
  const pares: { fila: FilaListado; exp: ExpedienteApp }[] = [];
  const soloExcel: FilaListado[] = [];

  const sinBastidor: FilaListado[] = [];
  for (const f of ventas) {
    const vin = claveVin(f.bastidor);
    if (!vin) {
      sinBastidor.push(f);
      continue;
    }
    const candidato = (porVin.get(vin) ?? []).find((e) => !usados.has(e.id_expediente));
    if (candidato) {
      usados.add(candidato.id_expediente);
      pares.push({ fila: f, exp: candidato });
    } else soloExcel.push(f);
  }

  // Ventas aún sin bastidor: se casan solo si hay un único expediente de la app sin bastidor con el mismo NIF o nombre.
  const libresSinVin = app.filter((e) => !usados.has(e.id_expediente) && !claveVin(e.bastidor));
  for (const f of sinBastidor) {
    const nif = claveNif(f.nif);
    const nombre = normalizar(f.cliente);
    const posibles = libresSinVin.filter(
      (e) => !usados.has(e.id_expediente) && ((nif && claveNif(e.nif) === nif) || (nombre && normalizar(e.cliente) === nombre)),
    );
    if (posibles.length === 1) {
      usados.add(posibles[0].id_expediente);
      pares.push({ fila: f, exp: posibles[0] });
    } else soloExcel.push(f);
  }

  const coinciden: ResultadoContraste["coinciden"] = [];
  const difieren: ResultadoContraste["difieren"] = [];
  for (const { fila, exp } of pares) {
    const diferencias = diferenciasEntre(fila, exp);
    if (diferencias.length === 0) coinciden.push({ fila, id_expediente: exp.id_expediente });
    else difieren.push({ fila, id_expediente: exp.id_expediente, diferencias });
  }

  // Los expedientes de la app que «faltan» en el Excel solo cuentan dentro del periodo que cubre el listado.
  const fechas = filas.map((f) => f.f_creado).filter((x): x is string => !!x).sort();
  const rango = fechas.length > 0 ? { desde: fechas[0], hasta: fechas[fechas.length - 1] } : null;
  const dentro = (e: ExpedienteApp) => !rango || !e.f_expediente || (e.f_expediente >= rango.desde && e.f_expediente <= rango.hasta);
  const soloApp = app.filter((e) => !usados.has(e.id_expediente) && dentro(e));

  const porFila = (a: FilaListado, b: FilaListado) => a.fila - b.fila;
  return {
    totales: { filasExcel: filas.length, anuladas: anuladas.length, expedientesApp: app.length },
    coinciden: coinciden.sort((a, b) => porFila(a.fila, b.fila)),
    difieren: difieren.sort((a, b) => porFila(a.fila, b.fila)),
    soloExcel: soloExcel.sort(porFila),
    soloApp,
    duplicadosExcel,
    duplicadosApp,
    rango,
  };
}
