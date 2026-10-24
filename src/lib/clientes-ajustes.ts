/**
 * Ajustes de la lista de Clientes (Configuración › Clientes). Se guardan en el navegador de cada persona; sin nada guardado, la lista se ve
 * como siempre: todos los clientes, los más recientes primero y con todas las columnas.
 */

export const CLAVE_CLIENTES_ORDEN = "clientes-orden";
export const CLAVE_CLIENTES_COLUMNAS_OCULTAS = "clientes-columnas-ocultas";
export const CLAVE_CLIENTES_POR_PANTALLA = "clientes-por-pantalla";
export const CLAVE_CLIENTES_SOLO_CON_VENTAS = "clientes-solo-con-ventas";

export type CampoOrdenClientes = "id" | "nombre" | "dni" | "fecha_de_nacimiento" | "tienda" | "expedientes";

export const ORDENES_CLIENTES: { clave: string; campo: CampoOrdenClientes; asc: boolean; texto: string }[] = [
  { clave: "id:desc", campo: "id", asc: false, texto: "Los más recientes primero" },
  { clave: "id:asc", campo: "id", asc: true, texto: "Los más antiguos primero" },
  { clave: "nombre:asc", campo: "nombre", asc: true, texto: "Nombre de la A a la Z" },
  { clave: "nombre:desc", campo: "nombre", asc: false, texto: "Nombre de la Z a la A" },
  { clave: "expedientes:desc", campo: "expedientes", asc: false, texto: "Los que más ventas tienen primero" },
  { clave: "tienda:asc", campo: "tienda", asc: true, texto: "Por tienda" },
  { clave: "fecha_de_nacimiento:asc", campo: "fecha_de_nacimiento", asc: true, texto: "Por fecha de nacimiento" },
];

export const COLUMNAS_CLIENTES = [
  { id: "fecha", etiqueta: "F. Nacimiento" },
  { id: "correos", etiqueta: "Correos" },
  { id: "telefonos", etiqueta: "Teléfonos" },
  { id: "tienda", etiqueta: "Tienda" },
  { id: "ventas", etiqueta: "Ventas" },
] as const;
export type ColumnaCliente = (typeof COLUMNAS_CLIENTES)[number]["id"];

export const OPCIONES_POR_PANTALLA = [0, 25, 50, 100, 200, 500] as const;

/** Orden al abrir la lista (si lo guardado no vale, «los más recientes primero»). */
export function ordenClientes(guardado: string | null): { campo: CampoOrdenClientes; asc: boolean } {
  const o = ORDENES_CLIENTES.find((x) => x.clave === guardado) ?? ORDENES_CLIENTES[0];
  return { campo: o.campo, asc: o.asc };
}

/** Columnas que el usuario ha escondido. */
export function columnasOcultasClientes(guardado: string | null): ColumnaCliente[] {
  try {
    const v: unknown = guardado ? JSON.parse(guardado) : [];
    const ids: string[] = COLUMNAS_CLIENTES.map((c) => c.id);
    return Array.isArray(v) ? [...new Set(v.filter((x): x is ColumnaCliente => typeof x === "string" && ids.includes(x)))] : [];
  } catch {
    return [];
  }
}

/** Cuántos clientes se enseñan de entrada (0 = todos). */
export function clientesPorPantalla(guardado: string | null): number {
  const n = Number(guardado);
  return guardado !== null && (OPCIONES_POR_PANTALLA as readonly number[]).includes(n) ? n : 0;
}
