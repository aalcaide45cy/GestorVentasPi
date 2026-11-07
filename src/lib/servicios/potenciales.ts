import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { Ejecutor } from "@/db";
import {
  clientes,
  emailsClientes,
  expedientes,
  potenciales,
  presupuestos,
  telefonosClientes,
} from "@/db/schema";
import { esAnulado } from "@/lib/anulados";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import { proponerMarcaModelo } from "@/lib/documentos/modelos";
import {
  parsearPresupuesto,
  type DatosPresupuesto,
} from "@/lib/documentos/presupuesto";
import { guardarAdjunto } from "./adjuntos";
import { leerCatalogos } from "./catalogos";
import { respuestasDe, type RespuestaDto } from "./correo-respuestas";
import { textoDeDocumento } from "./ocr";

/**
 * Clientes potenciales: personas que han pedido un presupuesto. Los presupuestos (PDF de «INFORMACIÓN DE VEHÍCULO NUEVO») se leen con el mismo
 * sistema que los pedidos (texto del PDF o OCR) y cualquier otro documento se descarta. Se cotejan con los expedientes en modo solo lectura:
 * quien tiene expediente ha comprado y no entra en los envíos.
 */

export type EstadoPotencial = "activo" | "baja" | "compro" | "posible";

export interface PresupuestoDto {
  id: number;
  numero: string;
  referencia: string | null;
  fecha: string | null;
  hora: string | null;
  marca: string;
  modelo: string;
  modelo_texto: string;
  color: string;
  total_centimos: number | null;
  vendedor: string;
  id_adjunto: number | null;
}

export interface PotencialDto {
  id: number;
  id_usuario: number;
  nombre: string;
  email: string;
  telefono: string;
  poblacion: string;
  provincia: string;
  codigo_postal: string;
  estado: EstadoPotencial;
  id_expediente: number | null;
  ignorar_posible: boolean;
  baja_en: string | null;
  baja_motivo: string | null;
  notas: string;
  creado_en: string;
  n_presupuestos: number;
  /** El último presupuesto (para enseñarlo en la lista). */
  ultimo: PresupuestoDto | null;
  presupuestos: PresupuestoDto[];
  /** Lo que ha contestado por correo (solo en la ficha). */
  respuestas?: RespuestaDto[];
}

/* ------------------------------ Utilidades ------------------------------ */

const sinAcentos = (t: string): string =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Nombre comparable: sin acentos, sin signos y con las palabras ordenadas («López Ana» = «ana lopez»). */
export const claveNombre = (n: string): string =>
  sinAcentos(n)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 0)
    .sort()
    .join(" ");
const soloDigitos = (t: string): string =>
  t.replace(/\D/g, "").replace(/^34(?=\d{9}$)/, "");

const aPresupuesto = (p: typeof presupuestos.$inferSelect): PresupuestoDto => ({
  id: p.id,
  numero: p.numero,
  referencia: p.referencia,
  fecha: p.fecha,
  hora: p.hora,
  marca: p.marca,
  modelo: p.modelo,
  modelo_texto: p.modeloTexto,
  color: p.color,
  total_centimos: p.totalCentimos,
  vendedor: p.vendedor,
  id_adjunto: p.idAdjunto,
});

async function aDtos(
  ej: Ejecutor,
  filas: (typeof potenciales.$inferSelect)[],
): Promise<PotencialDto[]> {
  if (filas.length === 0) return [];
  const ps = await ej
    .select()
    .from(presupuestos)
    .where(
      inArray(
        presupuestos.idPotencial,
        filas.map((f) => f.id),
      ),
    )
    .orderBy(desc(presupuestos.fecha), desc(presupuestos.id));
  return filas.map((f) => {
    const suyos = ps.filter((p) => p.idPotencial === f.id).map(aPresupuesto);
    return {
      id: f.id,
      id_usuario: f.idUsuario,
      nombre: f.nombre,
      email: f.email,
      telefono: f.telefono,
      poblacion: f.poblacion,
      provincia: f.provincia,
      codigo_postal: f.codigoPostal,
      estado: f.estado as EstadoPotencial,
      id_expediente: f.idExpediente,
      ignorar_posible: f.ignorarPosible,
      baja_en: f.bajaEn?.toISOString() ?? null,
      baja_motivo: f.bajaMotivo,
      notas: f.notas,
      creado_en: f.creadoEn.toISOString(),
      n_presupuestos: suyos.length,
      ultimo: suyos[0] ?? null,
      presupuestos: suyos,
    };
  });
}

