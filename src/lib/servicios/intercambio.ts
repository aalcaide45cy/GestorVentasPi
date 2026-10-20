import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import {
  ajustes,
  clientes,
  commissionPlans,
  emailsClientes,
  estadoVehiculo,
  expedientes,
  marcas,
  modelos,
  plantillasPlan,
  plantillasTarifasVn,
  rejillaFilas,
  rejillas,
  telefonosClientes,
  tiendas,
  tipoDeVenta,
  usuarios,
  usuariosTiendas,
} from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { conRecalculo } from "./liquidaciones";
import { esquemaPlan, guardarPlan, leerPlan, type PlanEditable } from "./planes";
import { esquemaPlantillaPlan } from "./plantillas-plan";
import { esquemaPlantilla } from "./plantillas-tarifas";

/**
 * Exportar e importar los datos por secciones (clientes, expedientes, catálogos, planes de comisionamiento…) en un formato JSON
 * propio que se puede volver a importar. Toda importación pasa por una vista previa: se ejecuta el mismo proceso dentro de una
 * transacción y se deshace, de modo que lo que se enseña es exactamente lo que ocurrirá al aplicarla.
 */

export const FORMATO = "gv-seccion-1";

import { INFO_SECCIONES, SECCIONES, type InfoSeccion, type Modo, type Seccion } from "@/lib/secciones-info";

