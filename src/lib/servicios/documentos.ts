import { and, eq, isNull, or, sql } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { combinarDni, nombreCompleto, type DatosDni } from "@/lib/documentos/dni";
import { aliasModelos, clientes, expedientes, marcas, modelos } from "@/db/schema";
import { claveAprendizaje } from "@/lib/documentos/modelos";
import { parsearPedido, type DatosPedido } from "@/lib/documentos/pedido";
import type { RegionFoto } from "@/lib/documentos/tarjetas";
import { HttpError } from "@/lib/auth/sesion";
import { guardarAdjunto, MAX_BYTES_ADJUNTO, detectarMime, type AdjuntoDto } from "./adjuntos";
import { leerCatalogos } from "./catalogos";
import { leerTarjetasDeImagen, type TarjetaLeida } from "./dni-lectura";
import { enCola, imagenesDePdf, textoDeDocumento } from "./ocr";

/**
 * Lectura automática de documentos para rellenar fichas: el DNI (cliente y foto) y el pedido (expediente).
 * Nada se guarda en las fichas: se devuelven los datos para que el usuario los revise; los ficheros quedan como
 * adjuntos «pendientes» y se vinculan al registro cuando éste se guarda.
 */

export interface ResultadoDni {
  datos: DatosDni & { nombreCompleto: string | null };
  /** Adjuntos creados (pendientes de vincular): una imagen por cada cara de DNI encontrada. */
  adjuntos: AdjuntoDto[];
  /** Adjunto con la cara recortada del anverso, si se ha podido. */
  fotoId: number | null;
  lado: "anverso" | "reverso" | "desconocido";
  /** Tarjetas encontradas en el fichero. */
  tarjetas: number;
}

export interface ExpedienteSimilar {
  idExpediente: number;
  motivo: string;
  cliente: string | null;
  fecha: string | null;
}

/** Mensaje con que se avisa de un documento que no es un pedido; la cola lo cuenta aparte de los errores. */
export const NO_ES_PEDIDO = "No parece un pedido, así que se ha ignorado (no se ha guardado ni adjuntado a nada).";

/** Documento que no es un pedido; lleva el principio de lo que se leyó para poder ver por qué en el registro. */
export class NoEsPedidoError extends HttpError {
  constructor(public readonly cabecera: string) {
    super(422, NO_ES_PEDIDO);
  }
}

export interface ResultadoPedido {
  datos: DatosPedido;
  /** Expedientes ya existentes que parecen ser este mismo pedido (solo aviso: no bloquea nada). */
  similares: ExpedienteSimilar[];
  adjunto: AdjuntoDto;
  metodo: "texto-pdf" | "ocr";
}

/**
 * Recorta la fotografía del titular del anverso. Con la región localizada se recorta con margen alrededor de la cara (con la
 * proporción de una foto de carnet); sin ella no hay recorte. Devuelve JPEG de 300×380.
 */
