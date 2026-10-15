import { partirLinea } from "./csv-expedientes";

export interface ClienteParaCsv {
  id: number;
  nombre: string | null;
  dni: string | null;
  fecha_de_nacimiento: string | null;
  tiendaNombre: string;
  emails: { email: string; tipo_email: string | null }[];
  telefonos: { telefono: string; tipo_telefono: string | null }[];
  numExpedientes: number;
}

const CABECERAS = ["ID", "Nombre", "DNI", "Fecha Nacimiento", "Tienda", "Emails", "Telefonos", "Num Expedientes"];

/** CSV de clientes con BOM y `sep=;` (mismas columnas que la aplicación original). */
export function construirCsvClientes(lista: ClienteParaCsv[]): string {
  const celda = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const filas = lista.map((c) => [
    c.id,
    c.nombre ?? "",
    c.dni ?? "",
    c.fecha_de_nacimiento ?? "",
    c.tiendaNombre,
    c.emails.map((e) => `${e.email}:${e.tipo_email || "Principal"}`).join("|"),
    c.telefonos.map((t) => `${t.telefono}:${t.tipo_telefono || "Principal"}`).join("|"),
    c.numExpedientes,
  ]);
  return "﻿" + ["sep=;", CABECERAS.join(";"), ...filas.map((f) => f.map(celda).join(";"))].join("\n");
}

export interface RegistroClienteCsv {
  nombre: string;
  dni: string | null;
  fecha_de_nacimiento: string | null;
  tienda_nombre: string | null;
  emails: string | null;
  telefonos: string | null;
}

/** Interpreta un CSV de clientes; lanza `Error` con el texto que ve el usuario. */
export function interpretarCsvClientes(texto: string): RegistroClienteCsv[] {
  if (!texto) throw new Error("Archivo vacío");
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length < 2) throw new Error("El CSV no contiene suficientes líneas.");
  const inicio = lineas[0].toLowerCase().startsWith("sep=") ? 1 : 0;
  if (lineas.length <= inicio + 1) throw new Error("El CSV no contiene datos.");

  const delimitador = lineas[inicio].includes(";") ? ";" : ",";
  const cabeceras = partirLinea(lineas[inicio], delimitador).map((h) => h.replace(/^["']|["']$/g, "").toLowerCase());
  const indice = (nombres: string[]) => {
    for (const n of nombres) {
      const i = cabeceras.findIndex((h) => h.includes(n));
      if (i !== -1) return i;
    }
    return -1;
  };
  const idx = {
    nombre: indice(["nombre", "name"]),
    dni: indice(["dni", "nif"]),
    fecha: indice(["fecha nacimiento", "fecha_de_nacimiento", "fecha_nacimiento"]),
    tienda: indice(["tienda"]),
    emails: indice(["emails", "correos"]),
    telefonos: indice(["telefonos", "teléfonos", "tels"]),
  };

  const registros: RegistroClienteCsv[] = [];
  for (const linea of lineas.slice(inicio + 1)) {
    const partes = partirLinea(linea, delimitador).map((p) => p.replace(/^["']|["']$/g, ""));
    if (partes.length === 1 && partes[0] === "") continue;
    const valor = (i: number) => (i !== -1 && i < partes.length ? partes[i] : null);
    const nombre = valor(idx.nombre);
    if (!nombre) continue;
    registros.push({
      nombre,
      dni: valor(idx.dni),
      fecha_de_nacimiento: valor(idx.fecha),
      tienda_nombre: valor(idx.tienda),
      emails: valor(idx.emails),
      telefonos: valor(idx.telefonos),
    });
  }
  if (registros.length === 0) throw new Error("No se encontraron registros válidos en el CSV.");
  return registros;
}
