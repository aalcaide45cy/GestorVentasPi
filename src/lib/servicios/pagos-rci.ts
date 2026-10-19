import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { adjuntos, clientes, expedientes, marcas, modelos, pagosRci, tipoDeVenta } from "@/db/schema";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import { parsearPagoRci, type PagoRciLeido } from "@/lib/documentos/pago-rci";
import { claveNif, limpiarNif, nifParecido, normalizarMatricula } from "@/lib/identificadores";
import { guardarAdjunto } from "./adjuntos";
import { actualizarExpedientes, comprobarAlcance } from "./expedientes-escritura";
import { esquemaActualizarExpediente } from "./expedientes";
import { mirarDocumento, ocrImagenes, tipoDeFichero } from "./ocr";

/**
 * Pagos de la financiera (RCI / Mobilize): la fecha de pago es la fecha de contratación de la financiación, así que fija la «fecha RCI»
 * del expediente. Se suben en masa; cada documento se lee, se busca su expediente (bastidor, matrícula y, sobre todo, el documento
 * del adquiriente) y, si no hay duda, se aplica. Lo dudoso queda «pendiente» para decidir a mano y lo que no es un pago se ignora
 * (pero se guarda para poder revisarlo). Todo se puede deshacer.
 */

export type EstadoPago = "aplicado" | "pendiente" | "ignorado";

export interface PagoRciDto {
  id: number;
  nombreArchivo: string;
  idAdjunto: number | null;
  estado: EstadoPago;
  motivo: string | null;
  numeroOperacion: string | null;
  fechaPago: string | null;
  nif: string | null;
  nombre: string | null;
  bastidor: string | null;
  matricula: string | null;
  marca: string | null;
  modelo: string | null;
  importeNominalCent: number | null;
  totalLiquidoCent: number | null;
  idExpediente: number | null;
  clienteExpediente: string | null;
  fechaRciAnterior: string | null;
  creadoEn: string;
  /** Solo al subir: el mismo pago ya estaba subido y no se ha vuelto a guardar. */
  duplicado?: boolean;
}

export interface CandidatoPago {
  id: number;
  cliente: string | null;
  dni: string | null;
  vehiculo: string | null;
  vin: string | null;
  matricula: string | null;
  fechaExpediente: string | null;
  fechaRci: string | null;
  financiado: boolean;
  motivo: string;
}

const filaADto = (f: typeof pagosRci.$inferSelect & { cliente?: string | null }): PagoRciDto => ({
  id: f.id,
  nombreArchivo: f.nombreArchivo,
  idAdjunto: f.idAdjunto,
  estado: f.estado as EstadoPago,
  motivo: f.motivo,
  numeroOperacion: f.numeroOperacion,
  fechaPago: f.fechaPago,
  nif: f.nif,
  nombre: f.nombre,
  bastidor: f.bastidor,
  matricula: f.matricula,
  marca: f.marca,
  modelo: f.modelo,
  importeNominalCent: f.importeNominalCent,
  totalLiquidoCent: f.totalLiquidoCent,
  idExpediente: f.idExpediente,
  clienteExpediente: f.cliente ?? null,
  fechaRciAnterior: f.fechaRciAnterior,
  creadoEn: f.creadoEn.toISOString(),
});

const visible = (usuario: UsuarioActual) => (esAdministrador(usuario.rol) ? undefined : eq(pagosRci.idUsuario, usuario.idUsuario));

async function leerPago(ej: Ejecutor, usuario: UsuarioActual, id: number): Promise<PagoRciDto> {
  const [f] = await ej
    .select({ p: pagosRci, cliente: clientes.nombre })
    .from(pagosRci)
    .leftJoin(expedientes, eq(expedientes.idExpediente, pagosRci.idExpediente))
    .leftJoin(clientes, eq(clientes.id, expedientes.idCliente))
    .where(and(eq(pagosRci.id, id), visible(usuario)));
  if (!f) throw new HttpError(404, "Pago no encontrado");
  return filaADto({ ...f.p, cliente: f.cliente });
}

export async function listarPagos(ej: Ejecutor, usuario: UsuarioActual): Promise<PagoRciDto[]> {
  const filas = await ej
    .select({ p: pagosRci, cliente: clientes.nombre })
    .from(pagosRci)
    .leftJoin(expedientes, eq(expedientes.idExpediente, pagosRci.idExpediente))
    .leftJoin(clientes, eq(clientes.id, expedientes.idCliente))
    .where(visible(usuario))
    .orderBy(desc(pagosRci.id))
    .limit(5000);
  return filas.map((f) => filaADto({ ...f.p, cliente: f.cliente }));
}