export async function recortarFotoDni(anverso: Buffer, foto: RegionFoto | null): Promise<Buffer | null> {
  if (!foto) return null;
  try {
    const { width: W, height: H } = await sharp(anverso, { failOn: "none" }).metadata();
    if (!W || !H) return null;
    // Con margen alrededor de la cara (la región detectada es justa): un 55 % más de alto y el ancho que pida la proporción de carnet
    const altoCara = foto.alto * H;
    const anchoCara = Math.min(foto.ancho * W, altoCara * 0.82);
    const alto = Math.min(H, altoCara * 1.55);
    const ancho = Math.min(W, Math.max(anchoCara * 1.55, alto * 0.79));
    const cx = foto.x * W + anchoCara / 2;
    const cy = foto.y * H + altoCara / 2;
    const left = Math.max(0, Math.min(W - ancho, Math.round(cx - ancho / 2)));
    const top = Math.max(0, Math.min(H - alto, Math.round(cy - alto / 2)));
    return await sharp(anverso, { failOn: "none" })
      .extract({ left, top, width: Math.max(1, Math.min(Math.round(ancho), W - left)), height: Math.max(1, Math.min(Math.round(alto), H - top)) })
      .resize(300, 380, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return null;
  }
}

/** Imágenes del fichero: él mismo si es una imagen, o sus páginas (hasta 4) si es un PDF escaneado. */
async function imagenesDelFichero(datos: Buffer): Promise<Buffer[]> {
  const mime = detectarMime(datos);
  if (!mime) throw new HttpError(415, "Formato no admitido: sube una imagen (JPG, PNG, WebP) o un PDF.");
  if (mime === "application/pdf") return (await imagenesDePdf(datos)).imagenes.slice(0, 4);
  return [datos];
}

/**
 * Lee un DNI. Admite una foto, o una página escaneada con una o dos tarjetas (anverso y reverso, giradas o no), y un
 * PDF de varias páginas. Cada cara se guarda como adjunto, se extraen nombre, DNI y fecha de nacimiento y se recorta la
 * foto del titular.
 */
export async function leerDni(ej: Ejecutor, idUsuario: number, nombreFichero: string, datos: Buffer): Promise<ResultadoDni> {
  if (datos.length === 0) throw new HttpError(400, "El fichero está vacío.");
  if (datos.length > MAX_BYTES_ADJUNTO) throw new HttpError(413, "El fichero es demasiado grande (máximo 15 MB).");

  const imagenes = await imagenesDelFichero(datos);
  const tarjetas: TarjetaLeida[] = await enCola(async () => {
    try {
      const res: TarjetaLeida[] = [];
      for (const imagen of imagenes) {
        for (const t of await leerTarjetasDeImagen(imagen)) if (res.length < 4) res.push(t);
      }
      return res;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error("Error leyendo el DNI:", e instanceof Error ? e.message : e);
      throw new HttpError(500, "No se ha podido leer el DNI. Prueba con una imagen más nítida, con buena luz y sin reflejos.");
    }
  });

  const combinado = combinarDni(...tarjetas.map((t) => t.datos));
  const hayDatos = !!(combinado.dni || combinado.nombre || combinado.apellidos || combinado.fechaNacimiento);
  const avisos = [...combinado.avisos];
  if (!hayDatos) avisos.push("No se han podido leer datos del documento (la imagen puede estar muy clara o borrosa). Los documentos quedan adjuntos para rellenar los datos a mano.");

  const adjuntos: AdjuntoDto[] = [];
  let fotoId: number | null = null;
  const guardadas = tarjetas.length > 0 ? tarjetas : [];
  let nAnverso = 0;
  let nReverso = 0;
  for (const t of guardadas) {
    const esFrente = t.lado === "anverso";
    const nombre = esFrente ? `dni-anverso${++nAnverso > 1 ? `-${nAnverso}` : ""}.jpg` : `dni-reverso${++nReverso > 1 ? `-${nReverso}` : ""}.jpg`;
    adjuntos.push(await guardarAdjunto(ej, { datos: t.imagen, nombre, tipo: esFrente ? "dni_frente" : "dni_reverso", creadoPor: idUsuario }));
    if (esFrente && fotoId === null) {
      const recorte = await recortarFotoDni(t.imagen, t.foto);
      if (recorte) {
        const foto = await guardarAdjunto(ej, { datos: recorte, nombre: "foto-cliente.jpg", tipo: "foto_cliente", creadoPor: idUsuario, miniaturaPropia: recorte });
        fotoId = foto.id;
        adjuntos.push(foto);
      }
    }
  }
  // Sin tarjetas reconocidas: el fichero original queda adjunto igualmente
  if (adjuntos.length === 0) adjuntos.push(await guardarAdjunto(ej, { datos, nombre: nombreFichero, tipo: "dni_frente", creadoPor: idUsuario }));

  const lado: ResultadoDni["lado"] = tarjetas.some((t) => t.lado === "anverso") ? "anverso" : tarjetas.some((t) => t.lado === "reverso") ? "reverso" : "desconocido";
  return { datos: { ...combinado, avisos, nombreCompleto: nombreCompleto(combinado) }, adjuntos, fotoId, lado, tarjetas: tarjetas.length };
}

/** Lee un pedido (PDF o imagen) y propone los datos del expediente comparando con los catálogos. */
export async function leerPedido(ej: Ejecutor, idUsuario: number, nombreFichero: string, datos: Buffer, permitirDuplicados = false, opciones: { paralelo?: boolean } = {}): Promise<ResultadoPedido> {
  const { texto, metodo, descartado, cabecera } = await textoDeDocumento(datos, { cribar: true, paralelo: opciones.paralelo });
  if (descartado) throw new NoEsPedidoError(cabecera ?? "");
  const catalogos = await leerCatalogos(ej);
  const marcas = new Map(catalogos.marcas.map((m) => [m.id_marca, m.nombre]));
  const parsed = parsearPedido(texto, {
    modelos: catalogos.modelos.map((m) => ({ id: m.id_modelo, nombre: m.nombre_modelo, marca: m.marca_id ? (marcas.get(m.marca_id) ?? null) : null })),
    tiposVenta: catalogos.tiposVenta.map((t) => ({ id: t.id_tipo_de_venta, nombre: t.nombre_tipo_venta, categoria: t.categoria })),
    aliasModelos: (await ej.select({ alias: aliasModelos.alias, id: aliasModelos.idModelo }).from(aliasModelos)).map((a) => ({ alias: a.alias, id: a.id })),
    marcas: catalogos.marcas.map((m) => m.nombre),
  });
  // Un PDF que no es un pedido (otros papeles con datos de un cliente) se ignora: ni se propone nada ni se guarda en ningún sitio
  if (!parsed.esPedido) throw new NoEsPedidoError(texto.replace(/\s+/g, " ").trim().slice(0, 160));
  const adjunto = await guardarAdjunto(ej, { datos, nombre: nombreFichero, tipo: "pedido", creadoPor: idUsuario });
  // Con «Permitir expedientes duplicados» no se busca ni se avisa de pedidos parecidos
  const similares = permitirDuplicados ? [] : await buscarExpedientesSimilares(ej, parsed);
  if (similares.length > 0) parsed.avisos.unshift(`Ya existe un expediente que parece este pedido (nº ${similares[0].idExpediente}: ${similares[0].motivo}). Comprueba que no lo estás duplicando.`);
  return { datos: parsed, similares, adjunto, metodo };
}

export const esquemaAprenderModelo = z.object({
  texto: z.string().trim().min(2).max(300),
  id_modelo: z.coerce.number().int().positive(),
});

/**
 * «Enseña» a la aplicación que el texto de modelo de un pedido corresponde a un modelo del catálogo: queda guardado y
 * se aplica en las lecturas siguientes. Devuelve la clave guardada (null si el texto no daba una clave útil).
 */
export async function aprenderModelo(ej: Ejecutor, entrada: z.infer<typeof esquemaAprenderModelo>): Promise<{ alias: string | null }> {
  const catalogos = await leerCatalogos(ej);
  if (!catalogos.modelos.some((m) => m.id_modelo === entrada.id_modelo)) throw new HttpError(404, "El modelo no existe.");
  const alias = claveAprendizaje(entrada.texto, catalogos.marcas.map((m) => m.nombre));
  if (!alias) return { alias: null };
  await ej
    .insert(aliasModelos)
    .values({ alias, idModelo: entrada.id_modelo })
    .onConflictDoUpdate({ target: aliasModelos.alias, set: { idModelo: entrada.id_modelo } });
  return { alias };
}

export const esquemaCrearModeloPedido = z.object({
  marca: z.string().trim().min(1, "Escribe la marca").max(60),
  modelo: z.string().trim().min(1, "Escribe el modelo").max(80),
  /** Texto del pedido del que sale el modelo: se guarda como alias para reconocerlo solo la próxima vez. */
  texto: z.string().trim().max(300).optional(),
});

const clave = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

/**
 * Crea la marca y el modelo que figuran en un pedido y no existían (o reutiliza los que ya existan con el mismo nombre,
 * sin distinguir mayúsculas ni acentos). Todo en una transacción. Devuelve el identificador del modelo.
 */
export async function crearModeloDePedido(ej: Ejecutor, entrada: z.infer<typeof esquemaCrearModeloPedido>): Promise<{ id_modelo: number; id_marca: number; marca_creada: boolean; modelo_creado: boolean }> {
  return ej.transaction(async (tx) => {
    const cat = await leerCatalogos(tx);
    const marca = cat.marcas.find((m) => clave(m.nombre) === clave(entrada.marca));
    const marcaCreada = !marca;
    let idMarca = marca?.id_marca;
    if (idMarca === undefined) {
      const [n] = await tx.insert(marcas).values({ nombre: entrada.marca, activo: true, accesoRapido: false, sistemaComisiones: false }).returning();
      idMarca = n.idMarca;
    }
    const existente = cat.modelos.find((m) => m.marca_id === idMarca && clave(m.nombre_modelo) === clave(entrada.modelo));
    let idModelo = existente?.id_modelo;
    if (idModelo === undefined) {
      const [n] = await tx.insert(modelos).values({ marcaId: idMarca, nombreModelo: entrada.modelo, accesoRapido: false, ordenAccesoRapido: 0 }).returning();
      idModelo = n.idModelo;
    }
    if (entrada.texto) {
      const alias = claveAprendizaje(entrada.texto, [...cat.marcas.map((m) => m.nombre), entrada.marca]);
      if (alias) await tx.insert(aliasModelos).values({ alias, idModelo }).onConflictDoUpdate({ target: aliasModelos.alias, set: { idModelo } });
    }
    return { id_modelo: idModelo, id_marca: idMarca, marca_creada: marcaCreada, modelo_creado: !existente };
  });
}

const normalizar = (t: string) => t.replace(/[\s.-]/g, "").toUpperCase();

/**
 * Expedientes no eliminados que podrían ser el mismo pedido: mismo bastidor, misma matrícula, o mismo cliente (por DNI)
 * con la misma fecha de pedido y el mismo modelo. Solo sirve para avisar.
 */
export async function buscarExpedientesSimilares(ej: Ejecutor, d: DatosPedido): Promise<ExpedienteSimilar[]> {
  const condiciones = [];
  if (d.vin) condiciones.push(sql`upper(replace(${expedientes.vin}, ' ', '')) = ${normalizar(d.vin)}`);
  if (d.matricula) condiciones.push(sql`upper(replace(replace(${expedientes.matricula}, ' ', ''), '-', '')) = ${normalizar(d.matricula)}`);
  if (d.dni && d.fechaExpediente && d.idModelo) {
    condiciones.push(and(sql`upper(replace(replace(${clientes.dni}, ' ', ''), '-', '')) = ${normalizar(d.dni)}`, eq(expedientes.fechaExpediente, d.fechaExpediente), eq(expedientes.idModelo, d.idModelo)));
  }
  // Mismo cliente (por nombre) y misma fecha de pedido: los pedidos de coche nuevo no traen bastidor ni matrícula
  if (d.cliente && d.fechaExpediente) {
    condiciones.push(and(sql`lower(${clientes.nombre}) = lower(${d.cliente.trim()})`, eq(expedientes.fechaExpediente, d.fechaExpediente), d.idModelo ? eq(expedientes.idModelo, d.idModelo) : undefined));
  }
  if (condiciones.length === 0) return [];
  const filas = await ej
    .select({ id: expedientes.idExpediente, vin: expedientes.vin, matricula: expedientes.matricula, cliente: clientes.nombre, fecha: expedientes.fechaExpediente })
    .from(expedientes)
    .leftJoin(clientes, eq(clientes.id, expedientes.idCliente))
    .where(and(isNull(expedientes.eliminadoEn), or(...condiciones)))
    .limit(5);
  return filas.map((f) => ({
    idExpediente: f.id,
    motivo: d.vin && f.vin && normalizar(f.vin) === normalizar(d.vin) ? "mismo bastidor" : d.matricula && f.matricula && normalizar(f.matricula) === normalizar(d.matricula) ? "misma matrícula" : "mismo cliente, fecha y modelo",
    cliente: f.cliente,
    fecha: f.fecha,
  }));
}
