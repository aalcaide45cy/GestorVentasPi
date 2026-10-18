import type { ExpedienteDto } from "@/lib/dto";

/** Cabeceras del CSV de expedientes (mismas que la aplicación original). */
export const CABECERAS_CSV = [
  "ID Expediente",
  "Cliente Nombre",
  "Cliente DNI",
  "Cliente Fecha Nacimiento",
  "Cliente Emails",
  "Cliente Telefonos",
  "Marca",
  "Marca Activo",
  "Marca Acceso Rapido",
  "Marca Sistema Comisiones",
  "Modelo",
  "Modelo Acceso Rapido",
  "Modelo Orden Acceso Rapido",
  "Tipo Venta",
  "Tipo Venta Color",
  "Estado Vehiculo",
  "Estado Vehiculo Predeterminado",
  "Vendedor",
  "F. Expediente",
  "F. Afectacion",
  "F. RCI",
  "F. Matriculacion",
  "F. Entrega",
  "Matricula",
  "VIN",
] as const;

function bool(valor: boolean | null | undefined, porDefecto: boolean): string {
  return String(valor ?? porDefecto);
}

/** Una fila del CSV de exportación. Correos y teléfonos: `valor:tipo` separados por `|`. */
export function filaCsv(e: ExpedienteDto): string[] {
  const marca = e.modelo?.marca;
  return [
    String(e.id_expediente),
    e.cliente?.nombre ?? "",
    e.cliente?.dni ?? "",
    e.cliente?.fecha_de_nacimiento ?? "",
    (e.cliente?.emails ?? []).map((m) => `${m.email}:${m.tipo_email || "Principal"}`).join("|"),
    (e.cliente?.telefonos ?? []).map((t) => `${t.telefono}:${t.tipo_telefono || "Principal"}`).join("|"),
    marca?.nombre ?? "",
    bool(marca?.activo, true),
    bool(marca?.acceso_rapido, false),
    bool(marca?.sistema_comisiones, false),
    e.modelo?.nombre_modelo ?? "",
    bool(e.modelo?.acceso_rapido, false),
    String(e.modelo?.orden_acceso_rapido ?? 0),
    e.tipoDeVenta?.nombre_tipo_venta ?? "",
    e.tipoDeVenta?.color ?? "",
    e.estadoVehiculo?.nombre_estado_vehiculo ?? "",
    bool(e.estadoVehiculo?.predeterminado, false),
    e.usuario?.nombre ?? "",
    e.fecha_expediente ?? "",
    e.fecha_afectacion ?? "",
    e.fecha_rci ?? "",
    e.fecha_matriculacion ?? "",
    e.fecha_entrega ?? "",
    e.matricula ?? "",
    e.vin ?? "",
  ];
}

/** CSV con BOM y directiva `sep=;` para que Excel detecte el separador y los acentos. */
export function construirCsv(lista: ExpedienteDto[]): string {
  const celda = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return (
    "﻿" +
    ["sep=;", CABECERAS_CSV.join(";"), ...lista.map((e) => filaCsv(e).map(celda).join(";"))].join("\n")
  );
}

/** Registro de importación tal y como lo recibe `POST /api/expedientes/import`. */
export interface RegistroImportacionCsv {
  cliente_nombre: string | null;
  cliente_dni: string | null;
  cliente_fecha_nacimiento: string | null;
  cliente_emails: string | null;
  cliente_telefonos: string | null;
  marca_nombre: string | null;
  marca_activo: string | null;
  marca_acceso_rapido: string | null;
  marca_sistema_comisiones: string | null;
  modelo_nombre: string | null;
  modelo_acceso_rapido: string | null;
  modelo_orden_acceso_rapido: string | null;
  tipo_venta_nombre: string | null;
  tipo_venta_color: string | null;
  estado_vehiculo_nombre: string | null;
  estado_vehiculo_predeterminado: string | null;
  fecha_expediente: string | null;
  fecha_afectacion: string | null;
  fecha_rci: string | null;
  fecha_matriculacion: string | null;
  fecha_entrega: string | null;
  matricula: string | null;
  vin: string | null;
}

/** Separa una línea respetando las comillas. */
export function partirLinea(linea: string, delimitador: string): string[] {
  const partes: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (c === delimitador && !entreComillas) {
      partes.push(actual.trim());
      actual = "";
    } else {
      actual += c;
    }
  }
  partes.push(actual.trim());
  return partes;
}

/**
 * Interpreta el texto de un CSV de expedientes. Reconoce las cabeceras por fragmentos de nombre
 * (como la aplicación original) y lanza `Error` con el mensaje que ve el usuario si no es válido.
 */