const visible = (u: UsuarioActual) =>
  esAdministrador(u.rol) ? undefined : eq(potenciales.idUsuario, u.idUsuario);

async function potencialAccesible(
  ej: Ejecutor,
  u: UsuarioActual,
  id: number,
): Promise<typeof potenciales.$inferSelect> {
  const [f] = await ej
    .select()
    .from(potenciales)
    .where(and(eq(potenciales.id, id), visible(u)));
  if (!f) throw new HttpError(404, "Cliente potencial no encontrado");
  return f;
}

/* ------------------------------ Cotejo con los expedientes ------------------------------ */

/** ¿Hay un expediente (vivo, no anulado) de esta persona? Por correo o teléfono es seguro («compro»); solo por nombre es «posible». */
async function buscarCompra(
  ej: Ejecutor,
  p: {
    email: string;
    telefono: string;
    nombre: string;
    ignorarPosible: boolean;
  },
): Promise<{ estado: "compro" | "posible"; idExpediente: number } | null> {
  const validos = and(
    isNull(expedientes.eliminadoEn),
    eq(expedientes.deshabilitado, false),
  );
  const porCliente = async (idsCliente: number[]): Promise<number | null> => {
    if (idsCliente.length === 0) return null;
    const exps = await ej
      .select({
        id: expedientes.idExpediente,
        intranet: expedientes.estadoIntranet,
      })
      .from(expedientes)
      .where(and(validos, inArray(expedientes.idCliente, idsCliente)))
      .orderBy(desc(expedientes.idExpediente));
    return exps.find((e) => !esAnulado(e.intranet))?.id ?? null;
  };
  const correo = p.email.trim().toLowerCase();
  if (correo) {
    const cs = await ej
      .select({ id: emailsClientes.idCliente })
      .from(emailsClientes)
      .where(sql`lower(${emailsClientes.email}) = ${correo}`);
    const id = await porCliente(
      cs.map((c) => c.id).filter((i): i is number => i !== null),
    );
    if (id) return { estado: "compro", idExpediente: id };
  }
  const tel = soloDigitos(p.telefono);
  if (tel.length >= 9) {
    const ts = await ej
      .select({ id: telefonosClientes.idCliente })
      .from(telefonosClientes)
      .where(
        sql`right(regexp_replace(${telefonosClientes.telefono}, '[^0-9]', '', 'g'), 9) = ${tel.slice(-9)}`,
      );
    const id = await porCliente(
      ts.map((t) => t.id).filter((i): i is number => i !== null),
    );
    if (id) return { estado: "compro", idExpediente: id };
  }
  if (!p.ignorarPosible) {
    const clave = claveNombre(p.nombre);
    if (clave.split(" ").length >= 2) {
      // Los clientes cuyo nombre tiene las mismas palabras: se acotan por la primera palabra y se comparan en memoria
      const primera = clave.split(" ")[0];
      const cs = await ej
        .select({ id: clientes.id, nombre: clientes.nombre })
        .from(clientes)
        .where(
          and(
            isNull(clientes.eliminadoEn),
            sql`translate(lower(${clientes.nombre}), 'áéíóúüñ', 'aeiouun') like ${`%${primera}%`}`,
          ),
        );
      const iguales = cs
        .filter((c) => c.nombre && claveNombre(c.nombre) === clave)
        .map((c) => c.id);
      const id = await porCliente(iguales);
      if (id) return { estado: "posible", idExpediente: id };
    }
  }
  return null;
}

