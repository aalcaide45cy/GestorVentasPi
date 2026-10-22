import type { CSSProperties } from "react";
import type { ConfigColumnas } from "@/components/expedientes/PanelColumnas";
import type { ExpedienteDto } from "@/lib/dto";
import type { FilaExcel } from "@/lib/excel-expedientes";
import { FONDO_FECHA_A, FONDO_FECHA_B } from "./comun";

/**
 * Definiciones de la lista de expedientes (columnas, anchos, ayudas, vistas incluidas y pequeños ayudantes), separadas del componente
 * `ExpedientesList` para que este quede solo con la lógica de la pantalla.
 */

export interface ActualizacionExcel {
  rowIdx: number;
  id_cliente: number;
  id_expediente: number;
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

export type Columna =
  | "cliente"
  | "telefono"
  | "email"
  | "clase"
  | "punto"
  | "marca"
  | "modelo"
  | "marca_modelo"
  | "tipo_venta"
  | "estado"
  | "vendedor"
  | "fecha_expediente"
  | "fecha_afectacion"
  | "fecha_rci"
  | "fecha_matriculacion"
  | "fecha_facturacion"
  | "fecha_entrega"
  | "estado_intranet"
  | "cobro";

export const COLUMNAS: { clave: Columna; etiqueta: string }[] = [
  { clave: "cliente", etiqueta: "Cliente" },
  { clave: "telefono", etiqueta: "Teléfono" },
  { clave: "email", etiqueta: "Email" },
  { clave: "clase", etiqueta: "VN / VO" },
  { clave: "punto", etiqueta: "Punto de color de la marca" },
  { clave: "marca", etiqueta: "Marca" },
  { clave: "modelo", etiqueta: "Modelo" },
  { clave: "marca_modelo", etiqueta: "Marca y modelo" },
  { clave: "tipo_venta", etiqueta: "T. Venta" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "vendedor", etiqueta: "Vendedor" },
  { clave: "fecha_expediente", etiqueta: "F. Exp." },
  { clave: "fecha_afectacion", etiqueta: "F. Afect" },
  { clave: "fecha_rci", etiqueta: "F. RCI" },
  { clave: "fecha_matriculacion", etiqueta: "F. Mat" },
  { clave: "fecha_facturacion", etiqueta: "F. FAC." },
  { clave: "fecha_entrega", etiqueta: "F. Entrega" },
  { clave: "estado_intranet", etiqueta: "Estado intranet" },
  { clave: "cobro", etiqueta: "Comisionado" },
];

export type Visibles = Record<Columna, boolean>;
const TODAS: Visibles = Object.fromEntries(COLUMNAS.map((c) => [c.clave, true])) as Visibles;
/** Por defecto «Marca» y «Modelo» van por separado; la columna unificada «Marca y modelo» se activa desde «Columnas». */
export const POR_DEFECTO: Visibles = { ...TODAS, marca_modelo: false, estado_intranet: false, cobro: false };
export const ORDEN_POR_DEFECTO: Columna[] = COLUMNAS.map((c) => c.clave);
const solo = (claves: Columna[]): Visibles => Object.fromEntries(COLUMNAS.map((c) => [c.clave, claves.includes(c.clave)])) as Visibles;
export const VISTAS_INCLUIDAS: { id: string; nombre: string; ayuda: string; config: ConfigColumnas }[] = [
  { id: "compacta", nombre: "Compacta", ayuda: "Cliente, marca y modelo juntos, tipo de venta, estado, vendedor y fecha de expediente.", config: { orden: ORDEN_POR_DEFECTO, visibles: solo(["cliente", "clase", "marca_modelo", "tipo_venta", "estado", "vendedor", "fecha_expediente"]) } },
  { id: "fechas", nombre: "Seguimiento de fechas", ayuda: "Cliente, vehículo, vendedor y todas las fechas (expediente, afectación, RCI, matriculación, facturación, entrega).", config: { orden: ORDEN_POR_DEFECTO, visibles: solo(["cliente", "marca_modelo", "vendedor", "fecha_expediente", "fecha_afectacion", "fecha_rci", "fecha_matriculacion", "fecha_facturacion", "fecha_entrega"]) } },
  { id: "contacto", nombre: "Contacto", ayuda: "Cliente, teléfono, email, vehículo y vendedor para llamar o escribir.", config: { orden: ["cliente", "telefono", "email", "marca_modelo", "vendedor", ...ORDEN_POR_DEFECTO.filter((c) => !["cliente", "telefono", "email", "marca_modelo", "vendedor"].includes(c))], visibles: solo(["cliente", "telefono", "email", "marca_modelo", "vendedor"]) } },
  { id: "todas", nombre: "Todas las columnas", ayuda: "Todas las columnas, con marca y modelo por separado.", config: { orden: ORDEN_POR_DEFECTO, visibles: { ...TODAS, marca_modelo: false } } },
];

/** Ancho fijo de cada columna (px): la tabla no cambia de tamaño al ocultar entregados, filtrar u ordenar. */
export const ANCHO_COLUMNA: Record<Columna, number> = {
  cliente: 200,
  telefono: 112,
  email: 210,
  marca: 90,
  modelo: 150,
  marca_modelo: 170,
  clase: 70,
  punto: 34,
  tipo_venta: 100,
  estado: 100,
  vendedor: 130,
  fecha_expediente: 100,
  fecha_afectacion: 150,
  fecha_rci: 150,
  fecha_matriculacion: 150,
  fecha_facturacion: 150,
  fecha_entrega: 150,
  estado_intranet: 130,
  cobro: 150,
};
/** «Dacia Sandero»: marca y modelo en una sola cadena, sin repetir la marca si el modelo ya la incluye («Renault 5» de la marca Renault). */
export function marcaYModelo(e: ExpedienteDto): string {
  const marca = e.modelo?.marca?.nombre?.trim() ?? "";
  const modelo = e.modelo?.nombre_modelo?.trim() ?? "";
  if (!marca) return modelo;
  if (!modelo) return marca;
  const sinAcentos = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return sinAcentos(modelo).startsWith(sinAcentos(marca)) ? modelo : `${marca} ${modelo}`;
}

export const ENCABEZADOS: Record<Columna, { etiqueta: string; fondo?: string }> = {
  cliente: { etiqueta: "Cliente" },
  telefono: { etiqueta: "Teléfono" },
  email: { etiqueta: "Email" },
  clase: { etiqueta: "VN / VO" },
  punto: { etiqueta: "●" },
  marca: { etiqueta: "Marca" },
  modelo: { etiqueta: "Modelo" },
  marca_modelo: { etiqueta: "Marca y modelo" },
  tipo_venta: { etiqueta: "T. Venta" },
  estado: { etiqueta: "Estado" },
  vendedor: { etiqueta: "Vendedor" },
  fecha_expediente: { etiqueta: "F. Exp.", fondo: FONDO_FECHA_A },
  fecha_afectacion: { etiqueta: "F. Afect", fondo: FONDO_FECHA_B },
  fecha_rci: { etiqueta: "F. RCI", fondo: FONDO_FECHA_A },
  fecha_matriculacion: { etiqueta: "F. Mat", fondo: FONDO_FECHA_B },
  fecha_facturacion: { etiqueta: "F. FAC.", fondo: FONDO_FECHA_A },
  fecha_entrega: { etiqueta: "F. Entrega", fondo: FONDO_FECHA_B },
  estado_intranet: { etiqueta: "Estado intranet" },
  cobro: { etiqueta: "Comisionado", fondo: "rgba(128, 128, 128, 0.06)" },
};

/** Ayuda que sale al pasar el ratón por el título de cada columna. */
export const AYUDA_COLUMNA: Record<Columna, string> = {
  cliente: "Nombre del cliente. Haz clic para ordenar",
  telefono: "Primer teléfono del cliente",
  email: "Primer correo del cliente",
  clase: "VN (nuevo) o VO (usado)",
  punto: "Color de la marca del vehículo",
  marca: "Marca del vehículo",
  modelo: "Modelo del vehículo",
  marca_modelo: "Marca y modelo en una sola columna",
  tipo_venta: "Forma de pago: contado, crédito, preference…",
  estado: "Estado del vehículo en la app",
  vendedor: "Comercial al que pertenece el expediente",
  fecha_expediente: "Fecha en que se hizo el pedido",
  fecha_afectacion: "Fecha de afectación del vehículo al pedido",
  fecha_rci: "Fecha de contratación de la financiación (la fecha de pago de la financiera)",
  fecha_matriculacion: "Fecha de matriculación (en un VN cuenta para comisionar)",
  fecha_facturacion: "Fecha de facturación (en un VN y un VO es la que cuenta para comisionar)",
  fecha_entrega: "Fecha de entrega al cliente",
  estado_intranet: "Estado en la intranet del fabricante (Archivado, Anulado…), importado de sus listados",
  cobro: "Si la comisión del coche ya aparece como pagada en el Cotejo de pagos",
};

export const ANCHO_SELECCION = 40;
export const ANCHO_ACCIONES = 130;

export const FECHAS_FILTRO: { valor: string; etiqueta: string }[] = [
  { valor: "fecha_expediente", etiqueta: "Fecha Expediente (pedido)" },
  { valor: "fecha_afectacion", etiqueta: "Fecha Afectación" },
  { valor: "fecha_matriculacion", etiqueta: "Fecha Matriculación" },
  { valor: "fecha_facturacion", etiqueta: "Fecha Facturación" },
  { valor: "fecha_entrega", etiqueta: "Fecha Entrega" },
  { valor: "fecha_rci", etiqueta: "Fecha RCI" },
  { valor: "fecha_comisionado", etiqueta: "Fecha Comisionado" },
];

export const etiquetaFiltro: CSSProperties = { fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" };
export const botonHerramienta = (activo: boolean, fondoActivo: string, colorActivo: string): CSSProperties => ({
  padding: "5px 10px",
  fontSize: "0.8rem",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  backgroundColor: activo ? fondoActivo : "rgba(255,255,255,0.05)",
  color: activo ? colorActivo : "var(--text-primary)",
  border: "1px solid var(--border-light)",
  borderRadius: "var(--radius-sm)",
  fontWeight: 600,
});
export const botonMes: CSSProperties = { padding: "3px 8px", fontSize: "0.75rem", fontWeight: 600 };
export const cajaMes: CSSProperties = {
  padding: "4px 10px",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "8px",
  background: "rgba(255, 255, 255, 0.02)",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  width: "fit-content",
};
export const textoCaja: CSSProperties = { fontSize: "0.75rem", fontWeight: 700, color: "var(--primary-light, #60a5fa)", textTransform: "uppercase", letterSpacing: "0.5px" };


export const hoyIsoLocal = () => new Date().toISOString().split("T")[0];

export function leerArchivo<T extends string | ArrayBuffer>(archivo: File, como: "texto" | "binario"): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(lector.result as T);
    lector.onerror = () => rechazar(new Error("Error de lectura del archivo."));
    if (como === "texto") lector.readAsText(archivo);
    else lector.readAsArrayBuffer(archivo);
  });
}

export function aActualizacion(fila: FilaExcel, idCliente: number, idExpediente: number): ActualizacionExcel {
  return {
    rowIdx: fila.rowIdx,
    id_cliente: idCliente,
    id_expediente: idExpediente,
    nif: fila.nif,
    bastidor: fila.bastidor,
    matricula: fila.matricula,
    f_afect: fila.f_afect,
    f_mat: fila.f_mat,
    email: fila.email,
    f_exp: fila.f_exp,
    telefono: fila.telefono,
    f_entrega: fila.f_entrega,
  };
}