export function interpretarCsvExpedientes(texto: string): RegistroImportacionCsv[] {
  if (!texto) throw new Error("Archivo vacío");
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length < 2) throw new Error("El archivo CSV no contiene suficientes líneas (cabecera + datos).");

  const inicio = lineas[0].toLowerCase().startsWith("sep=") ? 1 : 0;
  if (lineas.length <= inicio + 1) throw new Error("El archivo CSV no contiene suficientes líneas de datos.");

  const cabecera = lineas[inicio];
  const delimitador = cabecera.includes(";") ? ";" : ",";
  const cabeceras = partirLinea(cabecera, delimitador).map((h) => h.replace(/^["']|["']$/g, "").toLowerCase());
  // Los listados que se descargan del sistema del fabricante no son un CSV de la aplicación: crearían expedientes sueltos
  if (cabeceras.includes("comercial") && cabeceras.includes("bastidor") && cabeceras.some((h) => h.startsWith("f. afect") || h.startsWith("fecha encuesta") || h.startsWith("fecha entrega"))) {
    throw new Error("Este archivo es un listado del fabricante (Expedientes o Llamadas de calidad), no un CSV de la aplicación. Para usarlo elige «Completar datos desde listados»: solo rellena y corrige datos de expedientes que ya tienes y no crea nada.");
  }
  // Primero coincidencia exacta con algún nombre (por orden de preferencia) y, si no la hay, por
  // fragmento: así «matricula» no se confunde con «f. matriculacion».
  const col = (nombres: string[]) => {
    for (const n of nombres) {
      const i = cabeceras.findIndex((h) => h === n);
      if (i !== -1) return i;
    }
    for (const n of nombres) {
      const i = cabeceras.findIndex((h) => h.includes(n));
      if (i !== -1) return i;
    }
    return -1;
  };

  const idx = {
    nombre: col(["cliente nombre", "nombre cliente", "cliente", "name"]),
    dni: col(["cliente dni", "dni cliente", "dni", "nif"]),
    nacimiento: col(["cliente fecha nacimiento", "cliente_fecha_nacimiento", "fecha_nacimiento_cliente"]),
    emails: col(["cliente emails", "cliente_emails", "emails_cliente"]),
    telefonos: col(["cliente telefonos", "cliente_telefonos", "telefonos_cliente", "tels_cliente"]),
    marca: col(["marca", "brand"]),
    marcaActivo: col(["marca activo", "marca_activo"]),
    marcaRapido: col(["marca acceso rapido", "marca_acceso_rapido"]),
    marcaComisiones: col(["marca sistema comisiones", "marca_sistema_comisiones"]),
    modelo: col(["modelo", "model"]),
    modeloRapido: col(["modelo acceso rapido", "modelo_acceso_rapido"]),
    modeloOrden: col(["modelo orden acceso rapido", "modelo_orden_acceso_rapido"]),
    tipoVenta: col(["tipo venta", "tipo de venta", "tipo_venta"]),
    tipoVentaColor: col(["tipo venta color", "tipo_venta_color"]),
    estado: col(["estado vehiculo", "estado de vehiculo", "estado_vehiculo", "estado"]),
    estadoPred: col(["estado vehiculo predeterminado", "estado_vehiculo_predeterminado"]),
    fExp: col(["f. expediente", "fecha expediente", "fecha_expediente", "fecha"]),
    fAfect: col(["f. afectacion", "fecha afectacion", "fecha_afectacion", "afectacion"]),
    fRci: col(["f. rci", "fecha rci", "fecha_rci", "rci"]),
    fMat: col(["f. matriculacion", "fecha matriculacion", "fecha_matriculacion", "matriculacion"]),
    fEntrega: col(["f. entrega", "fecha entrega", "fecha_entrega", "entrega"]),
    matricula: col(["matricula", "license plate"]),
    vin: col(["vin", "bastidor"]),
  };

  const registros: RegistroImportacionCsv[] = [];
  for (let i = inicio + 1; i < lineas.length; i++) {
    const partes = partirLinea(lineas[i], delimitador);
    if (partes.length === 1 && partes[0] === "") continue;
    const valor = (n: number) => (n !== -1 && n < partes.length ? partes[n] : null);
    registros.push({
      cliente_nombre: valor(idx.nombre),
      cliente_dni: valor(idx.dni),
      cliente_fecha_nacimiento: valor(idx.nacimiento),
      cliente_emails: valor(idx.emails),
      cliente_telefonos: valor(idx.telefonos),
      marca_nombre: valor(idx.marca),
      marca_activo: valor(idx.marcaActivo),
      marca_acceso_rapido: valor(idx.marcaRapido),
      marca_sistema_comisiones: valor(idx.marcaComisiones),
      modelo_nombre: valor(idx.modelo),
      modelo_acceso_rapido: valor(idx.modeloRapido),
      modelo_orden_acceso_rapido: valor(idx.modeloOrden),
      tipo_venta_nombre: valor(idx.tipoVenta),
      tipo_venta_color: valor(idx.tipoVentaColor),
      estado_vehiculo_nombre: valor(idx.estado),
      estado_vehiculo_predeterminado: valor(idx.estadoPred),
      fecha_expediente: valor(idx.fExp),
      fecha_afectacion: valor(idx.fAfect),
      fecha_rci: valor(idx.fRci),
      fecha_matriculacion: valor(idx.fMat),
      fecha_entrega: valor(idx.fEntrega),
      matricula: valor(idx.matricula),
      vin: valor(idx.vin),
    });
  }
  if (registros.length === 0) throw new Error("No se encontraron registros válidos de datos en el CSV.");
  return registros;
}

/** Descarga un texto como archivo desde el navegador. */
export function descargarTexto(nombre: string, contenido: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