export { INFO_SECCIONES, SECCIONES };
export type { InfoSeccion, Modo, Seccion };

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const norm = (t: string | null | undefined): string => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const normDni = (t: string | null | undefined): string => (t ?? "").replace(/[\s.\-]/g, "").toUpperCase();
const normMatricula = (t: string | null | undefined): string => (t ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const normVin = (t: string | null | undefined): string => (t ?? "").replace(/\s/g, "").toUpperCase();
const vacioANull = (t: string | null | undefined): string | null => {
  const v = (t ?? "").trim();
  return v === "" ? null : v;
};

const texto = z.string().nullish();
const fechaIso = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha no válida (usa AAAA-MM-DD)"), z.literal("").transform(() => null), z.null()])
  .nullish();
const entero = z.number().int().nullish();

export interface Informe {
  seccion: Seccion;
  modo: Modo;
  aplicado: boolean;
  /** Registros leídos del archivo. */
  total: number;
  nuevos: number;
  actualizados: number;
  sinCambios: number;
  omitidos: number;
  eliminados: number;
  errores: string[];
  /** Total de errores (la lista `errores` se recorta a 50). */
  totalErrores: number;
  avisos: string[];
  /** Primeros cambios previstos o hechos, para que el usuario los vea. */
  muestra: { accion: "nuevo" | "actualiza" | "elimina" | "omite"; texto: string }[];
  /** Planes: lo que el archivo usa y todavía no existe en esta aplicación (los modelos y marcas se pueden crear al importar). */
  faltan?: { marcas: string[]; modelos: string[]; vendedores: string[] };
}

export interface OpcionesImportacion {
  /** Crear las marcas y modelos que el archivo usa y no existen (solo planes). */
  crearCatalogo?: boolean;
}

function nuevoInforme(seccion: Seccion, modo: Modo, total: number): Informe {
  return { seccion, modo, aplicado: false, total, nuevos: 0, actualizados: 0, sinCambios: 0, omitidos: 0, eliminados: 0, errores: [], totalErrores: 0, avisos: [], muestra: [] };
}
function error(inf: Informe, mensaje: string): void {
  inf.totalErrores++;
  inf.omitidos++;
  if (inf.errores.length < 50) inf.errores.push(mensaje);
}
function nota(inf: Informe, accion: Informe["muestra"][number]["accion"], textoNota: string): void {
  if (inf.muestra.length < 40) inf.muestra.push({ accion, texto: textoNota });
}
function aviso(inf: Informe, mensaje: string): void {
  if (inf.avisos.length < 30 && !inf.avisos.includes(mensaje)) inf.avisos.push(mensaje);
}
const filaN = (i: number) => `Fila ${i + 1}`;
/** Mensajes de validación en español sencillo. */
const traducir = (m: string): string =>
  /received undefined|expected string, received null/i.test(m)
    ? "falta este dato (es obligatorio)"
    : /^Invalid input: expected (\w+)/i.test(m)
      ? "el tipo de dato no es válido"
      : /Too small|too_small/i.test(m)
        ? "está vacío o es demasiado corto"
        : /Too big|too_big/i.test(m)
          ? "es demasiado largo o grande"
          : m;
const motivoZod = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".") || "valor"}: ${traducir(i.message)}`).slice(0, 3).join("; ");

export interface Paquete {
  app: "GestorVentasPi";
  formato: typeof FORMATO;
  seccion: Seccion;
  exportadoEn: string;
  registros: number;
  datos: unknown[];
  /** Solo en planes: nombres con los que se identifican marcas, modelos y vendedores. */
  mapas?: MapasPlan;
}

interface MapasPlan {
  marcas: Record<string, string>;
  modelos: Record<string, { marca: string; modelo: string }>;
  usuarios: Record<string, string>;
}

const esquemaPaquete = z.object({
  app: z.literal("GestorVentasPi", { error: "El archivo no es una exportación de GestorVentasPi." }),
  formato: z.literal(FORMATO, { error: "El formato del archivo no es compatible con esta versión." }),
  seccion: z.enum(SECCIONES),
  exportadoEn: z.string().optional(),
  registros: z.number().optional(),
  datos: z.array(z.unknown()),
  mapas: z.unknown().optional(),
});

/* ------------------------------------------------------------------ */
/* Recuento por sección                                                */
/* ------------------------------------------------------------------ */

export async function resumenSecciones(ej: Ejecutor): Promise<{ seccion: Seccion; registros: number; detalle?: string }[]> {
  const cuenta = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const n = sql<number>`count(*)::int`;
  // Todos los recuentos a la vez: así la lista sale en lo que tarda el más lento y no en la suma de todos
  const [nClientes, nExpedientes, nMarcas, nTipos, nEstados, nTiendas, nPlanes, nPlantillasTarifas, nPlantillasPlan, nRejillas, nAjustes, nUsuarios] = await Promise.all([
    cuenta(ej.select({ n }).from(clientes).where(isNull(clientes.eliminadoEn))),
    cuenta(ej.select({ n }).from(expedientes).where(isNull(expedientes.eliminadoEn))),
    cuenta(ej.select({ n }).from(marcas).where(isNull(marcas.eliminadoEn))),
    cuenta(ej.select({ n }).from(tipoDeVenta).where(isNull(tipoDeVenta.eliminadoEn))),
    cuenta(ej.select({ n }).from(estadoVehiculo).where(isNull(estadoVehiculo.eliminadoEn))),
    cuenta(ej.select({ n }).from(tiendas).where(isNull(tiendas.eliminadoEn))),
    cuenta(ej.select({ n }).from(commissionPlans)),
    cuenta(ej.select({ n }).from(plantillasTarifasVn)),
    cuenta(ej.select({ n }).from(plantillasPlan)),
    cuenta(ej.select({ n }).from(rejillas)),
    ajustesExportables(ej).then((a) => a.length),
    cuenta(ej.select({ n }).from(usuarios)),
  ]);
  const datos: Record<Seccion, number> = {
    clientes: nClientes,
    expedientes: nExpedientes,
    clientes_expedientes: 0,
    marcas_modelos: nMarcas,
    tipos_venta: nTipos,
    estados: nEstados,
    tiendas: nTiendas,
    planes: nPlanes,
    plantillas_tarifas: nPlantillasTarifas,
    plantillas_plan: nPlantillasPlan,
    rejillas: nRejillas,
    ajustes: nAjustes,
    usuarios: nUsuarios,
  };
  datos.clientes_expedientes = datos.clientes + datos.expedientes;
  return SECCIONES.map((s) => ({ seccion: s, registros: datos[s], ...(s === "clientes_expedientes" ? { detalle: `${datos.clientes.toLocaleString("es-ES")} clientes y ${datos.expedientes.toLocaleString("es-ES")} expedientes` } : {}) }));
}

/**
 * Lo que pesaría hoy el archivo .json de cada sección (el mismo que se descarga, con sus sangrías). Se calcula exportando cada sección de
 * verdad, una detrás de otra para no gastar memoria de golpe, y se recuerda dos minutos: pedirlo varias veces seguidas no repite el trabajo.
 */
const cacheTamanos: { cuando: number; datos: Record<Seccion, number> | null; calculando: Promise<Record<Seccion, number>> | null } = { cuando: 0, datos: null, calculando: null };

export async function tamanosSecciones(ej: Ejecutor, fresco = false): Promise<Record<Seccion, number>> {
  if (!fresco && cacheTamanos.datos && Date.now() - cacheTamanos.cuando < 120_000) return cacheTamanos.datos;
  if (cacheTamanos.calculando) return cacheTamanos.calculando;
  cacheTamanos.calculando = (async () => {
    const r = {} as Record<Seccion, number>;
    for (const sec of SECCIONES) r[sec] = Buffer.byteLength(JSON.stringify(await exportarSeccion(ej, sec), null, 2), "utf8");
    cacheTamanos.datos = r;
    cacheTamanos.cuando = Date.now();
    return r;
  })().finally(() => {
    cacheTamanos.calculando = null;
  });
  return cacheTamanos.calculando;
}

/** Lista breve de planes para elegir cuáles exportar. */
export async function planesParaElegir(ej: Ejecutor): Promise<{ id: number; nombre: string; fechaInicio: string; fechaFin: string; estado: string }[]> {
  const filas = await ej.select().from(commissionPlans).orderBy(sql`${commissionPlans.fechaInicio} desc`);
  return filas.map((p) => ({ id: p.idPlan, nombre: p.nombre, fechaInicio: p.fechaInicio, fechaFin: p.fechaFin, estado: p.estado }));
}

/* ------------------------------------------------------------------ */
/* Exportar                                                            */
/* ------------------------------------------------------------------ */

const CLAVE_SECRETA = /secret|token|clave|password|contrase|key|credencial/i;

async function ajustesExportables(ej: Ejecutor): Promise<{ clave: string; valor: string }[]> {
  const filas = await ej.select().from(ajustes);
  return filas.filter((a) => !CLAVE_SECRETA.test(a.clave) && a.clave !== "backup_ultimo_error").map((a) => ({ clave: a.clave, valor: a.valor }));
}

export async function exportarSeccion(ej: Ejecutor, seccion: Seccion, opciones: { ids?: number[] } = {}): Promise<Paquete> {
  let datos: unknown[] = [];
  let mapas: MapasPlan | undefined;
  switch (seccion) {
    case "clientes":
      datos = await exportarClientes(ej);
      break;
    case "expedientes":
      datos = await exportarExpedientes(ej);
      break;
    case "clientes_expedientes":
      // Un solo archivo con los clientes completos y los expedientes enlazados con ellos (por DNI o nombre), marcados por tipo
      datos = [...(await exportarClientes(ej)).map((c) => ({ _tipo: "cliente", ...c })), ...(await exportarExpedientes(ej)).map((e) => ({ _tipo: "expediente", ...e }))];
      break;
    case "marcas_modelos": {
      const ms = await ej.select().from(marcas).where(isNull(marcas.eliminadoEn)).orderBy(marcas.nombre);
      const mos = await ej.select().from(modelos).where(isNull(modelos.eliminadoEn)).orderBy(modelos.nombreModelo);
      datos = ms.map((m) => ({
        marca: m.nombre,
        activo: m.activo ?? true,
        accesoRapido: m.accesoRapido ?? false,
        sistemaComisiones: m.sistemaComisiones,
        color: m.color,
        punto: m.punto,
        puntoColor: m.puntoColor,
        modelos: mos.filter((x) => x.marcaId === m.idMarca).map((x) => ({ nombre: x.nombreModelo, accesoRapido: x.accesoRapido ?? false, ordenAccesoRapido: x.ordenAccesoRapido ?? 0 })),
      }));
      break;
    }
    case "tipos_venta":
      datos = (await ej.select().from(tipoDeVenta).where(isNull(tipoDeVenta.eliminadoEn)).orderBy(tipoDeVenta.orden)).map((t) => ({ nombre: t.nombreTipoVenta, color: t.color, orden: t.orden, categoria: t.categoria, requiereRciAlMatricular: t.requiereRciAlMatricular, cuentaParaTasa: t.cuentaParaTasa }));
      break;
    case "estados":
      datos = (await ej.select().from(estadoVehiculo).where(isNull(estadoVehiculo.eliminadoEn)).orderBy(estadoVehiculo.nombreEstadoVehiculo)).map((e) => ({ nombre: e.nombreEstadoVehiculo, predeterminado: e.predeterminado ?? false, clase: e.clase, subtipoVo: e.subtipoVo }));
      break;
    case "tiendas":
      datos = (await ej.select().from(tiendas).where(isNull(tiendas.eliminadoEn)).orderBy(tiendas.nombre)).map((t) => ({ nombre: t.nombre, ciudad: t.ciudad }));
      break;
    case "planes": {
      const r = await exportarPlanes(ej, opciones.ids);
      datos = r.datos;
      mapas = r.mapas;
      break;
    }
    case "plantillas_tarifas":
      datos = (await ej.select().from(plantillasTarifasVn).orderBy(plantillasTarifasVn.nombre)).map((p) => ({ nombre: p.nombre, descripcion: p.descripcion, datos: p.datos }));
      break;
    case "plantillas_plan":
      datos = (await ej.select().from(plantillasPlan).orderBy(plantillasPlan.ambito, plantillasPlan.nombre)).map((p) => ({ ambito: p.ambito, nombre: p.nombre, descripcion: p.descripcion, datos: p.datos }));
      break;
    case "rejillas":
      datos = await exportarRejillas(ej);
      break;
    case "ajustes":
      datos = await ajustesExportables(ej);
      break;
    case "usuarios":
      datos = await exportarUsuarios(ej);
      break;
  }
  return { app: "GestorVentasPi", formato: FORMATO, seccion, exportadoEn: new Date().toISOString(), registros: datos.length, datos, ...(mapas ? { mapas } : {}) };
}

/* ------------------------------------------------------------------ */
/* Contenido de una sección (para verlo en una tabla antes de exportar) */
/* ------------------------------------------------------------------ */

export interface ParteContenido {
  id: string;
  titulo: string;
  columnas: { clave: string; etiqueta: string }[];
  filas: Record<string, string | number>[];
  /** Total de filas (las enseñadas se recortan). */
  total: number;
}
export interface ContenidoSeccion {
  seccion: Seccion;
  partes: ParteContenido[];
  /** Cuántas filas como máximo se enseñan por tabla. */
  limite: number;
}

const ETIQUETAS_COLUMNA: Record<string, string> = {
  dni: "DNI/NIF",
  vin: "Bastidor",
  codigoPostal: "Código postal",
  fechaNacimiento: "Fecha de nacimiento",
  tipoVenta: "Tipo de venta",
  loginEmail: "Correo de acceso",
  accesoRapido: "Acceso rápido",
  ordenAccesoRapido: "Orden acceso rápido",
  requiereRciAlMatricular: "Exige fecha RCI",
  cuentaParaTasa: "Cuenta para la tasa de intervención",
  sistemaComisiones: "Sistema de comisiones",
  color: "Color",
  punto: "Punto",
  puntoColor: "Color del punto",
  subtipoVo: "Subtipo VO",
};
const humanizar = (clave: string): string => ETIQUETAS_COLUMNA[clave] ?? clave.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace(/_/g, " ").trim();

/** Convierte un valor cualquiera en un texto corto para una celda de tabla. */
function celda(v: unknown): string | number {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    if (v.every((x) => x && typeof x === "object" && ("email" in x || "telefono" in x))) return v.map((x) => (x as { email?: string; telefono?: string }).email ?? (x as { telefono?: string }).telefono ?? "").join(", ");
    if (v.every((x) => typeof x !== "object")) return v.join(", ");
    return `${v.length} elemento${v.length === 1 ? "" : "s"}`;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("nombre" in o) return `${String(o.nombre ?? "")}${o.dni ? ` (${String(o.dni)})` : ""}`;
    const sencillos = Object.entries(o).filter(([, x]) => x !== null && typeof x !== "object").slice(0, 3);
    return sencillos.map(([k, x]) => `${humanizar(k)}: ${String(x)}`).join(" · ") || "(datos)";
  }
  return String(v);
}

function aTabla(id: string, titulo: string, datos: unknown[], limite: number): ParteContenido {
  const claves: string[] = [];
  for (const d of datos.slice(0, 200)) {
    for (const k of Object.keys((d ?? {}) as Record<string, unknown>)) if (k !== "_tipo" && !claves.includes(k)) claves.push(k);
  }
  const filas = datos.slice(0, limite).map((d) => Object.fromEntries(claves.map((k) => [k, celda((d as Record<string, unknown>)[k])])));
  return { id, titulo, columnas: claves.map((k) => ({ clave: k, etiqueta: humanizar(k) })), filas, total: datos.length };
}

/** Lo que se exportaría de una sección, como tablas legibles (la misma exportación, sin descargar nada). */
export async function contenidoSeccion(ej: Ejecutor, seccion: Seccion, limite = 5000): Promise<ContenidoSeccion> {
  const p = await exportarSeccion(ej, seccion);
  if (seccion === "clientes_expedientes") {
    const de = (tipo: string) => p.datos.filter((d) => (d as { _tipo?: string })._tipo === tipo);
    return { seccion, limite, partes: [aTabla("clientes", "Clientes", de("cliente"), limite), aTabla("expedientes", "Expedientes", de("expediente"), limite)] };
  }
  return { seccion, limite, partes: [aTabla("todo", INFO_SECCIONES[seccion].titulo, p.datos, limite)] };
}

async function exportarClientes(ej: Ejecutor) {
  const filas = await ej
    .select({ id: clientes.id, dni: clientes.dni, nombre: clientes.nombre, fnac: clientes.fechaDeNacimiento, domicilio: clientes.domicilio, poblacion: clientes.poblacion, cp: clientes.codigoPostal, tienda: tiendas.nombre })
    .from(clientes)
    .leftJoin(tiendas, eq(tiendas.idTienda, clientes.tiendaId))
    .where(isNull(clientes.eliminadoEn))
    .orderBy(clientes.id);
  const emails = await ej.select().from(emailsClientes).orderBy(emailsClientes.idEmailCliente);
  const tels = await ej.select().from(telefonosClientes).orderBy(telefonosClientes.idTelefonoCliente);
  return filas.map((c) => ({
    dni: c.dni,
    nombre: c.nombre,
    fechaNacimiento: c.fnac,
    domicilio: c.domicilio,
    poblacion: c.poblacion,
    codigoPostal: c.cp,
    tienda: c.tienda,
    emails: emails.filter((e) => e.idCliente === c.id).map((e) => ({ email: e.email, tipo: e.tipoEmail })),
    telefonos: tels.filter((t) => t.idCliente === c.id).map((t) => ({ telefono: t.telefono, tipo: t.tipoTelefono })),
  }));
}

async function exportarExpedientes(ej: Ejecutor) {
  const filas = await ej.query.expedientes.findMany({
    where: isNull(expedientes.eliminadoEn),
    orderBy: [expedientes.idExpediente],
    with: { cliente: true, modelo: { with: { marca: true } }, tipoDeVenta: true, estadoVehiculo: true, usuario: { columns: { loginEmail: true } } },
  });
  const tiendasMap = new Map((await ej.select().from(tiendas)).map((t) => [t.idTienda, t.nombre]));
  return filas.map((e) => ({
    cliente: e.cliente ? { dni: e.cliente.dni, nombre: e.cliente.nombre } : null,
    marca: e.modelo?.marca?.nombre ?? null,
    modelo: e.modelo?.nombreModelo ?? null,
    tipoVenta: e.tipoDeVenta?.nombreTipoVenta ?? null,
    estado: e.estadoVehiculo?.nombreEstadoVehiculo ?? null,
    vendedor: e.usuario?.loginEmail ?? null,
    tienda: e.idTienda ? (tiendasMap.get(e.idTienda) ?? null) : null,
    fechaExpediente: e.fechaExpediente,
    fechaAfectacion: e.fechaAfectacion,
    fechaMatriculacion: e.fechaMatriculacion,
    fechaEntrega: e.fechaEntrega,
    fechaRci: e.fechaRci,
    fechaFacturacion: e.fechaFacturacion,
    matricula: e.matricula,
    vin: e.vin,
    cobradoOtraFecha: e.cobradoOtraFecha,
    fechaCobrado: e.fechaCobrado,
    puntos: e.puntos,
    comisionCocheManual: e.comisionCocheManual,
    comisionFinanciacionManual: e.comisionFinanciacionManual,
    conceptosEspeciales: e.conceptosEspeciales,
  }));
}

async function exportarPlanes(ej: Ejecutor, ids?: number[]): Promise<{ datos: unknown[]; mapas: MapasPlan }> {
  const lista = await ej.select({ id: commissionPlans.idPlan }).from(commissionPlans).orderBy(commissionPlans.fechaInicio);
  const quiero = ids && ids.length > 0 ? lista.filter((p) => ids.includes(p.id)) : lista;
  if (ids && ids.length > 0 && quiero.length === 0) throw new HttpError(404, "Los planes elegidos ya no existen.");
  const planes: Omit<PlanEditable, "idPlan">[] = [];
  for (const p of quiero) {
    const plan = await leerPlan(ej, p.id);
    if (plan) {
      const { idPlan: _id, ...resto } = plan;
      void _id;
      planes.push(resto);
    }
  }
  const ms = await ej.select().from(marcas);
  const mos = await ej.select().from(modelos);
  const us = await ej.select({ id: usuarios.idUsuario, email: usuarios.loginEmail }).from(usuarios);
  const nombreMarca = new Map(ms.map((m) => [m.idMarca, m.nombre]));
  const mapas: MapasPlan = { marcas: {}, modelos: {}, usuarios: {} };
  const marca = (id: number | null | undefined) => {
    if (id) mapas.marcas[String(id)] = nombreMarca.get(id) ?? `#${id}`;
  };
  const modelo = (id: number | null | undefined) => {
    const m = mos.find((x) => x.idModelo === id);
    if (id && m) mapas.modelos[String(id)] = { marca: nombreMarca.get(m.marcaId ?? -1) ?? "", modelo: m.nombreModelo };
  };
  for (const p of planes) {
    for (const v of p.vendedores) {
      const u = us.find((x) => x.id === v.idUsuario);
      if (u) mapas.usuarios[String(v.idUsuario)] = u.email;
    }
    p.puntosModelo.forEach((x) => modelo(x.idModelo));
    p.tarifasVN.forEach((x) => modelo(x.idModelo));
    p.tasas.forEach((x) => marca(x.idMarca));
    p.financiacion.forEach((x) => marca(x.idMarca));
    for (const r of [...p.preference, ...p.reglas, ...p.bonus]) {
      marca(r.idMarca);
      modelo(r.idModelo);
    }
  }
  return { datos: planes, mapas };
}

