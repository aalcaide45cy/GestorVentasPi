import * as XLSX from "xlsx";
import { limpiarTelefono, parseFechaFlexible } from "@/lib/fechas-import";

/** Fila del Excel ya normalizada, lista para verificar contra los expedientes existentes. */
export interface FilaExcel {
  rowIdx: number;
  cliente: string;
  nif: string;
  bastidor: string;
  matricula: string;
  f_afect: string | null;
  f_mat: string | null;
  email: string;
  f_exp: string | null;
  telefono: string;
  f_entrega: string | null;
}

/** Lee el primer libro del Excel y devuelve sus filas. Lanza `Error` con el texto que ve el usuario. */
export function leerExcelExpedientes(datos: ArrayBuffer): FilaExcel[] {
  const libro = XLSX.read(new Uint8Array(datos), { type: "array" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "" });
  if (filas.length === 0) throw new Error("El archivo Excel está vacío.");

  const claves = Object.keys(filas[0]);
  const clave = (nombres: string[]) =>
    claves.find((k) =>
      nombres.some((n) => {
        const a = k.toLowerCase().trim();
        const b = n.toLowerCase().trim();
        return a === b || a.includes(b);
      }),
    ) ?? "";

  const kCliente = clave(["cliente"]);
  const kNif = clave(["nif", "dni", "n.i.f"]);
  const kBastidor = clave(["bastidor", "vin", "chasis"]);
  const kMatricula = clave(["matrícula", "matricula", "patente"]);
  const kAfect = clave(["f. afect", "fecha afectacion", "fecha_afectacion", "afectación"]);
  const kMat = clave(["fecha matriculacion", "fecha matriculación", "f. mat", "fecha_matriculacion"]);
  const kEmail = clave(["email cliente", "email_cliente", "correo cliente", "correo"]);
  const kCreado = clave(["f. creado", "fecha creado", "f_creado", "creado", "f. exp", "fecha expediente"]);
  const kTelefono = clave(["teléfono", "telefono", "móvil", "movil", "tfno", "phone", "telf"]);
  const kEntrega = clave(["entrega fijada", "f. entrega", "fecha entrega", "entrega_fijada", "fecha de entrega"]);

  if (!kCliente) throw new Error("No se encontró la columna 'Cliente' en el archivo Excel.");

  const texto = (fila: Record<string, unknown>, k: string) => (k ? String(fila[k] ?? "").trim() : "");

  const resultado = filas
    .map((fila, rowIdx) => ({
      rowIdx,
      cliente: texto(fila, kCliente),
      nif: texto(fila, kNif),
      bastidor: texto(fila, kBastidor),
      matricula: texto(fila, kMatricula),
      f_afect: kAfect ? parseFechaFlexible(fila[kAfect]) : null,
      f_mat: kMat ? parseFechaFlexible(fila[kMat]) : null,
      email: texto(fila, kEmail),
      f_exp: kCreado ? parseFechaFlexible(fila[kCreado]) : null,
      telefono: kTelefono ? limpiarTelefono(fila[kTelefono]) : "",
      f_entrega: kEntrega ? parseFechaFlexible(fila[kEntrega]) : null,
    }))
    .filter((f) => f.cliente !== "");

  if (resultado.length === 0) throw new Error("No se encontraron registros de clientes válidos en el archivo Excel.");
  return resultado;
}