/**
 * Coteja con los expedientes (solo lectura) y actualiza el estado de los potenciales: «compro» o «posible» si hay expediente, y vuelve a «activo»
 * si ya no lo hay. Los dados de baja no se tocan. Devuelve cuántos han cambiado.
 */
export async function cotejarPotenciales(
  ej: Ejecutor,
  ids?: number[],
): Promise<{
  revisados: number;
  compraron: number;
  posibles: number;
  cambiados: number;
}> {
  const filas = await ej
    .select()
    .from(potenciales)
    .where(
      and(
        ne(potenciales.estado, "baja"),
        ids ? inArray(potenciales.id, ids) : undefined,
      ),
    );
  const r = {
    revisados: filas.length,
    compraron: 0,
    posibles: 0,
    cambiados: 0,
  };
  for (const p of filas) {
    const c = await buscarCompra(ej, p);
    const estado: EstadoPotencial = c?.estado ?? "activo";
    const idExp = c?.idExpediente ?? null;
    if (estado === "compro") r.compraron++;
    if (estado === "posible") r.posibles++;
    if (estado !== p.estado || idExp !== p.idExpediente) {
      await ej
        .update(potenciales)
        .set({ estado, idExpediente: idExp })
        .where(eq(potenciales.id, p.id));
      r.cambiados++;
    }
  }
  return r;
}

/* ------------------------------ Cargar presupuestos ------------------------------ */

export class NoEsPresupuestoError extends HttpError {
  constructor(public readonly cabecera: string) {
    super(
      422,
      "Este documento no es un presupuesto (no pone «INFORMACIÓN DE VEHÍCULO NUEVO» con su resumen de precios), así que se ha descartado.",
    );
  }
}

export interface ResultadoCarga {
  /** nuevo = presupuesto guardado; repetido = ya estaba (mismo número). */
  resultado: "nuevo" | "repetido";
  numero: string;
  cliente: string;
  potencial: PotencialDto;
  nuevoPotencial: boolean;
  /** compro o posible: no entrará en los envíos. */
  aviso: string | null;
  avisos: string[];
}

/** Lee un presupuesto (PDF o imagen) y lo guarda con su cliente potencial. Cualquier otro documento se descarta sin guardar nada. */
export async function cargarPresupuesto(
  ej: Ejecutor,
  u: UsuarioActual,
  nombreFichero: string,
  datos: Buffer,
): Promise<ResultadoCarga> {
  const leido = await textoDeDocumento(datos, {});
  const d = parsearPresupuesto(leido.texto);
  if (!d.esPresupuesto)
    throw new NoEsPresupuestoError(
      leido.texto.replace(/\s+/g, " ").trim().slice(0, 160),
    );
  return registrarPresupuesto(ej, u, nombreFichero, datos, d);
}