async function exportarRejillas(ej: Ejecutor) {
  const cabs = await ej.select({ r: rejillas, email: usuarios.loginEmail }).from(rejillas).innerJoin(usuarios, eq(usuarios.idUsuario, rejillas.idUsuario)).orderBy(rejillas.mes);
  const filas = await ej.select().from(rejillaFilas).orderBy(rejillaFilas.id);
  return cabs.map(({ r, email }) => ({
    vendedor: email,
    mes: r.mes,
    origen: r.origen,
    nombreArchivo: r.nombreArchivo,
    totalHoja: r.totalHoja,
    notas: r.notas,
    filas: filas.filter((f) => f.idRejilla === r.id).map((f) => ({ matricula: f.matricula, cliente: f.cliente, financiacion: f.financiacion, concepto: f.concepto, importe: f.importe, textoOriginal: f.textoOriginal, confianza: f.confianza })),
  }));
}

async function exportarUsuarios(ej: Ejecutor) {
  const us = await ej.select().from(usuarios).orderBy(usuarios.idUsuario);
  const ts = await ej.select({ idUsuario: usuariosTiendas.idUsuario, tienda: tiendas.nombre }).from(usuariosTiendas).innerJoin(tiendas, eq(tiendas.idTienda, usuariosTiendas.idTienda));
  return us.map((u) => ({
    nombre: u.nombre,
    email: u.loginEmail,
    rol: u.rol,
    tipoVendedor: u.tipoVendedor,
    patronVo: u.patronVo,
    bloqueado: u.bloqueado ?? false,
    fechaRegistro: u.fechaDeRegistro,
    tiendas: ts.filter((t) => t.idUsuario === u.idUsuario).map((t) => t.tienda),
  }));
}

/* ------------------------------------------------------------------ */
/* Importar                                                            */
/* ------------------------------------------------------------------ */

class Reversion extends Error {}

/**
 * Importa (o simula) una sección. Con `aplicar = false` se ejecuta todo y se deshace: es la vista previa. Los registros con
 * errores se omiten y se cuentan; el resto se aplica.
 */
export async function importarSeccion(ej: Ejecutor, idAdmin: number, entrada: unknown, modo: Modo, aplicar: boolean, seccionEsperada?: Seccion, opciones: OpcionesImportacion = {}): Promise<Informe> {
  const parsed = esquemaPaquete.safeParse(entrada);
  if (!parsed.success) throw new HttpError(400, motivoZod(parsed.error) || "El archivo no es una exportación válida de GestorVentasPi.");
  const paquete = parsed.data;
  const info = INFO_SECCIONES[paquete.seccion];
  if (seccionEsperada && paquete.seccion !== seccionEsperada) {
    throw new HttpError(400, `Este archivo es de «${INFO_SECCIONES[paquete.seccion].titulo}» y no de «${INFO_SECCIONES[seccionEsperada].titulo}».`);
  }
  if (!info.importable) throw new HttpError(400, `La sección «${info.titulo}» solo se puede exportar.`);
  if (!info.modos.includes(modo)) throw new HttpError(400, `El modo «${modo}» no está disponible para «${info.titulo}».`);
  if (paquete.datos.length > 200000) throw new HttpError(413, "El archivo tiene demasiados registros.");

  let informe = nuevoInforme(paquete.seccion, modo, paquete.datos.length);
  try {
    await ej.transaction(async (tx) => {
      informe = await ejecutarImportacion(tx, idAdmin, paquete, modo, informe, opciones);
      if (!aplicar) throw new Reversion();
    });
    informe.aplicado = aplicar;
  } catch (e) {
    if (!(e instanceof Reversion)) throw e;
  }
  return informe;
}

/** Junta los informes de clientes y de expedientes en uno solo, dejando claro de cuál es cada línea. */
function unirInformes(base: Informe, clientes: Informe, expedientes: Informe): Informe {
  const marcar = (i: Informe, etiqueta: string) => i.muestra.map((m) => ({ ...m, texto: `${etiqueta}: ${m.texto}` }));
  return {
    ...base,
    nuevos: clientes.nuevos + expedientes.nuevos,
    actualizados: clientes.actualizados + expedientes.actualizados,
    sinCambios: clientes.sinCambios + expedientes.sinCambios,
    omitidos: clientes.omitidos + expedientes.omitidos,
    eliminados: clientes.eliminados + expedientes.eliminados,
    errores: [...clientes.errores.map((e) => `Cliente · ${e}`), ...expedientes.errores.map((e) => `Expediente · ${e}`)].slice(0, 50),
    totalErrores: clientes.totalErrores + expedientes.totalErrores,
    avisos: [...clientes.avisos, ...expedientes.avisos].slice(0, 30),
    muestra: [...marcar(clientes, "Cliente"), ...marcar(expedientes, "Expediente")].slice(0, 40),
  };
}

async function ejecutarImportacion(tx: Ejecutor, idAdmin: number, p: z.infer<typeof esquemaPaquete>, modo: Modo, inf: Informe, opciones: OpcionesImportacion = {}): Promise<Informe> {
  switch (p.seccion) {
    case "clientes":
      return importarClientes(tx, p.datos, modo, inf);
    case "expedientes":
      return importarExpedientes(tx, idAdmin, p.datos, modo, inf);
    case "clientes_expedientes": {
      // Primero los clientes (con todos sus datos) y después los expedientes, que ya los encuentran para enlazarse
      const marcado = (tipo: string) => p.datos.filter((d) => (d as { _tipo?: string } | null)?._tipo === tipo);
      const cls = marcado("cliente");
      const exps = marcado("expediente");
      const infClientes = await importarClientes(tx, cls, modo, nuevoInforme("clientes", modo, cls.length));
      const infExpedientes = await importarExpedientes(tx, idAdmin, exps, modo, nuevoInforme("expedientes", modo, exps.length));
      return unirInformes(inf, infClientes, infExpedientes);
    }
    case "marcas_modelos":
      return importarMarcasModelos(tx, p.datos, modo, inf);
    case "tipos_venta":
      return importarTiposVenta(tx, p.datos, modo, inf);
    case "estados":
      return importarEstados(tx, p.datos, modo, inf);
    case "tiendas":
      return importarTiendas(tx, p.datos, modo, inf);
    case "planes":
      return importarPlanes(tx, p.datos, p.mapas, modo, inf, opciones.crearCatalogo ?? false);
    case "plantillas_tarifas":
      return importarPlantillasTarifas(tx, p.datos, modo, inf);
    case "plantillas_plan":
      return importarPlantillasPlan(tx, p.datos, modo, inf);
    case "rejillas":
      return importarRejillas(tx, p.datos, modo, inf);
    case "ajustes":
      return importarAjustes(tx, p.datos, modo, inf);
    default:
      throw new HttpError(400, "Sección no importable");
  }
}

/* ---- Clientes ---- */

const filaCliente = z.object({
  dni: texto,
  nombre: z.string().trim().min(1, "falta el nombre").max(255),
  fechaNacimiento: fechaIso,
  domicilio: texto,
  poblacion: texto,
  codigoPostal: texto,
  tienda: texto,
  emails: z.array(z.object({ email: z.string().trim().min(1).max(255), tipo: texto })).default([]),
  telefonos: z.array(z.object({ telefono: z.string().trim().min(1).max(50), tipo: texto })).default([]),
});