/* ------------------------------------------------------------------ */
/* Búsqueda del expediente                                             */
/* ------------------------------------------------------------------ */

const normalizarTexto = (c: unknown) => sql`upper(regexp_replace(coalesce(${c}, ''), '[^A-Za-z0-9]', '', 'g'))`;

async function cargarCandidatos(ej: Ejecutor, usuario: UsuarioActual, condicion: ReturnType<typeof sql>): Promise<CandidatoPago[]> {
  const filas = await ej
    .select({
      id: expedientes.idExpediente,
      cliente: clientes.nombre,
      dni: clientes.dni,
      vin: expedientes.vin,
      matricula: expedientes.matricula,
      fechaExpediente: expedientes.fechaExpediente,
      fechaRci: expedientes.fechaRci,
      marca: marcas.nombre,
      modelo: modelos.nombreModelo,
      financiado: tipoDeVenta.requiereRciAlMatricular,
    })
    .from(expedientes)
    .leftJoin(clientes, eq(clientes.id, expedientes.idCliente))
    .leftJoin(modelos, eq(modelos.idModelo, expedientes.idModelo))
    .leftJoin(marcas, eq(marcas.idMarca, modelos.marcaId))
    .leftJoin(tipoDeVenta, eq(tipoDeVenta.idTipoDeVenta, expedientes.idTipoDeVenta))
    .where(and(isNull(expedientes.eliminadoEn), condicion, esAdministrador(usuario.rol) ? undefined : eq(expedientes.idUsuario, usuario.idUsuario)))
    .limit(60);
  return filas.map((f) => ({ id: f.id, cliente: f.cliente, dni: f.dni, vehiculo: [f.marca, f.modelo].filter(Boolean).join(" ") || null, vin: f.vin, matricula: f.matricula, fechaExpediente: f.fechaExpediente, fechaRci: f.fechaRci, financiado: f.financiado ?? false, motivo: "" }));
}

interface Busqueda {
  exp: CandidatoPago | null;
  como: "bastidor" | "matricula" | "documento" | null;
  candidatos: CandidatoPago[];
  motivo: string;
}

type DatosBusqueda = { nif: string; bastidor: string; matricula: string; fechaPago: string | null };

/**
 * Localiza el expediente de un pago: bastidor, matrícula (usados) y documento del adquiriente. Con bastidor o matrícula basta, siempre
 * que el documento no lo contradiga; con solo el documento, vale si el cliente tiene un único expediente que pueda llevar este pago.
 */