/** Guarda un presupuesto ya leído: su cliente potencial (por correo, teléfono o nombre), el presupuesto con su marca y modelo, y el cotejo con los expedientes. */
export async function registrarPresupuesto(
  ej: Ejecutor,
  u: UsuarioActual,
  nombreFichero: string,
  datos: Buffer,
  d: DatosPresupuesto,
): Promise<ResultadoCarga> {
  if (!d.numero)
    throw new HttpError(
      422,
      "No se ha podido leer el número del presupuesto, así que no se ha guardado.",
    );
  if (!d.cliente)
    throw new HttpError(
      422,
      "No se ha podido leer el cliente del presupuesto, así que no se ha guardado.",
    );

  // ¿Ya estaba este presupuesto?
  const [ya] = await ej
    .select()
    .from(presupuestos)
    .where(eq(presupuestos.numero, d.numero));
  if (ya) {
    const [pot] = await ej
      .select()
      .from(potenciales)
      .where(eq(potenciales.id, ya.idPotencial));
    const [dto] = await aDtos(ej, [pot]);
    return {
      resultado: "repetido",
      numero: d.numero,
      cliente: pot.nombre,
      potencial: dto,
      nuevoPotencial: false,
      aviso: null,
      avisos: ["Este presupuesto ya estaba cargado."],
    };
  }

  // La persona: por correo, si no por teléfono, si no por nombre y código postal
  const correo = d.email.toLowerCase();
  let pot: typeof potenciales.$inferSelect | undefined;
  if (correo)
    [pot] = await ej
      .select()
      .from(potenciales)
      .where(sql`lower(${potenciales.email}) = ${correo}`)
      .limit(1);
  if (!pot && d.telefono)
    [pot] = await ej
      .select()
      .from(potenciales)
      .where(eq(potenciales.telefono, d.telefono))
      .limit(1);
  if (!pot) {
    const clave = claveNombre(d.cliente);
    const mismos = d.codigoPostal
      ? await ej
          .select()
          .from(potenciales)
          .where(eq(potenciales.codigoPostal, d.codigoPostal))
      : [];
    pot = mismos.find((m) => claveNombre(m.nombre) === clave);
  }
  const nuevoPotencial = !pot;
  if (!pot) {
    [pot] = await ej
      .insert(potenciales)
      .values({
        idUsuario: u.idUsuario,
        nombre: d.cliente,
        email: correo,
        telefono: d.telefono,
        poblacion: d.poblacion,
        provincia: d.provincia,
        codigoPostal: d.codigoPostal,
      })
      .returning();
  } else {
    // Se completan los datos que faltaban (sin machacar los que ya estaban)
    const cambios: Partial<typeof potenciales.$inferInsert> = {};
    if (!pot.email && correo) cambios.email = correo;
    if (!pot.telefono && d.telefono) cambios.telefono = d.telefono;
    if (!pot.poblacion && d.poblacion)
      Object.assign(cambios, {
        poblacion: d.poblacion,
        provincia: d.provincia,
        codigoPostal: d.codigoPostal,
      });
    if (Object.keys(cambios).length > 0)
      [pot] = await ej
        .update(potenciales)
        .set(cambios)
        .where(eq(potenciales.id, pot.id))
        .returning();
  }

  // Marca y modelo del presupuesto, casados con el catálogo
  const cat = await leerCatalogos(ej);
  const propuesta = proponerMarcaModelo(d.modeloTexto, {
    marcas: cat.marcas.map((m) => ({
      id: m.id_marca,
      nombre: m.nombre,
      modelos: cat.modelos
        .filter((x) => x.marca_id === m.id_marca)
        .map((x) => ({ id: x.id_modelo, nombre: x.nombre_modelo })),
    })),
  });
  const adjunto = await guardarAdjunto(ej, {
    datos,
    nombre: nombreFichero,
    tipo: "presupuesto",
    creadoPor: u.idUsuario,
  });
  await ej.insert(presupuestos).values({
    idPotencial: pot.id,
    numero: d.numero,
    referencia: d.referencia,
    fecha: d.fecha,
    hora: d.hora,
    marca: propuesta.marca,
    modelo: propuesta.modelo,
    idModelo: propuesta.idModelo,
    modeloTexto: d.modeloTexto,
    color: d.color,
    totalCentimos: d.totalCentimos,
    vendedor: d.vendedor,
    idAdjunto: adjunto.id,
  });

  // Cotejo con los expedientes: si ya compró, queda marcado y no entra en los envíos
  await cotejarPotenciales(ej, [pot.id]);
  const [actual] = await ej
    .select()
    .from(potenciales)
    .where(eq(potenciales.id, pot.id));
  const [dto] = await aDtos(ej, [actual]);
  const aviso =
    actual.estado === "compro"
      ? `Ya tiene el expediente #EXP-${String(actual.idExpediente).padStart(4, "0")}: ha comprado, así que no entrará en los envíos.`
      : actual.estado === "posible"
        ? `Hay un expediente con el mismo nombre (#EXP-${String(actual.idExpediente).padStart(4, "0")}): revisa si es la misma persona.`
        : actual.estado === "baja"
          ? "Esta persona se había dado de baja: no recibirá correos."
          : null;
  return {
    resultado: "nuevo",
    numero: d.numero,
    cliente: pot.nombre,
    potencial: dto,
    nuevoPotencial,
    aviso,
    avisos: d.avisos,
  };
}