async function importarClientes(tx: Ejecutor, datos: unknown[], modo: Modo, inf: Informe): Promise<Informe> {
  const existentes = await tx.select().from(clientes).where(isNull(clientes.eliminadoEn));
  const porDni = new Map<string, (typeof existentes)[number]>();
  const porNombre = new Map<string, (typeof existentes)[number]>();
  for (const c of existentes) {
    if (normDni(c.dni)) porDni.set(normDni(c.dni), c);
    else porNombre.set(norm(c.nombre), c);
  }
  const tiendasPorNombre = new Map((await tx.select().from(tiendas).where(isNull(tiendas.eliminadoEn))).map((t) => [norm(t.nombre), t.idTienda]));
  const emails = await tx.select().from(emailsClientes);
  const tels = await tx.select().from(telefonosClientes);
  const coincidentes = new Set<number>();
  const vistos = new Set<string>();

  for (let i = 0; i < datos.length; i++) {
    const r = filaCliente.safeParse(datos[i]);
    if (!r.success) {
      error(inf, `${filaN(i)}: ${motivoZod(r.error)}`);
      continue;
    }
    const f = r.data;
    const dni = vacioANull(f.dni);
    const clave = dni ? `d:${normDni(dni)}` : `n:${norm(f.nombre)}`;
    if (vistos.has(clave)) {
      error(inf, `${filaN(i)}: «${f.nombre}» está repetido en el archivo.`);
      continue;
    }
    vistos.add(clave);
    let tiendaId: number | null | undefined;
    const nombreTienda = vacioANull(f.tienda);
    if (nombreTienda) {
      tiendaId = tiendasPorNombre.get(norm(nombreTienda)) ?? null;
      if (tiendaId === null) aviso(inf, `La tienda «${nombreTienda}» no existe: esos clientes se importan sin tienda (importa antes las tiendas).`);
    }
    const existente = dni ? porDni.get(normDni(dni)) : porNombre.get(norm(f.nombre));
    const emailsNuevos = f.emails.map((e) => ({ email: e.email.trim(), tipo: vacioANull(e.tipo) ?? "Principal" }));
    const telsNuevos = f.telefonos.map((t) => ({ telefono: t.telefono.trim(), tipo: vacioANull(t.tipo) ?? "Principal" }));

    if (existente) {
      coincidentes.add(existente.id);
      if (modo === "anadir") {
        inf.omitidos++;
        nota(inf, "omite", `${f.nombre}: ya existe, se deja como está`);
        continue;
      }
      const cambios: Partial<typeof clientes.$inferInsert> = {};
      if (f.nombre.trim() !== (existente.nombre ?? "")) cambios.nombre = f.nombre.trim();
      const poner = <K extends "domicilio" | "poblacion" | "codigoPostal">(k: K, v: string | null | undefined) => {
        const n = vacioANull(v);
        if (n !== null && n !== (existente[k] ?? null)) cambios[k] = n;
      };
      poner("domicilio", f.domicilio);
      poner("poblacion", f.poblacion);
      poner("codigoPostal", f.codigoPostal);
      if (f.fechaNacimiento && f.fechaNacimiento !== existente.fechaDeNacimiento) cambios.fechaDeNacimiento = f.fechaNacimiento;
      if (tiendaId && tiendaId !== existente.tiendaId) cambios.tiendaId = tiendaId;
      if (dni && dni !== (existente.dni ?? "")) cambios.dni = dni;
      const emailsActuales = emails.filter((e) => e.idCliente === existente.id).map((e) => e.email.toLowerCase()).sort().join("|");
      const telsActuales = tels.filter((t) => t.idCliente === existente.id).map((t) => t.telefono).sort().join("|");
      const cambianEmails = emailsNuevos.length > 0 && emailsNuevos.map((e) => e.email.toLowerCase()).sort().join("|") !== emailsActuales;
      const cambianTels = telsNuevos.length > 0 && telsNuevos.map((t) => t.telefono).sort().join("|") !== telsActuales;
      if (Object.keys(cambios).length === 0 && !cambianEmails && !cambianTels) {
        inf.sinCambios++;
        continue;
      }
      if (Object.keys(cambios).length > 0) await tx.update(clientes).set(cambios).where(eq(clientes.id, existente.id));
      if (cambianEmails) {
        await tx.delete(emailsClientes).where(eq(emailsClientes.idCliente, existente.id));
        await tx.insert(emailsClientes).values(emailsNuevos.map((e) => ({ idCliente: existente.id, email: e.email, tipoEmail: e.tipo })));
      }
      if (cambianTels) {
        await tx.delete(telefonosClientes).where(eq(telefonosClientes.idCliente, existente.id));
        await tx.insert(telefonosClientes).values(telsNuevos.map((t) => ({ idCliente: existente.id, telefono: t.telefono, tipoTelefono: t.tipo })));
      }
      inf.actualizados++;
      nota(inf, "actualiza", `${f.nombre}: se actualiza`);
      continue;
    }

    const [nuevo] = await tx
      .insert(clientes)
      .values({ clienteId: randomUUID(), dni, nombre: f.nombre.trim(), fechaDeNacimiento: f.fechaNacimiento ?? null, domicilio: vacioANull(f.domicilio), poblacion: vacioANull(f.poblacion), codigoPostal: vacioANull(f.codigoPostal), tiendaId: tiendaId ?? null })
      .returning({ id: clientes.id });
    if (emailsNuevos.length > 0) await tx.insert(emailsClientes).values(emailsNuevos.map((e) => ({ idCliente: nuevo.id, email: e.email, tipoEmail: e.tipo })));
    if (telsNuevos.length > 0) await tx.insert(telefonosClientes).values(telsNuevos.map((t) => ({ idCliente: nuevo.id, telefono: t.telefono, tipoTelefono: t.tipo })));
    inf.nuevos++;
    nota(inf, "nuevo", `${f.nombre}: cliente nuevo`);
  }

  if (modo === "sustituir") {
    const sobran = existentes.filter((c) => !coincidentes.has(c.id));
    if (sobran.length > 0) {
      await tx.update(clientes).set({ eliminadoEn: new Date() }).where(inArray(clientes.id, sobran.map((c) => c.id)));
      inf.eliminados = sobran.length;
      for (const c of sobran.slice(0, 5)) nota(inf, "elimina", `${c.nombre ?? "(sin nombre)"}: no está en el archivo, se elimina`);
      aviso(inf, "Los clientes eliminados siguen vinculados a sus expedientes (el borrado es lógico y se puede recuperar con una copia de seguridad).");
    }
  }
  return inf;
}

/* ---- Catálogos genéricos (tipos de venta, estados, tiendas) ---- */

interface ConfigCatalogo<Fila, Existente> {
  esquema: z.ZodType<Fila>;
  cargar: (tx: Ejecutor) => Promise<Existente[]>;
  clave: (f: Fila) => string;
  claveExistente: (e: Existente) => string;
  etiqueta: (f: Fila) => string;
  cambios: (e: Existente, f: Fila) => Record<string, unknown> | null;
  crear: (tx: Ejecutor, f: Fila) => Promise<void>;
  actualizar: (tx: Ejecutor, e: Existente, cambios: Record<string, unknown>) => Promise<void>;
  eliminar: (tx: Ejecutor, es: Existente[]) => Promise<void>;
  etiquetaExistente: (e: Existente) => string;
}

async function importarCatalogo<Fila, Existente>(tx: Ejecutor, datos: unknown[], modo: Modo, inf: Informe, c: ConfigCatalogo<Fila, Existente>): Promise<Informe> {
  const existentes = await c.cargar(tx);
  const porClave = new Map(existentes.map((e) => [c.claveExistente(e), e]));
  const vistos = new Set<string>();
  const coincidentes = new Set<Existente>();
  for (let i = 0; i < datos.length; i++) {
    const r = c.esquema.safeParse(datos[i]);
    if (!r.success) {
      error(inf, `${filaN(i)}: ${motivoZod(r.error as z.ZodError)}`);
      continue;
    }
    const f = r.data;
    const k = c.clave(f);
    if (vistos.has(k)) {
      error(inf, `${filaN(i)}: «${c.etiqueta(f)}» está repetido en el archivo.`);
      continue;
    }
    vistos.add(k);
    const e = porClave.get(k);
    if (!e) {
      await c.crear(tx, f);
      inf.nuevos++;
      nota(inf, "nuevo", `${c.etiqueta(f)}: nuevo`);
      continue;
    }
    coincidentes.add(e);
    if (modo === "anadir") {
      inf.omitidos++;
      nota(inf, "omite", `${c.etiqueta(f)}: ya existe`);
      continue;
    }
    const cambios = c.cambios(e, f);
    if (!cambios) {
      inf.sinCambios++;
      continue;
    }
    await c.actualizar(tx, e, cambios);
    inf.actualizados++;
    nota(inf, "actualiza", `${c.etiqueta(f)}: se actualiza`);
  }
  if (modo === "sustituir") {
    const sobran = existentes.filter((e) => !coincidentes.has(e));
    if (sobran.length > 0) {
      await c.eliminar(tx, sobran);
      inf.eliminados = sobran.length;
      for (const e of sobran.slice(0, 5)) nota(inf, "elimina", `${c.etiquetaExistente(e)}: no está en el archivo, se elimina`);
    }
  }
  return inf;
}

const diferencias = (pares: [string, unknown, unknown][]): Record<string, unknown> | null => {
  const c: Record<string, unknown> = {};
  for (const [k, actual, nuevo] of pares) if (nuevo !== undefined && nuevo !== null && nuevo !== actual) c[k] = nuevo;
  return Object.keys(c).length > 0 ? c : null;
};

function importarTiendas(tx: Ejecutor, datos: unknown[], modo: Modo, inf: Informe) {
  type F = { nombre: string; ciudad?: string | null };
  return importarCatalogo<F, typeof tiendas.$inferSelect>(tx, datos, modo, inf, {
    esquema: z.object({ nombre: z.string().trim().min(1, "falta el nombre").max(255), ciudad: texto }),
    cargar: (t) => t.select().from(tiendas).where(isNull(tiendas.eliminadoEn)),
    clave: (f) => norm(f.nombre),
    claveExistente: (e) => norm(e.nombre),
    etiqueta: (f) => f.nombre,
    etiquetaExistente: (e) => e.nombre,
    cambios: (e, f) => diferencias([["ciudad", e.ciudad, vacioANull(f.ciudad)]]),
    crear: async (t, f) => void (await t.insert(tiendas).values({ nombre: f.nombre.trim(), ciudad: vacioANull(f.ciudad) })),
    actualizar: async (t, e, c) => void (await t.update(tiendas).set(c).where(eq(tiendas.idTienda, e.idTienda))),
    eliminar: async (t, es) => void (await t.update(tiendas).set({ eliminadoEn: new Date() }).where(inArray(tiendas.idTienda, es.map((x) => x.idTienda)))),
  });
}