export async function buscarExpedienteDePago(ej: Ejecutor, usuario: UsuarioActual, p: DatosBusqueda): Promise<Busqueda> {
  const vin = limpiarNif(p.bastidor);
  const mat = normalizarMatricula(p.matricula);
  const contradice = (c: CandidatoPago) => p.nif !== "" && !!c.dni && claveNif(c.dni) !== claveNif(p.nif);
  for (const [clave, condicion, como] of [
    [vin, sql`${normalizarTexto(expedientes.vin)} = ${vin}`, "bastidor"] as const,
    [mat, sql`${normalizarTexto(expedientes.matricula)} = ${mat}`, "matricula"] as const,
  ]) {
    if (!clave) continue;
    const lista = await cargarCandidatos(ej, usuario, condicion);
    if (lista.length === 1) {
      const c = lista[0];
      if (contradice(c)) return { exp: null, como: null, candidatos: [{ ...c, motivo: `Coincide el ${como}, pero el documento del cliente (${c.dni}) no es el del pago (${p.nif})` }], motivo: `El ${como} coincide con el expediente ${c.id}, pero el documento del cliente es distinto: compruébalo` };
      return { exp: { ...c, motivo: `Coincide el ${como}` }, como, candidatos: [], motivo: `Encontrado por ${como}` };
    }
    if (lista.length > 1) return { exp: null, como: null, candidatos: lista.map((c) => ({ ...c, motivo: `Mismo ${como}` })), motivo: `Hay varios expedientes con el mismo ${como}` };
  }
  if (!p.nif) return { exp: null, como: null, candidatos: [], motivo: "El pago no trae documento, bastidor ni matrícula que permitan encontrar el expediente" };
  const clave = claveNif(p.nif);
  const nucleo = clave.replace(/^[A-Z]/, "");
  const todos = await cargarCandidatos(ej, usuario, sql`${normalizarTexto(clientes.dni)} like ${`%${nucleo}%`}`);
  const delCliente = todos.filter((c) => claveNif(c.dni) === clave);
  if (delCliente.length === 0) {
    // Documento casi igual (un carácter de diferencia): se sugiere, pero no se aplica solo
    const parecidos = (await cargarCandidatos(ej, usuario, sql`${normalizarTexto(clientes.dni)} like ${`%${nucleo.slice(0, Math.max(4, nucleo.length - 3))}%`}`)).filter((c) => nifParecido(c.dni, p.nif));
    return { exp: null, como: null, candidatos: parecidos.map((c) => ({ ...c, motivo: "Documento muy parecido: puede ser un error de lectura" })), motivo: parecidos.length > 0 ? "Ningún expediente tiene ese documento, pero hay alguno muy parecido" : "No hay ningún expediente de ese cliente: súbelo primero con su pedido o elige uno a mano" };
  }
  // Los que ya tienen otro bastidor distinto al del pago no son este coche
  const posibles = delCliente.filter((c) => !(vin && c.vin && limpiarNif(c.vin) !== vin));
  const sinFecha = posibles.filter((c) => !c.fechaRci || c.fechaRci === p.fechaPago);
  const financiados = sinFecha.filter((c) => c.financiado);
  const elegibles = financiados.length > 0 ? financiados : sinFecha;
  const marcarTodos = (lista: CandidatoPago[], motivo: string) => lista.map((c) => ({ ...c, motivo }));
  if (elegibles.length === 1) return { exp: { ...elegibles[0], motivo: "Único expediente del cliente que puede llevar este pago" }, como: "documento", candidatos: [], motivo: "Encontrado por el documento del cliente" };
  if (elegibles.length === 0) return { exp: null, como: null, candidatos: marcarTodos(posibles.length > 0 ? posibles : delCliente, "Mismo cliente (ya tiene fecha RCI distinta)"), motivo: "Los expedientes del cliente ya tienen otra fecha RCI: elige a mano o ignora el pago" };
  return { exp: null, como: null, candidatos: marcarTodos(elegibles, "Mismo cliente"), motivo: "El cliente tiene varios expedientes que podrían llevar este pago: elige cuál" };
}

/** Candidatos para elegir a mano en un pago ya subido. */
export async function candidatosDePago(ej: Ejecutor, usuario: UsuarioActual, id: number): Promise<{ candidatos: CandidatoPago[]; motivo: string }> {
  const p = await leerPago(ej, usuario, id);
  const r = await buscarExpedienteDePago(ej, usuario, { nif: p.nif ?? "", bastidor: p.bastidor ?? "", matricula: p.matricula ?? "", fechaPago: p.fechaPago });
  return { candidatos: r.exp ? [r.exp] : r.candidatos, motivo: r.motivo };
}

/* ------------------------------------------------------------------ */
/* Subida y aplicación                                                 */
/* ------------------------------------------------------------------ */

/** Texto del documento: el del PDF si lo trae o, si es una foto o un PDF escaneado, el reconocido con OCR. */
async function textoDelPago(datos: Buffer): Promise<string> {
  if (!tipoDeFichero(datos)) throw new HttpError(415, "Formato no admitido: sube un PDF o una imagen (PNG, JPG, WebP).");
  const m = await mirarDocumento(datos);
  if (m.texto) return m.texto;
  if (!m.primera) return "";
  const lineas = await ocrImagenes([m.primera], { psm: "automatico", columnas: true, motorElegido: true });
  return lineas.map((l) => l.texto).join("\n");
}

const nulo = (t: string): string | null => (t === "" ? null : t);

async function insertarPago(ej: Ejecutor, usuario: UsuarioActual, nombre: string, idAdjunto: number | null, estado: EstadoPago, motivo: string | null, l: PagoRciLeido | null) {
  const [f] = await ej
    .insert(pagosRci)
    .values({
      idUsuario: usuario.idUsuario,
      nombreArchivo: nombre.slice(0, 250),
      idAdjunto,
      estado,
      motivo,
      numeroOperacion: l ? nulo(l.numeroOperacion) : null,
      fechaPago: l ? nulo(l.fechaPago) : null,
      nif: l ? nulo(l.nif) : null,
      nombre: l ? nulo(l.nombre) : null,
      bastidor: l ? nulo(l.bastidor) : null,
      matricula: l ? nulo(l.matricula) : null,
      marca: l ? nulo(l.marca) : null,
      modelo: l ? nulo(l.modelo) : null,
      importeNominalCent: l?.importeNominalCent ?? null,
      totalLiquidoCent: l?.totalLiquidoCent ?? null,
    })
    .returning();
  return f;
}