/* ------------------------------ Consultas y cambios ------------------------------ */

export interface FiltroPotenciales {
  estado?: EstadoPotencial;
  q?: string;
}

export async function listarPotenciales(
  ej: Ejecutor,
  u: UsuarioActual,
  filtro: FiltroPotenciales = {},
): Promise<PotencialDto[]> {
  const q = filtro.q?.trim();
  const patron = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : null;
  const filas = await ej
    .select()
    .from(potenciales)
    .where(
      and(
        visible(u),
        filtro.estado ? eq(potenciales.estado, filtro.estado) : undefined,
        patron
          ? or(
              ilike(potenciales.nombre, patron),
              ilike(potenciales.email, patron),
              ilike(potenciales.telefono, patron),
            )
          : undefined,
      ),
    )
    .orderBy(desc(potenciales.id))
    .limit(3000);
  return aDtos(ej, filas);
}

export async function leerPotencial(
  ej: Ejecutor,
  u: UsuarioActual,
  id: number,
): Promise<PotencialDto> {
  const [d] = await aDtos(ej, [await potencialAccesible(ej, u, id)]);
  return { ...d, respuestas: await respuestasDe(ej, id) };
}

export interface CambioPotencial {
  nombre?: string;
  email?: string;
  telefono?: string;
  notas?: string;
  /** activo = lo reactiva (quita la baja); baja = no se le escribe más; no_es_comprador = la coincidencia por nombre no es la misma persona. */
  accion?: "baja" | "reactivar" | "no_es_comprador" | "si_es_comprador";
}

export async function cambiarPotencial(
  ej: Ejecutor,
  u: UsuarioActual,
  id: number,
  c: CambioPotencial,
): Promise<PotencialDto> {
  const p = await potencialAccesible(ej, u, id);
  const set: Partial<typeof potenciales.$inferInsert> = {};
  if (c.nombre !== undefined) set.nombre = c.nombre.trim() || p.nombre;
  if (c.email !== undefined) set.email = c.email.trim().toLowerCase();
  if (c.telefono !== undefined) set.telefono = soloDigitos(c.telefono);
  if (c.notas !== undefined) set.notas = c.notas;
  if (c.accion === "baja")
    Object.assign(set, {
      estado: "baja",
      bajaEn: new Date(),
      bajaMotivo: "Dada de baja a mano",
    });
  if (c.accion === "reactivar")
    Object.assign(set, { estado: "activo", bajaEn: null, bajaMotivo: null });
  if (c.accion === "no_es_comprador")
    Object.assign(set, { ignorarPosible: true });
  if (c.accion === "si_es_comprador") Object.assign(set, { estado: "compro" });
  if (Object.keys(set).length > 0)
    await ej.update(potenciales).set(set).where(eq(potenciales.id, id));
  if (
    c.accion === "reactivar" ||
    c.accion === "no_es_comprador" ||
    c.email !== undefined ||
    c.telefono !== undefined ||
    c.nombre !== undefined
  )
    await cotejarPotenciales(ej, [id]);
  return leerPotencial(ej, u, id);
}

export async function eliminarPotencial(
  ej: Ejecutor,
  u: UsuarioActual,
  id: number,
): Promise<void> {
  const p = await potencialAccesible(ej, u, id);
  // Una baja no se borra: si se borrara, al volver a cargar su presupuesto se crearía una ficha nueva y volvería a recibir correos
  if (p.estado === "baja")
    throw new HttpError(
      409,
      "Esta persona está dada de baja y no se puede borrar: así se acuerda de que no debe recibir correos. Si quieres escribirle otra vez, reactívala.",
    );
  await ej.delete(potenciales).where(eq(potenciales.id, id));
}