function importarEstados(tx: Ejecutor, datos: unknown[], modo: Modo, inf: Informe) {
  type F = { nombre: string; predeterminado?: boolean | null; clase?: "VN" | "VO" | null; subtipoVo?: string | null };
  return importarCatalogo<F, typeof estadoVehiculo.$inferSelect>(tx, datos, modo, inf, {
    esquema: z.object({ nombre: z.string().trim().min(1, "falta el nombre").max(100), predeterminado: z.boolean().nullish(), clase: z.enum(["VN", "VO"]).nullish(), subtipoVo: texto }),
    cargar: (t) => t.select().from(estadoVehiculo).where(isNull(estadoVehiculo.eliminadoEn)),
    clave: (f) => norm(f.nombre),
    claveExistente: (e) => norm(e.nombreEstadoVehiculo),
    etiqueta: (f) => f.nombre,
    etiquetaExistente: (e) => e.nombreEstadoVehiculo,
    cambios: (e, f) => diferencias([["clase", e.clase, f.clase], ["subtipoVo", e.subtipoVo, vacioANull(f.subtipoVo)], ["predeterminado", e.predeterminado, f.predeterminado]]),
    crear: async (t, f) => void (await t.insert(estadoVehiculo).values({ nombreEstadoVehiculo: f.nombre.trim(), clase: f.clase ?? "VN", subtipoVo: vacioANull(f.subtipoVo), predeterminado: false })),
    actualizar: async (t, e, c) => void (await t.update(estadoVehiculo).set(c).where(eq(estadoVehiculo.idEstadoVehiculo, e.idEstadoVehiculo))),
    eliminar: async (t, es) => void (await t.update(estadoVehiculo).set({ eliminadoEn: new Date() }).where(inArray(estadoVehiculo.idEstadoVehiculo, es.map((x) => x.idEstadoVehiculo)))),
  });
}

function importarTiposVenta(tx: Ejecutor, datos: unknown[], modo: Modo, inf: Informe) {
  type F = { nombre: string; color?: string | null; orden?: number | null; categoria?: "CONTADO" | "CREDITO" | "PREFERENCE" | "RENTING" | null; requiereRciAlMatricular?: boolean | null; cuentaParaTasa?: boolean | null };
  return importarCatalogo<F, typeof tipoDeVenta.$inferSelect>(tx, datos, modo, inf, {
    esquema: z.object({ nombre: z.string().trim().min(1, "falta el nombre").max(100), color: texto, orden: entero, categoria: z.enum(["CONTADO", "CREDITO", "PREFERENCE", "RENTING"]).nullish(), requiereRciAlMatricular: z.boolean().nullish(), cuentaParaTasa: z.boolean().nullish() }),
    cargar: (t) => t.select().from(tipoDeVenta).where(isNull(tipoDeVenta.eliminadoEn)),
    clave: (f) => norm(f.nombre),
    claveExistente: (e) => norm(e.nombreTipoVenta),
    etiqueta: (f) => f.nombre,
    etiquetaExistente: (e) => e.nombreTipoVenta,
    cambios: (e, f) => diferencias([["color", e.color, vacioANull(f.color)], ["orden", e.orden, f.orden], ["categoria", e.categoria, f.categoria], ["requiereRciAlMatricular", e.requiereRciAlMatricular, f.requiereRciAlMatricular], ["cuentaParaTasa", e.cuentaParaTasa, f.cuentaParaTasa]]),
    crear: async (t, f) =>
      void (await t.insert(tipoDeVenta).values({ nombreTipoVenta: f.nombre.trim(), color: vacioANull(f.color) ?? "#3b82f6", orden: f.orden ?? 0, categoria: f.categoria ?? "CONTADO", requiereRciAlMatricular: f.requiereRciAlMatricular ?? false, cuentaParaTasa: f.cuentaParaTasa ?? ["CREDITO", "PREFERENCE", "RENTING"].includes(f.categoria ?? "CONTADO") })),
    actualizar: async (t, e, c) => void (await t.update(tipoDeVenta).set(c).where(eq(tipoDeVenta.idTipoDeVenta, e.idTipoDeVenta))),
    eliminar: async (t, es) => void (await t.update(tipoDeVenta).set({ eliminadoEn: new Date() }).where(inArray(tipoDeVenta.idTipoDeVenta, es.map((x) => x.idTipoDeVenta)))),
  });
}

/* ---- Marcas y modelos ---- */

const filaMarca = z.object({
  marca: z.string().trim().min(1, "falta la marca").max(100),
  activo: z.boolean().nullish(),
  accesoRapido: z.boolean().nullish(),
  sistemaComisiones: z.boolean().nullish(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, "color no válido (usa #RRGGBB o #RRGGBBAA)").nullish(),
  punto: z.string().trim().max(8).nullish(),
  puntoColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, "color del punto no válido (usa #RRGGBB o #RRGGBBAA)").nullish(),
  modelos: z.array(z.object({ nombre: z.string().trim().min(1).max(150), accesoRapido: z.boolean().nullish(), ordenAccesoRapido: entero })).default([]),
});

async function importarMarcasModelos(tx: Ejecutor, datos: unknown[], modo: Modo, inf: Informe): Promise<Informe> {
  const ms = await tx.select().from(marcas).where(isNull(marcas.eliminadoEn));
  const mos = await tx.select().from(modelos).where(isNull(modelos.eliminadoEn));
  const porMarca = new Map(ms.map((m) => [norm(m.nombre), m]));
  const vistas = new Set<string>();
  const marcasUsadas = new Set<number>();
  const modelosUsados = new Set<number>();
  for (let i = 0; i < datos.length; i++) {
    const r = filaMarca.safeParse(datos[i]);
    if (!r.success) {
      error(inf, `${filaN(i)}: ${motivoZod(r.error)}`);
      continue;
    }
    const f = r.data;
    const k = norm(f.marca);
    if (vistas.has(k)) {
      error(inf, `${filaN(i)}: la marca «${f.marca}» está repetida en el archivo.`);
      continue;
    }
    vistas.add(k);
    let m = porMarca.get(k);
    if (!m) {
      const [nueva] = await tx.insert(marcas).values({ nombre: f.marca.trim(), activo: f.activo ?? true, accesoRapido: f.accesoRapido ?? false, sistemaComisiones: f.sistemaComisiones ?? false, color: f.color ?? null, punto: f.punto || null, puntoColor: f.puntoColor ?? null }).returning();
      m = nueva;
      inf.nuevos++;
      nota(inf, "nuevo", `Marca ${f.marca}: nueva`);
    } else if (modo === "anadir") {
      nota(inf, "omite", `Marca ${f.marca}: ya existe (se añaden solo sus modelos nuevos)`);
    } else {
      const cambios = diferencias([["activo", m.activo, f.activo], ["accesoRapido", m.accesoRapido, f.accesoRapido], ["sistemaComisiones", m.sistemaComisiones, f.sistemaComisiones], ["color", m.color, f.color], ["punto", m.punto, f.punto], ["puntoColor", m.puntoColor, f.puntoColor]]);
      if (cambios) {
        await tx.update(marcas).set(cambios).where(eq(marcas.idMarca, m.idMarca));
        inf.actualizados++;
        nota(inf, "actualiza", `Marca ${f.marca}: se actualiza`);
      } else inf.sinCambios++;
    }
    marcasUsadas.add(m.idMarca);
    const existentes = mos.filter((x) => x.marcaId === m.idMarca);
    const vistosM = new Set<string>();
    for (const fm of f.modelos) {
      const km = norm(fm.nombre);
      if (vistosM.has(km)) continue;
      vistosM.add(km);
      const e = existentes.find((x) => norm(x.nombreModelo) === km);
      if (!e) {
        await tx.insert(modelos).values({ marcaId: m.idMarca, nombreModelo: fm.nombre.trim(), accesoRapido: fm.accesoRapido ?? false, ordenAccesoRapido: fm.ordenAccesoRapido ?? 0 });
        inf.nuevos++;
        nota(inf, "nuevo", `Modelo ${f.marca} ${fm.nombre}: nuevo`);
        continue;
      }
      modelosUsados.add(e.idModelo);
      if (modo === "anadir") continue;
      const cambios = diferencias([["accesoRapido", e.accesoRapido, fm.accesoRapido], ["ordenAccesoRapido", e.ordenAccesoRapido, fm.ordenAccesoRapido]]);
      if (cambios) {
        await tx.update(modelos).set(cambios).where(eq(modelos.idModelo, e.idModelo));
        inf.actualizados++;
        nota(inf, "actualiza", `Modelo ${f.marca} ${fm.nombre}: se actualiza`);
      } else inf.sinCambios++;
    }
  }
  if (modo === "sustituir") {
    const marcasSobran = ms.filter((m) => !marcasUsadas.has(m.idMarca));
    const modelosSobran = mos.filter((x) => !modelosUsados.has(x.idModelo) && (marcasUsadas.has(x.marcaId ?? -1) || marcasSobran.some((m) => m.idMarca === x.marcaId)));
    // Los modelos de marcas conservadas que no están en el archivo también sobran
    if (marcasSobran.length > 0) await tx.update(marcas).set({ eliminadoEn: new Date() }).where(inArray(marcas.idMarca, marcasSobran.map((m) => m.idMarca)));
    if (modelosSobran.length > 0) await tx.update(modelos).set({ eliminadoEn: new Date() }).where(inArray(modelos.idModelo, modelosSobran.map((x) => x.idModelo)));
    inf.eliminados = marcasSobran.length + modelosSobran.length;
    for (const m of marcasSobran.slice(0, 5)) nota(inf, "elimina", `Marca ${m.nombre}: no está en el archivo, se elimina`);
  }
  return inf;
}

/* ---- Expedientes ---- */