export interface EntradaSubirPago {
  datos: Buffer;
  nombre: string;
  /** Desde la cajita del expediente: se aplica a este expediente sin buscarlo. */
  idExpediente?: number;
  /** Aplicar aunque el documento del cliente no coincida con el del pago. */
  forzar?: boolean;
}

/** Lee un documento subido a la zona de pagos de RCI, lo guarda y, si no hay duda, fija la fecha RCI de su expediente. */
export async function subirPago(ej: Ejecutor, usuario: UsuarioActual, e: EntradaSubirPago): Promise<PagoRciDto> {
  return procesarPago(ej, usuario, e, await textoDelPago(e.datos));
}

/** Lo que sigue a la lectura del documento (separado para poder probarlo sin leer un PDF de verdad). */
export async function procesarPago(ej: Ejecutor, usuario: UsuarioActual, e: EntradaSubirPago, texto: string): Promise<PagoRciDto> {
  const leido = parsearPagoRci(texto);
  const adj = await guardarAdjunto(ej, { datos: e.datos, nombre: e.nombre, tipo: "pago_rci", creadoPor: usuario.idUsuario });

  if (!leido) {
    if (e.idExpediente) {
      await ej.delete(adjuntos).where(eq(adjuntos.id, adj.id));
      throw new HttpError(422, "Este documento no parece un pago de la financiera (RCI / Mobilize).");
    }
    const f = await insertarPago(ej, usuario, e.nombre, adj.id, "ignorado", "No es un pago de la financiera (no se ha tocado ningún expediente)", null);
    return leerPago(ej, usuario, f.id);
  }
  if (leido.numeroOperacion) {
    const [repetido] = await ej.select({ id: pagosRci.id }).from(pagosRci).where(and(eq(pagosRci.numeroOperacion, leido.numeroOperacion), inArray(pagosRci.estado, ["aplicado", "pendiente"]), visible(usuario)));
    if (repetido) {
      await ej.delete(adjuntos).where(eq(adjuntos.id, adj.id));
      return { ...(await leerPago(ej, usuario, repetido.id)), duplicado: true };
    }
  }
  const fila = await insertarPago(ej, usuario, e.nombre, adj.id, "pendiente", leido.faltan.length > 0 ? `No se ha podido leer: ${leido.faltan.join(", ")}` : null, leido);

  if (e.idExpediente) {
    const [c] = await cargarCandidatos(ej, usuario, sql`${expedientes.idExpediente} = ${e.idExpediente}`);
    if (!c) throw new HttpError(404, "Expediente no encontrado");
    if (!e.forzar && leido.nif && c.dni && claveNif(c.dni) !== claveNif(leido.nif)) {
      throw new HttpError(409, `El documento del pago (${leido.nif}) no es el del cliente de este expediente (${c.dni}). ¿Es el pago correcto?`);
    }
    return aplicarPago(ej, usuario, fila.id, { idExpediente: e.idExpediente, motivo: "Subido desde el expediente" });
  }
  if (!leido.fechaPago) return leerPago(ej, usuario, fila.id);
  const r = await buscarExpedienteDePago(ej, usuario, { nif: leido.nif, bastidor: leido.bastidor, matricula: leido.matricula, fechaPago: leido.fechaPago });
  if (!r.exp) {
    await ej.update(pagosRci).set({ motivo: r.motivo }).where(eq(pagosRci.id, fila.id));
    return leerPago(ej, usuario, fila.id);
  }
  return aplicarPago(ej, usuario, fila.id, { idExpediente: r.exp.id, motivo: r.motivo });
}

export const esquemaAplicarPago = z.object({
  id: z.number().int().positive(),
  idExpediente: z.number().int().positive(),
  /** Para corregir a mano una fecha mal leída. */
  fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Fija la fecha RCI del expediente con la fecha de pago y deja el pago como aplicado (con la fecha anterior, para poder deshacerlo). */
export async function aplicarPago(ej: Ejecutor, usuario: UsuarioActual, id: number, o: { idExpediente: number; fechaPago?: string; motivo?: string }): Promise<PagoRciDto> {
  const pago = await leerPago(ej, usuario, id);
  const fecha = o.fechaPago ?? pago.fechaPago;
  if (!fecha || Number.isNaN(Date.parse(fecha))) throw new HttpError(400, "El pago no tiene una fecha de pago válida: corrígela antes de aplicarlo");
  const [exp] = await ej.select({ id: expedientes.idExpediente, rci: expedientes.fechaRci }).from(expedientes).where(and(eq(expedientes.idExpediente, o.idExpediente), isNull(expedientes.eliminadoEn)));
  if (!exp) throw new HttpError(404, "Expediente no encontrado");
  await comprobarAlcance(ej, usuario, [exp.id]);
  if (exp.rci !== fecha) {
    await actualizarExpedientes(ej, usuario, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: exp.id, expediente: { fecha_rci: fecha } }));
  }
  await ej.transaction(async (tx) => {
    await tx
      .update(pagosRci)
      .set({ estado: "aplicado", idExpediente: exp.id, fechaPago: fecha, fechaRciAnterior: pago.estado === "aplicado" && pago.idExpediente === exp.id ? pago.fechaRciAnterior : exp.rci, motivo: o.motivo ?? pago.motivo, resueltoEn: new Date() })
      .where(eq(pagosRci.id, id));
    if (pago.idAdjunto !== null) await tx.update(adjuntos).set({ idExpediente: exp.id, ambito: "expediente" }).where(eq(adjuntos.id, pago.idAdjunto));
  });
  return leerPago(ej, usuario, id);
}