/** ¿Hay otra ficha dada de baja con el mismo correo o teléfono? Es la misma persona: tampoco se le escribe. */
export async function hayBajaDeLaMismaPersona(
  ej: Ejecutor,
  p: { id: number; email: string; telefono: string },
): Promise<boolean> {
  const correo = p.email.trim().toLowerCase();
  const tel = p.telefono.trim();
  if (!correo && !tel) return false;
  const [f] = await ej
    .select({ id: potenciales.id })
    .from(potenciales)
    .where(
      and(
        eq(potenciales.estado, "baja"),
        ne(potenciales.id, p.id),
        or(
          correo ? sql`lower(${potenciales.email}) = ${correo}` : undefined,
          tel ? eq(potenciales.telefono, tel) : undefined,
        ),
      ),
    )
    .limit(1);
  return !!f;
}

export async function resumenPotenciales(
  ej: Ejecutor,
  u: UsuarioActual,
): Promise<Record<EstadoPotencial | "total", number>> {
  const filas = await ej
    .select({ estado: potenciales.estado, n: sql<number>`count(*)::int` })
    .from(potenciales)
    .where(visible(u))
    .groupBy(potenciales.estado);
  const r = { activo: 0, baja: 0, compro: 0, posible: 0, total: 0 };
  for (const f of filas) {
    r[f.estado as EstadoPotencial] += f.n;
    r.total += f.n;
  }
  return r;
}

/* ------------------------------ Campos para las plantillas de correo ------------------------------ */

const bonito = (t: string): string =>
  t
    ? t
        .toLowerCase()
        .replace(
          /(^|\s)(\p{L})/gu,
          (_m, a: string, b: string) => `${a}${b.toUpperCase()}`,
        )
    : "";
const euros = (c: number | null): string =>
  c === null
    ? ""
    : `${(c / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fechaCorta = (f: string | null): string =>
  f ? f.split("-").reverse().join("/") : "";
/** La frase que invita a darse de baja: la app la detecta al leer las respuestas. */
export const FRASE_BAJA =
  "Si no quieres recibir más mensajes, responde a este correo con la palabra BAJA.";

/** Los campos de plantilla de un cliente potencial y de su presupuesto (el que se indique o el último). */
export async function datosDePotencial(
  ej: Ejecutor,
  idPotencial: number,
  idPresupuesto?: number | null,
): Promise<{
  datos: Record<string, string>;
  email: string;
  estado: EstadoPotencial;
  idPresupuesto: number | null;
  nombre: string;
}> {
  const [p] = await ej
    .select()
    .from(potenciales)
    .where(eq(potenciales.id, idPotencial));
  if (!p) throw new HttpError(404, "Cliente potencial no encontrado");
  const ps = await ej
    .select()
    .from(presupuestos)
    .where(eq(presupuestos.idPotencial, idPotencial))
    .orderBy(desc(presupuestos.fecha), desc(presupuestos.id));
  const pr =
    (idPresupuesto ? ps.find((x) => x.id === idPresupuesto) : null) ??
    ps[0] ??
    null;
  const pila = bonito(p.nombre.split(/\s+/)[0] ?? "");
  return {
    email: p.email,
    estado: p.estado as EstadoPotencial,
    idPresupuesto: pr?.id ?? null,
    nombre: p.nombre,
    datos: {
      cliente_potencial: p.nombre,
      nombre_pila: pila,
      cliente: p.nombre,
      email_cliente: p.email,
      telefono_cliente: p.telefono,
      marca_presupuesto: pr?.marca ?? "",
      modelo_presupuesto: pr?.modelo ?? "",
      color_presupuesto: pr?.color ?? "",
      fecha_presupuesto: fechaCorta(pr?.fecha ?? null),
      numero_presupuesto: pr?.numero ?? "",
      total_presupuesto: euros(pr?.totalCentimos ?? null),
      vendedor: pr?.vendedor ?? "",
      baja: FRASE_BAJA,
    },
  };
}