const conceptoEsp = z.object({
  titulo: z.string().trim().min(1).max(200),
  importe_centimos: z.number().int(),
  descripcion: z.string().max(1000).default(""),
  evento: z.enum(["pedido", "afectacion", "rci", "matriculacion", "fecha_matriculacion", "facturacion", "entrega", "cobro"]),
  cobrado: z.boolean().default(false),
});
const filaExpediente = z.object({
  cliente: z.object({ dni: texto, nombre: texto }).nullish(),
  marca: texto,
  modelo: texto,
  tipoVenta: texto,
  estado: texto,
  vendedor: texto,
  tienda: texto,
  fechaExpediente: fechaIso,
  fechaAfectacion: fechaIso,
  fechaMatriculacion: fechaIso,
  fechaEntrega: fechaIso,
  fechaRci: fechaIso,
  fechaFacturacion: fechaIso,
  matricula: texto,
  vin: texto,
  cobradoOtraFecha: z.boolean().nullish(),
  fechaCobrado: fechaIso,
  puntos: entero,
  comisionCocheManual: entero,
  comisionFinanciacionManual: entero,
  conceptosEspeciales: z.array(conceptoEsp).nullish(),
});

async function importarExpedientes(tx: Ejecutor, idAdmin: number, datos: unknown[], modo: Modo, inf: Informe): Promise<Informe> {
  const existentes = await tx.query.expedientes.findMany({ where: isNull(expedientes.eliminadoEn), with: { cliente: true } });
  const porVin = new Map<string, (typeof existentes)[number]>();
  const porMat = new Map<string, (typeof existentes)[number]>();
  const porCompuesta = new Map<string, (typeof existentes)[number]>();
  const compuesta = (dni: string | null | undefined, fecha: string | null | undefined, idModelo: number | null | undefined, idTipo: number | null | undefined) => `${normDni(dni)}|${fecha ?? ""}|${idModelo ?? ""}|${idTipo ?? ""}`;
  for (const e of existentes) {
    if (normVin(e.vin)) porVin.set(normVin(e.vin), e);
    if (normMatricula(e.matricula)) porMat.set(normMatricula(e.matricula), e);
    porCompuesta.set(compuesta(e.cliente?.dni, e.fechaExpediente, e.idModelo, e.idTipoDeVenta), e);
  }
  const ms = await tx.select().from(marcas).where(isNull(marcas.eliminadoEn));
  const mos = await tx.select().from(modelos).where(isNull(modelos.eliminadoEn));
  const tipos = await tx.select().from(tipoDeVenta).where(isNull(tipoDeVenta.eliminadoEn));
  const estados = await tx.select().from(estadoVehiculo).where(isNull(estadoVehiculo.eliminadoEn));
  const tiendasLista = await tx.select().from(tiendas).where(isNull(tiendas.eliminadoEn));
  const us = await tx.select({ id: usuarios.idUsuario, email: usuarios.loginEmail }).from(usuarios);
  const cls = await tx.select().from(clientes).where(isNull(clientes.eliminadoEn));
  const clientesPorDni = new Map(cls.filter((c) => normDni(c.dni)).map((c) => [normDni(c.dni), c.id]));
  const clientesPorNombre = new Map(cls.filter((c) => !normDni(c.dni)).map((c) => [norm(c.nombre), c.id]));
  const estadoPredeterminado = estados.find((e) => e.predeterminado)?.idEstadoVehiculo ?? null;

  type Accion = { tipo: "crear"; valores: typeof expedientes.$inferInsert } | { tipo: "actualizar"; id: number; cambios: Partial<typeof expedientes.$inferInsert> };
  const acciones: Accion[] = [];
  const coincidentes = new Set<number>();
  const vistos = new Set<string>();

  for (let i = 0; i < datos.length; i++) {
    const r = filaExpediente.safeParse(datos[i]);
    if (!r.success) {
      error(inf, `${filaN(i)}: ${motivoZod(r.error)}`);
      continue;
    }
    const f = r.data;
    // Referencias por nombre
    let idModelo: number | null = null;
    const nMarca = vacioANull(f.marca);
    const nModelo = vacioANull(f.modelo);
    if (nModelo) {
      const marca = nMarca ? ms.find((m) => norm(m.nombre) === norm(nMarca)) : null;
      const candidatos = mos.filter((x) => norm(x.nombreModelo) === norm(nModelo) && (!nMarca || x.marcaId === marca?.idMarca));
      if (candidatos.length === 0) {
        error(inf, `${filaN(i)}: el modelo «${[nMarca, nModelo].filter(Boolean).join(" ")}» no existe. Importa antes «Marcas y modelos».`);
        continue;
      }
      idModelo = candidatos[0].idModelo;
    }
    const nTipo = vacioANull(f.tipoVenta);
    const tipo = nTipo ? tipos.find((t) => norm(t.nombreTipoVenta) === norm(nTipo)) : undefined;
    if (!tipo) {
      error(inf, `${filaN(i)}: el tipo de venta «${nTipo ?? "(vacío)"}» no existe. Importa antes «Tipos de venta».`);
      continue;
    }
    const nEstado = vacioANull(f.estado);
    let idEstado: number | null = estadoPredeterminado;
    if (nEstado) {
      const est = estados.find((e) => norm(e.nombreEstadoVehiculo) === norm(nEstado));
      if (!est) {
        error(inf, `${filaN(i)}: el estado de vehículo «${nEstado}» no existe. Importa antes «Estados de vehículo».`);
        continue;
      }
      idEstado = est.idEstadoVehiculo;
    }
    const nVend = vacioANull(f.vendedor);
    let idVendedor = idAdmin;
    if (nVend) {
      const u = us.find((x) => x.email.toLowerCase() === nVend.toLowerCase());
      if (!u) {
        error(inf, `${filaN(i)}: el vendedor «${nVend}» no existe en esta aplicación.`);
        continue;
      }
      idVendedor = u.id;
    } else aviso(inf, "Hay expedientes sin vendedor en el archivo: se asignan a quien importa.");
    const nTienda = vacioANull(f.tienda);
    let idTienda: number | null = null;
    if (nTienda) {
      idTienda = tiendasLista.find((t) => norm(t.nombre) === norm(nTienda))?.idTienda ?? null;
      if (idTienda === null) aviso(inf, `La tienda «${nTienda}» no existe: esos expedientes se importan sin tienda.`);
    }
    // Regla de la RCI (igual que en pantalla)
    if (tipo.requiereRciAlMatricular && !f.fechaRci && (f.fechaMatriculacion || f.fechaFacturacion)) {
      error(inf, `${filaN(i)}: los pagos «${tipo.nombreTipoVenta}» exigen la fecha RCI para poder matricular o facturar.`);
      continue;
    }
    // Cliente (se crea si no existe)
    const dniCli = vacioANull(f.cliente?.dni);
    const nomCli = vacioANull(f.cliente?.nombre);
    let idCliente: number | null = null;
    let clienteNuevo = false;
    if (dniCli || nomCli) {
      idCliente = (dniCli ? clientesPorDni.get(normDni(dniCli)) : undefined) ?? (nomCli && !dniCli ? clientesPorNombre.get(norm(nomCli)) : undefined) ?? null;
      if (idCliente === null) {
        if (!nomCli) {
          error(inf, `${filaN(i)}: el cliente con DNI ${dniCli} no existe y el archivo no trae su nombre. Importa antes «Clientes».`);
          continue;
        }
        clienteNuevo = true;
      }
    }

    // Clave de coincidencia
    const vin = normVin(f.vin);
    const mat = normMatricula(f.matricula);
    const clave = vin ? `v:${vin}` : mat ? `m:${mat}` : `c:${compuesta(dniCli, f.fechaExpediente, idModelo, tipo.idTipoDeVenta)}`;
    if (vistos.has(clave)) {
      error(inf, `${filaN(i)}: expediente repetido en el archivo (${vin || mat || "mismo cliente, fecha y modelo"}).`);
      continue;
    }
    vistos.add(clave);
    const existente = vin ? porVin.get(vin) : mat ? porMat.get(mat) : porCompuesta.get(compuesta(dniCli, f.fechaExpediente, idModelo, tipo.idTipoDeVenta));
    const etiqueta = `${nomCli ?? dniCli ?? "Sin cliente"} · ${[nMarca, nModelo].filter(Boolean).join(" ") || "sin modelo"}${f.matricula ? ` · ${f.matricula}` : ""}`;

    const resolverCliente = async (): Promise<number | null> => {
      if (!clienteNuevo) return idCliente;
      const [c] = await tx.insert(clientes).values({ clienteId: randomUUID(), dni: dniCli, nombre: nomCli, tiendaId: idTienda }).returning({ id: clientes.id });
      if (dniCli) clientesPorDni.set(normDni(dniCli), c.id);
      else if (nomCli) clientesPorNombre.set(norm(nomCli), c.id);
      aviso(inf, "Se crean los clientes que aún no existían (solo con DNI y nombre).");
      return c.id;
    };
    const valores = {
      idUsuario: idVendedor,
      idModelo,
      idTienda,
      idTipoDeVenta: tipo.idTipoDeVenta,
      idEstadoVehiculo: idEstado,
      fechaExpediente: f.fechaExpediente ?? null,
      fechaAfectacion: f.fechaAfectacion ?? null,
      fechaMatriculacion: f.fechaMatriculacion ?? null,
      fechaEntrega: f.fechaEntrega ?? null,
      fechaRci: f.fechaRci ?? null,
      fechaFacturacion: f.fechaFacturacion ?? null,
      matricula: vacioANull(f.matricula),
      vin: vacioANull(f.vin),
      cobradoOtraFecha: f.cobradoOtraFecha ?? false,
      fechaCobrado: f.fechaCobrado ?? null,
      puntos: f.puntos ?? null,
      comisionCocheManual: f.comisionCocheManual ?? null,
      comisionFinanciacionManual: f.comisionFinanciacionManual ?? null,
      conceptosEspeciales: f.conceptosEspeciales ?? [],
    } satisfies Partial<typeof expedientes.$inferInsert>;

    if (!existente) {
      acciones.push({ tipo: "crear", valores: { ...valores, idCliente: await resolverCliente(), fechaExpediente: valores.fechaExpediente ?? new Date().toISOString().slice(0, 10) } });
      inf.nuevos++;
      nota(inf, "nuevo", `${etiqueta}: expediente nuevo`);
      continue;
    }
    coincidentes.add(existente.idExpediente);
    if (modo === "anadir") {
      inf.omitidos++;
      nota(inf, "omite", `${etiqueta}: ya existe`);
      continue;
    }
    const cambios: Partial<typeof expedientes.$inferInsert> = {};
    const poner = <K extends keyof typeof valores>(k: K) => {
      const nuevo = valores[k];
      if (nuevo === null || nuevo === undefined) return;
      if (JSON.stringify(nuevo) !== JSON.stringify((existente as Record<string, unknown>)[k as string])) (cambios as Record<string, unknown>)[k as string] = nuevo;
    };
    (["idUsuario", "idModelo", "idTipoDeVenta", "idEstadoVehiculo", "fechaExpediente", "fechaAfectacion", "fechaMatriculacion", "fechaEntrega", "fechaRci", "fechaFacturacion", "matricula", "vin", "fechaCobrado", "puntos", "comisionCocheManual", "comisionFinanciacionManual"] as const).forEach(poner);
    if (valores.cobradoOtraFecha !== existente.cobradoOtraFecha) cambios.cobradoOtraFecha = valores.cobradoOtraFecha;
    if (valores.conceptosEspeciales.length > 0 && JSON.stringify(valores.conceptosEspeciales) !== JSON.stringify(existente.conceptosEspeciales)) cambios.conceptosEspeciales = valores.conceptosEspeciales;
    if (idTienda && idTienda !== existente.idTienda) cambios.idTienda = idTienda;
    if ((idCliente !== null || clienteNuevo) && idCliente !== existente.idCliente) cambios.idCliente = await resolverCliente();
    if (Object.keys(cambios).length === 0) {
      inf.sinCambios++;
      continue;
    }
    acciones.push({ tipo: "actualizar", id: existente.idExpediente, cambios });
    inf.actualizados++;
    nota(inf, "actualiza", `${etiqueta}: se actualiza`);
  }

  const sobran = modo === "sustituir" ? existentes.filter((e) => !coincidentes.has(e.idExpediente)) : [];
  const idsAntes = [...acciones.filter((a): a is Extract<Accion, { tipo: "actualizar" }> => a.tipo === "actualizar").map((a) => a.id), ...sobran.map((e) => e.idExpediente)];
  // Las comisiones y puntos se recalculan una sola vez al terminar
  await conRecalculo(tx, idsAntes, "Importación de expedientes", async (t) => {
    const idsDespues: number[] = [];
    const crear = acciones.filter((a): a is Extract<Accion, { tipo: "crear" }> => a.tipo === "crear");
    for (let i = 0; i < crear.length; i += 300) {
      const nuevos = await t.insert(expedientes).values(crear.slice(i, i + 300).map((a) => a.valores)).returning({ id: expedientes.idExpediente });
      idsDespues.push(...nuevos.map((x) => x.id));
    }
    for (const a of acciones) {
      if (a.tipo !== "actualizar") continue;
      await t.update(expedientes).set(a.cambios).where(eq(expedientes.idExpediente, a.id));
      idsDespues.push(a.id);
    }
    if (sobran.length > 0) await t.update(expedientes).set({ eliminadoEn: new Date() }).where(inArray(expedientes.idExpediente, sobran.map((e) => e.idExpediente)));
    return { valor: null, idsDespues };
  });
  if (sobran.length > 0) {
    inf.eliminados = sobran.length;
    for (const e of sobran.slice(0, 5)) nota(inf, "elimina", `Expediente nº ${e.idExpediente}${e.matricula ? ` (${e.matricula})` : ""}: no está en el archivo, se elimina`);
  }
  return inf;
}