/** Deshace un pago aplicado: la fecha RCI vuelve a la que tenía (si nadie la ha cambiado desde entonces) y el pago queda pendiente. */
export async function deshacerPago(ej: Ejecutor, usuario: UsuarioActual, id: number): Promise<PagoRciDto> {
  const pago = await leerPago(ej, usuario, id);
  if (pago.estado !== "aplicado" || pago.idExpediente === null) throw new HttpError(400, "Este pago no está aplicado");
  const [exp] = await ej.select({ id: expedientes.idExpediente, rci: expedientes.fechaRci }).from(expedientes).where(eq(expedientes.idExpediente, pago.idExpediente));
  let motivo = "Aplicación deshecha";
  if (exp && exp.rci === pago.fechaPago) {
    await actualizarExpedientes(ej, usuario, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: exp.id, expediente: { fecha_rci: pago.fechaRciAnterior ?? "" } }));
  } else if (exp) {
    motivo = `Aplicación deshecha; la fecha RCI del expediente se había cambiado después (ahora ${exp.rci ?? "vacía"}) y no se toca`;
  }
  await ej.transaction(async (tx) => {
    await tx.update(pagosRci).set({ estado: "pendiente", idExpediente: null, fechaRciAnterior: null, motivo, resueltoEn: null }).where(eq(pagosRci.id, id));
    if (pago.idAdjunto !== null) await tx.update(adjuntos).set({ idExpediente: null, ambito: "pendiente" }).where(eq(adjuntos.id, pago.idAdjunto));
  });
  return leerPago(ej, usuario, id);
}

export const esquemaEditarPago = z.object({
  id: z.number().int().positive(),
  fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  nif: z.string().max(20).optional(),
  bastidor: z.string().max(30).optional(),
  matricula: z.string().max(20).optional(),
});

/** Corrige a mano lo que el pago trae mal leído (solo mientras no esté aplicado). */
export async function editarPago(ej: Ejecutor, usuario: UsuarioActual, e: z.infer<typeof esquemaEditarPago>): Promise<PagoRciDto> {
  const pago = await leerPago(ej, usuario, e.id);
  if (pago.estado === "aplicado") throw new HttpError(400, "Deshaz la aplicación antes de corregir los datos del pago");
  const set: Partial<typeof pagosRci.$inferInsert> = {};
  if (e.fechaPago !== undefined) set.fechaPago = e.fechaPago;
  if (e.nif !== undefined) set.nif = nulo(limpiarNif(e.nif));
  if (e.bastidor !== undefined) set.bastidor = nulo(limpiarNif(e.bastidor));
  if (e.matricula !== undefined) set.matricula = nulo(normalizarMatricula(e.matricula));
  if (Object.keys(set).length > 0) await ej.update(pagosRci).set(set).where(eq(pagosRci.id, e.id));
  return leerPago(ej, usuario, e.id);
}

/** Descarta un pago (no es de este concesionario, está repetido…): no toca ningún expediente. Se puede recuperar volviendo a ponerlo pendiente. */
export async function ignorarPago(ej: Ejecutor, usuario: UsuarioActual, id: number, ignorar = true): Promise<PagoRciDto> {
  const pago = await leerPago(ej, usuario, id);
  if (pago.estado === "aplicado") throw new HttpError(400, "Deshaz la aplicación antes de ignorar el pago");
  await ej.update(pagosRci).set({ estado: ignorar ? "ignorado" : "pendiente", motivo: ignorar ? "Descartado a mano" : "Recuperado" }).where(eq(pagosRci.id, id));
  return leerPago(ej, usuario, id);
}