/* ---- Planes de comisionamiento ---- */

async function importarPlanes(tx: Ejecutor, datos: unknown[], mapasCrudos: unknown, modo: Modo, inf: Informe, crearCatalogo = false): Promise<Informe> {
  const mapas = z
    .object({ marcas: z.record(z.string(), z.string()).default({}), modelos: z.record(z.string(), z.object({ marca: z.string(), modelo: z.string() })).default({}), usuarios: z.record(z.string(), z.string()).default({}) })
    .safeParse(mapasCrudos ?? {});
  const mp = mapas.success ? mapas.data : { marcas: {}, modelos: {}, usuarios: {} };
  const ms = await tx.select().from(marcas).where(isNull(marcas.eliminadoEn));
  const mos = await tx.select().from(modelos).where(isNull(modelos.eliminadoEn));
  const us = await tx.select({ id: usuarios.idUsuario, email: usuarios.loginEmail }).from(usuarios);
  const existentes = await tx.select().from(commissionPlans);

  // Lo que el archivo usa y no existe aquí: se enseña en la vista previa y, si se elige, se crea antes de importar los planes
  const marcaFalta = (nombre: string) => !ms.some((x) => norm(x.nombre) === norm(nombre));
  const modeloFalta = (marca: string, modelo: string) => {
    const m = ms.find((x) => norm(x.nombre) === norm(marca));
    return !mos.some((x) => norm(x.nombreModelo) === norm(modelo) && (!m || x.marcaId === m.idMarca));
  };
  const faltaMarcas = [...new Set(Object.values(mp.marcas).filter((n) => n.trim() !== "" && marcaFalta(n)))];
  const faltaModelos = [...new Set(Object.values(mp.modelos).filter((x) => x.modelo.trim() !== "" && modeloFalta(x.marca, x.modelo)).map((x) => `${x.marca} ${x.modelo}`.trim()))];
  const faltaVendedores = [...new Set(Object.values(mp.usuarios).filter((e) => !us.some((u) => u.email.toLowerCase() === e.toLowerCase())))];
  if (faltaMarcas.length + faltaModelos.length + faltaVendedores.length > 0) inf.faltan = { marcas: faltaMarcas, modelos: faltaModelos, vendedores: faltaVendedores };
  if (crearCatalogo) {
    for (const nombre of faltaMarcas) {
      const [m] = await tx.insert(marcas).values({ nombre }).returning();
      ms.push(m);
      nota(inf, "nuevo", `Marca «${nombre}»: se crea porque los planes la usan`);
    }
    for (const x of Object.values(mp.modelos)) {
      if (x.modelo.trim() === "" || !modeloFalta(x.marca, x.modelo)) continue;
      let marca = ms.find((m) => norm(m.nombre) === norm(x.marca));
      if (!marca && x.marca.trim() !== "") {
        [marca] = await tx.insert(marcas).values({ nombre: x.marca }).returning();
        ms.push(marca);
      }
      const [mo] = await tx.insert(modelos).values({ marcaId: marca?.idMarca ?? null, nombreModelo: x.modelo }).returning();
      mos.push(mo);
      nota(inf, "nuevo", `Modelo «${`${x.marca} ${x.modelo}`.trim()}»: se crea porque los planes lo usan`);
    }
  }

  const faltan = new Set<string>();
  const idMarca = (viejo: number | null | undefined): number | null => {
    if (viejo === null || viejo === undefined) return null;
    const nombre = mp.marcas[String(viejo)];
    const m = nombre ? ms.find((x) => norm(x.nombre) === norm(nombre)) : undefined;
    if (!m) faltan.add(`marca «${nombre ?? `#${viejo}`}»`);
    return m?.idMarca ?? null;
  };
  const idModelo = (viejo: number | null | undefined): number | null => {
    if (viejo === null || viejo === undefined) return null;
    const x = mp.modelos[String(viejo)];
    const marca = x ? ms.find((m) => norm(m.nombre) === norm(x.marca)) : undefined;
    const mo = x ? mos.find((m) => norm(m.nombreModelo) === norm(x.modelo) && (!marca || m.marcaId === marca.idMarca)) : undefined;
    if (!mo) faltan.add(`modelo «${x ? `${x.marca} ${x.modelo}`.trim() : `#${viejo}`}»`);
    return mo?.idModelo ?? null;
  };
  const idUsuario = (viejo: number): number | null => {
    const email = mp.usuarios[String(viejo)];
    const u = email ? us.find((x) => x.email.toLowerCase() === email.toLowerCase()) : undefined;
    if (!u) faltan.add(`vendedor «${email ?? `#${viejo}`}»`);
    return u?.id ?? null;
  };

  const vistos = new Set<string>();
  for (let i = 0; i < datos.length; i++) {
    const bruto = datos[i] as Record<string, unknown> | null;
    const nombre = typeof bruto?.nombre === "string" ? bruto.nombre : `plan ${i + 1}`;
    const r = esquemaPlan.safeParse(bruto);
    if (!r.success) {
      error(inf, `${filaN(i)} («${nombre}»): ${motivoZod(r.error)}`);
      continue;
    }
    const p = r.data;
    const clave = `${norm(p.nombre)}|${p.fechaInicio}|${p.fechaFin}`;
    if (vistos.has(clave)) {
      error(inf, `${filaN(i)}: el plan «${p.nombre}» está repetido en el archivo.`);
      continue;
    }
    vistos.add(clave);
    faltan.clear();
    const existente = existentes.find((e) => norm(e.nombre) === norm(p.nombre) && e.fechaInicio === p.fechaInicio && e.fechaFin === p.fechaFin);
    const convertido = {
      ...p,
      vendedores: p.vendedores.map((v) => ({ ...v, idUsuario: idUsuario(v.idUsuario) as number })),
      puntosModelo: p.puntosModelo.map((x) => ({ ...x, idModelo: idModelo(x.idModelo) as number })),
      tarifasVN: p.tarifasVN.map((x) => ({ ...x, idModelo: idModelo(x.idModelo) as number })),
      tasas: p.tasas.map((x) => ({ ...x, idMarca: idMarca(x.idMarca) as number })),
      financiacion: p.financiacion.map((x) => ({ ...x, idMarca: idMarca(x.idMarca) as number })),
      preference: p.preference.map((x) => ({ ...x, idMarca: idMarca(x.idMarca), idModelo: idModelo(x.idModelo) })),
      reglas: p.reglas.map((x) => ({ ...x, idMarca: idMarca(x.idMarca), idModelo: idModelo(x.idModelo) })),
      bonus: p.bonus.map((x) => ({ ...x, idMarca: idMarca(x.idMarca), idModelo: idModelo(x.idModelo) })),
      promociones: p.promociones.map((x) => ({ ...x, id: undefined as number | undefined })),
    };
    if (faltan.size > 0) {
      error(inf, `${filaN(i)} («${p.nombre}»): faltan en esta aplicación: ${[...faltan].slice(0, 6).join(", ")}. Marca «Crear los modelos y marcas que faltan» o importa antes los catálogos (los vendedores hay que crearlos como usuarios).`);
      continue;
    }
    if (existente) {
      if (modo === "anadir") {
        inf.omitidos++;
        nota(inf, "omite", `${p.nombre}: ya existe un plan con ese nombre y fechas`);
        continue;
      }
      // Se conservan las promociones que ya tenía (por nombre) para no romper los expedientes que las usan
      const actual = await leerPlan(tx, existente.idPlan);
      convertido.promociones = convertido.promociones.map((x) => ({ ...x, id: actual?.promociones.find((y) => norm(y.nombre) === norm(x.nombre))?.id }));
      try {
        await guardarPlan(tx, existente.idPlan, convertido);
      } catch (e) {
        error(inf, `${filaN(i)} («${p.nombre}»): ${e instanceof HttpError ? e.message : e instanceof Error ? e.message : "no se pudo actualizar"}`);
        continue;
      }
      inf.actualizados++;
      nota(inf, "actualiza", `${p.nombre}: el plan existente se sustituye por el del archivo`);
      continue;
    }
    try {
      await guardarPlan(tx, null, convertido);
    } catch (e) {
      error(inf, `${filaN(i)} («${p.nombre}»): ${e instanceof HttpError ? e.message : e instanceof Error ? e.message : "no se pudo crear"}`);
      continue;
    }
    inf.nuevos++;
    nota(inf, "nuevo", `${p.nombre} (${p.fechaInicio} a ${p.fechaFin}): plan nuevo`);
  }
  return inf;
}

/* ---- Plantillas de tarifas VN ---- */

async function importarPlantillasTarifas(tx: Ejecutor, datos: unknown[], modo: Modo, inf: Informe): Promise<Informe> {
  const existentes = await tx.select().from(plantillasTarifasVn);
  const vistos = new Set<string>();
  for (let i = 0; i < datos.length; i++) {
    const r = esquemaPlantilla.safeParse(datos[i]);
    if (!r.success) {
      error(inf, `${filaN(i)}: ${motivoZod(r.error)}`);
      continue;
    }
    const f = r.data;
    if (vistos.has(norm(f.nombre))) {
      error(inf, `${filaN(i)}: la plantilla «${f.nombre}» está repetida en el archivo.`);
      continue;
    }
    vistos.add(norm(f.nombre));
    if (f.datos.tarifas.length === 0) {
      error(inf, `${filaN(i)}: la plantilla «${f.nombre}» no tiene tarifas.`);
      continue;
    }
    const existente = existentes.find((e) => norm(e.nombre) === norm(f.nombre));
    if (!existente) {
      await tx.insert(plantillasTarifasVn).values({ nombre: f.nombre, descripcion: vacioANull(f.descripcion), sistema: false, datos: f.datos });
      inf.nuevos++;
      nota(inf, "nuevo", `${f.nombre} (${f.datos.tarifas.length} tarifas): plantilla nueva`);
      continue;
    }
    if (existente.sistema) {
      inf.omitidos++;
      nota(inf, "omite", `${f.nombre}: es una plantilla incluida con la aplicación y no se modifica`);
      continue;
    }
    if (modo === "anadir") {
      inf.omitidos++;
      nota(inf, "omite", `${f.nombre}: ya existe`);
      continue;
    }
    if (JSON.stringify(existente.datos) === JSON.stringify(f.datos) && (existente.descripcion ?? null) === vacioANull(f.descripcion)) {
      inf.sinCambios++;
      continue;
    }
    await tx.update(plantillasTarifasVn).set({ descripcion: vacioANull(f.descripcion), datos: f.datos, actualizadaEn: new Date() }).where(eq(plantillasTarifasVn.id, existente.id));
    inf.actualizados++;
    nota(inf, "actualiza", `${f.nombre}: se actualiza`);
  }
  return inf;
}

/* ---- Plantillas de planes ---- */

async function importarPlantillasPlan(tx: Ejecutor, datos: unknown[], modo: Modo, inf: Informe): Promise<Informe> {
  const existentes = await tx.select().from(plantillasPlan);
  const vistos = new Set<string>();
  for (let i = 0; i < datos.length; i++) {
    const r = esquemaPlantillaPlan.safeParse(datos[i]);
    if (!r.success) {
      error(inf, `${filaN(i)}: ${motivoZod(r.error)}`);
      continue;
    }
    const f = r.data;
    const clave = `${f.ambito}|${norm(f.nombre)}`;
    if (vistos.has(clave)) {
      error(inf, `${filaN(i)}: la plantilla «${f.nombre}» (${f.ambito}) está repetida en el archivo.`);
      continue;
    }
    vistos.add(clave);
    const existente = existentes.find((e) => e.ambito === f.ambito && norm(e.nombre) === norm(f.nombre));
    if (!existente) {
      await tx.insert(plantillasPlan).values({ ambito: f.ambito, nombre: f.nombre, descripcion: vacioANull(f.descripcion), datos: f.datos });
      inf.nuevos++;
      nota(inf, "nuevo", `${f.nombre} (${f.ambito}): plantilla nueva`);
      continue;
    }
    if (modo === "anadir") {
      inf.omitidos++;
      nota(inf, "omite", `${f.nombre} (${f.ambito}): ya existe`);
      continue;
    }
    if (JSON.stringify(existente.datos) === JSON.stringify(f.datos) && (existente.descripcion ?? null) === vacioANull(f.descripcion)) {
      inf.sinCambios++;
      continue;
    }
    await tx.update(plantillasPlan).set({ descripcion: vacioANull(f.descripcion), datos: f.datos, actualizadaEn: new Date() }).where(eq(plantillasPlan.id, existente.id));
    inf.actualizados++;
    nota(inf, "actualiza", `${f.nombre} (${f.ambito}): se actualiza`);
  }
  return inf;
}

/* ---- Rejillas del cotejo ---- */

const filaRejilla = z.object({
  vendedor: z.string().trim().min(1, "falta el vendedor"),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "mes no válido (AAAA-MM)"),
  origen: z.string().max(20).default("manual"),
  nombreArchivo: texto,
  totalHoja: entero,
  notas: texto,
  filas: z.array(z.object({ matricula: z.string().trim().min(1).max(50), cliente: texto, financiacion: texto, concepto: texto, importe: entero, textoOriginal: texto, confianza: entero })).default([]),
});

async function importarRejillas(tx: Ejecutor, datos: unknown[], modo: Modo, inf: Informe): Promise<Informe> {
  const us = await tx.select({ id: usuarios.idUsuario, email: usuarios.loginEmail }).from(usuarios);
  const existentes = await tx.select().from(rejillas);
  const vistos = new Set<string>();
  for (let i = 0; i < datos.length; i++) {
    const r = filaRejilla.safeParse(datos[i]);
    if (!r.success) {
      error(inf, `${filaN(i)}: ${motivoZod(r.error)}`);
      continue;
    }
    const f = r.data;
    const u = us.find((x) => x.email.toLowerCase() === f.vendedor.toLowerCase());
    if (!u) {
      error(inf, `${filaN(i)}: el vendedor «${f.vendedor}» no existe en esta aplicación.`);
      continue;
    }
    const clave = `${u.id}|${f.mes}`;
    if (vistos.has(clave)) {
      error(inf, `${filaN(i)}: ya hay otra rejilla de ${f.vendedor} para ${f.mes} en el archivo.`);
      continue;
    }
    vistos.add(clave);
    const existente = existentes.find((e) => e.idUsuario === u.id && e.mes === f.mes);
    const etiqueta = `${f.vendedor} · ${f.mes} (${f.filas.length} filas)`;
    if (existente && modo === "anadir") {
      inf.omitidos++;
      nota(inf, "omite", `${etiqueta}: ya existe`);
      continue;
    }
    if (existente) await tx.delete(rejillas).where(eq(rejillas.id, existente.id));
    const [cab] = await tx.insert(rejillas).values({ idUsuario: u.id, mes: f.mes, origen: f.origen, nombreArchivo: vacioANull(f.nombreArchivo), totalHoja: f.totalHoja ?? null, notas: vacioANull(f.notas) }).returning({ id: rejillas.id });
    if (f.filas.length > 0) {
      await tx.insert(rejillaFilas).values(f.filas.map((x) => ({ idRejilla: cab.id, matricula: x.matricula, cliente: vacioANull(x.cliente), financiacion: vacioANull(x.financiacion), concepto: vacioANull(x.concepto), importe: x.importe ?? null, textoOriginal: vacioANull(x.textoOriginal), confianza: x.confianza ?? null })));
    }
    if (existente) {
      inf.actualizados++;
      nota(inf, "actualiza", `${etiqueta}: se sustituye la rejilla existente`);
    } else {
      inf.nuevos++;
      nota(inf, "nuevo", `${etiqueta}: rejilla nueva`);
    }
  }
  return inf;
}

/* ---- Ajustes ---- */

async function importarAjustes(tx: Ejecutor, datos: unknown[], modo: Modo, inf: Informe): Promise<Informe> {
  const existentes = new Map((await tx.select().from(ajustes)).map((a) => [a.clave, a.valor]));
  for (let i = 0; i < datos.length; i++) {
    const r = z.object({ clave: z.string().trim().min(1).max(255), valor: z.string() }).safeParse(datos[i]);
    if (!r.success) {
      error(inf, `${filaN(i)}: ${motivoZod(r.error)}`);
      continue;
    }
    const { clave, valor } = r.data;
    if (CLAVE_SECRETA.test(clave)) {
      error(inf, `${filaN(i)}: el ajuste «${clave}» parece un dato secreto y no se importa.`);
      continue;
    }
    const actual = existentes.get(clave);
    if (actual === undefined) {
      await tx.insert(ajustes).values({ clave, valor });
      inf.nuevos++;
      nota(inf, "nuevo", `${clave}: nuevo ajuste`);
    } else if (modo === "anadir") {
      inf.omitidos++;
    } else if (actual === valor) {
      inf.sinCambios++;
    } else {
      await tx.update(ajustes).set({ valor }).where(eq(ajustes.clave, clave));
      inf.actualizados++;
      nota(inf, "actualiza", `${clave}: «${actual.slice(0, 30)}» → «${valor.slice(0, 30)}»`);
    }
  }
  return inf;
}

/** Texto en español de lo que va a ocurrir, para la confirmación antes de exportar. */
export function descripcionExportacion(seccion: Seccion, registros: number): string {
  const i = INFO_SECCIONES[seccion];
  return `Se van a exportar ${registros.toLocaleString("es-ES")} ${i.plural} a un archivo .json que se descargará en tu equipo.`;
}

export { and };
