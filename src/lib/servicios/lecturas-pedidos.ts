import { createHash } from "node:crypto";
import os from "node:os";
import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Ejecutor } from "@/db";
import { clientes, expedientes, lecturasPedidos, usuarios } from "@/db/schema";
import { cifrarBuffer, descifrarBuffer } from "@/lib/auth/cifrado";
import { HttpError } from "@/lib/auth/sesion";
import { parsearPedido } from "@/lib/documentos/pedido";
import { guardarAdjunto } from "./adjuntos";
import { NO_ES_PEDIDO, leerPedido, type ResultadoPedido } from "./documentos";
import { MAX_BYTES_OCR, tipoDeFichero } from "./ocr";

/**
 * Lectura de pedidos en lote. Cada PDF o foto se guarda (cifrado) en `lecturas_pedidos` nada más subirse, antes de leerlo, como
 * «pendiente». Varios lectores en paralelo van cogiendo de esa lista de uno en uno (cada lector marca el suyo como «leyendo»,
 * así nadie lee dos veces el mismo). Si el servidor se reinicia, lo que estaba leyéndose vuelve a pendiente. Cada documento
 * acaba como «pedido», «descartado» (no es un pedido) o «error» (se puede reintentar); nunca desaparece en silencio.
 */

export type EstadoLectura = "pendiente" | "leyendo" | "pedido" | "descartado" | "error" | "cancelado";

export const esquemaDestinoLectura = z.object({
  eleccion: z.unknown().nullish(),
  idExpediente: z.number().int().positive().nullish(),
});
export type DestinoLectura = z.infer<typeof esquemaDestinoLectura>;

export interface LecturaDto {
  id: number;
  nombre: string;
  estado: EstadoLectura;
  error: string | null;
  destino: DestinoLectura | null;
  /** Solo en los «pedido» que aún no se han recogido. */
  resultado: ResultadoPedido | null;
  creadaEn: string;
}

export interface ResumenLecturas {
  pendientes: number;
  leyendo: number;
  pedidos: number;
  descartados: number;
  errores: number;
  /** Cuántas lecturas hace a la vez este equipo. */
  lectores: number;
}

/**
 * Lecturas simultáneas. Cada una gasta memoria (la hoja dibujada y el reconocimiento de texto), así que el límite lo ponen los
 * núcleos y la memoria del equipo: en un PC potente salen bastantes y en una Raspberry Pi, dos. Se puede fijar con la variable
 * de entorno `LECTORES_PEDIDOS`.
 */
export function lectoresPermitidos(): number {
  const fijo = Number(process.env.LECTORES_PEDIDOS);
  if (Number.isInteger(fijo) && fijo > 0) return Math.min(fijo, 32);
  const porNucleos = Math.floor(os.availableParallelism() / 2);
  const porMemoria = Math.floor(os.totalmem() / (1.5 * 1024 ** 3));
  return Math.max(1, Math.min(16, porNucleos, porMemoria));
}

const MAX_DIAS_FICHERO = 7;
const MAX_DIAS_REGISTRO = 90;

interface EstadoLectores {
  activos: number;
  reservando: boolean;
  reanudado: boolean;
}
const G = globalThis as unknown as { __lectoresPedidos?: EstadoLectores };
const estadoLectores = (): EstadoLectores => (G.__lectoresPedidos ??= { activos: 0, reservando: false, reanudado: false });

/* ------------------------------------------------------------------ */
/* Cola                                                                */
/* ------------------------------------------------------------------ */

export async function encolarLectura(ej: Ejecutor, idUsuario: number, nombre: string, datos: Buffer, destino: DestinoLectura | null, permitirDuplicados: boolean): Promise<{ id: number; estado: EstadoLectura }> {
  if (datos.length === 0) throw new HttpError(400, "El fichero está vacío.");
  if (datos.length > MAX_BYTES_OCR) throw new HttpError(413, "El fichero es demasiado grande (máximo 15 MB).");
  if (!tipoDeFichero(datos)) throw new HttpError(415, "Formato no admitido: sube un PDF o una imagen (JPG, PNG, WebP).");
  const nombreLimpio = nombre.replace(/[\\/\0]/g, "_").slice(0, 200) || "pedido";
  const huella = createHash("sha256").update(datos).digest("hex");

  if (!permitirDuplicados) {
    const [previa] = await ej
      .select({ id: lecturasPedidos.id, estado: lecturasPedidos.estado })
      .from(lecturasPedidos)
      .where(and(eq(lecturasPedidos.idUsuario, idUsuario), eq(lecturasPedidos.huella, huella), inArray(lecturasPedidos.estado, ["pendiente", "leyendo", "pedido"])))
      .orderBy(desc(lecturasPedidos.id))
      .limit(1);
    if (previa) {
      const [f] = await ej
        .insert(lecturasPedidos)
        .values({ idUsuario, nombre: nombreLimpio, tamano: datos.length, huella, estado: "descartado", error: "Este mismo archivo ya se subió antes: no se lee otra vez.", terminadaEn: new Date() })
        .returning({ id: lecturasPedidos.id });
      return { id: f.id, estado: "descartado" };
    }
  }

  const [f] = await ej
    .insert(lecturasPedidos)
    .values({ idUsuario, nombre: nombreLimpio, tamano: datos.length, huella, datos: cifrarBuffer(datos), destino: destino ?? null, permitirDuplicados })
    .returning({ id: lecturasPedidos.id });
  despertarLectores();
  return { id: f.id, estado: "pendiente" };
}

/** De lo descartado se guarda el fichero una semana (por si el reconocimiento se equivocó); el registro, tres meses. */
async function limpiarHistorial(ej: Ejecutor): Promise<void> {
  const semana = new Date(Date.now() - MAX_DIAS_FICHERO * 24 * 3600 * 1000);
  await ej.update(lecturasPedidos).set({ datos: null }).where(and(isNotNull(lecturasPedidos.datos), lt(lecturasPedidos.terminadaEn, semana), inArray(lecturasPedidos.estado, ["descartado", "cancelado"])));
  const tresMeses = new Date(Date.now() - MAX_DIAS_REGISTRO * 24 * 3600 * 1000);
  await ej.delete(lecturasPedidos).where(and(lt(lecturasPedidos.terminadaEn, tresMeses), inArray(lecturasPedidos.estado, ["descartado", "cancelado", "pedido"])));
}

export async function listarLecturas(ej: Ejecutor, idUsuario: number): Promise<{ resumen: ResumenLecturas; lecturas: LecturaDto[] }> {
  await reanudarLecturas();
  despertarLectores();
  await limpiarHistorial(ej);

  const filas = await ej
    .select({ id: lecturasPedidos.id, nombre: lecturasPedidos.nombre, estado: lecturasPedidos.estado, error: lecturasPedidos.error, destino: lecturasPedidos.destino, resultado: lecturasPedidos.resultado, creadaEn: lecturasPedidos.creadaEn })
    .from(lecturasPedidos)
    .where(and(eq(lecturasPedidos.idUsuario, idUsuario), isNull(lecturasPedidos.recogidaEn)))
    .orderBy(lecturasPedidos.id)
    .limit(2000);
  const cuenta = (e: EstadoLectura) => filas.filter((f) => f.estado === e).length;
  return {
    resumen: { pendientes: cuenta("pendiente"), leyendo: cuenta("leyendo"), pedidos: cuenta("pedido"), descartados: cuenta("descartado"), errores: cuenta("error"), lectores: lectoresPermitidos() },
    lecturas: filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      estado: f.estado as EstadoLectura,
      error: f.error,
      destino: (f.destino as DestinoLectura | null) ?? null,
      resultado: f.estado === "pedido" ? ((f.resultado as ResultadoPedido | null) ?? null) : null,
      creadaEn: f.creadaEn.toISOString(),
    })),
  };
}

export const esquemaAccionLecturas = z.object({
  accion: z.enum(["recoger", "limpiar", "reintentar", "cancelar", "rescatar", "resolver"]),
  ids: z.array(z.number().int().positive()).max(5000).optional(),
  /** Solo en «resolver»: qué se hizo con el pedido y con qué expediente. */
  resolucion: z.enum(["creado", "completado", "quitado"]).optional(),
  idExpediente: z.number().int().positive().nullish(),
});

/**
 * - recoger: el navegador ya ha puesto esos pedidos en su cola (dejan de listarse).
 * - limpiar: oculta los descartados y cancelados de la lista.
 * - reintentar: vuelve a poner en pendiente los que dieron error.
 * - cancelar: los que aún no han empezado se cancelan (los que se están leyendo terminan).
 * - rescatar: un descartado o con error pasa a la cola de pedidos para rellenarlo a mano mirando el PDF.
 * - resolver: deja anotado en el registro qué se hizo con el pedido (expediente creado o completado, o quitado de la cola).
 */
export async function accionLecturas(ej: Ejecutor, idUsuario: number, e: z.infer<typeof esquemaAccionLecturas>): Promise<number> {
  const suyas = eq(lecturasPedidos.idUsuario, idUsuario);
  const deLaLista = e.ids && e.ids.length > 0 ? inArray(lecturasPedidos.id, e.ids) : undefined;
  const ahora = new Date();
  switch (e.accion) {
    case "recoger": {
      const r = await ej.update(lecturasPedidos).set({ recogidaEn: ahora }).where(and(suyas, eq(lecturasPedidos.estado, "pedido"), deLaLista)).returning({ id: lecturasPedidos.id });
      return r.length;
    }
    case "limpiar": {
      const r = await ej.update(lecturasPedidos).set({ recogidaEn: ahora }).where(and(suyas, inArray(lecturasPedidos.estado, ["descartado", "cancelado"]), deLaLista)).returning({ id: lecturasPedidos.id });
      return r.length;
    }
    case "reintentar": {
      const r = await ej
        .update(lecturasPedidos)
        .set({ estado: "pendiente", error: null, terminadaEn: null })
        .where(and(suyas, eq(lecturasPedidos.estado, "error"), sql`${lecturasPedidos.datos} is not null`, deLaLista))
        .returning({ id: lecturasPedidos.id });
      despertarLectores();
      return r.length;
    }
    case "rescatar": {
      let n = 0;
      for (const id of e.ids ?? []) if (await rescatarLectura(ej, idUsuario, id)) n++;
      return n;
    }
    case "resolver": {
      if (!e.resolucion || !e.ids || e.ids.length === 0) throw new HttpError(400, "Faltan datos para anotar qué se hizo con el pedido");
      const r = await ej.update(lecturasPedidos).set({ resolucion: e.resolucion, idExpediente: e.idExpediente ?? null }).where(and(suyas, inArray(lecturasPedidos.id, e.ids))).returning({ id: lecturasPedidos.id });
      return r.length;
    }
    case "cancelar": {
      const r = await ej
        .update(lecturasPedidos)
        .set({ estado: "cancelado", datos: null, terminadaEn: ahora })
        .where(and(suyas, eq(lecturasPedidos.estado, "pendiente"), deLaLista))
        .returning({ id: lecturasPedidos.id });
      return r.length;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Lectores                                                            */
/* ------------------------------------------------------------------ */

interface FilaReservada {
  id: number;
  id_usuario: number | null;
  nombre: string;
  datos: Buffer | null;
  permitir_duplicados: boolean;
}

/** Marca como «leyendo» el siguiente pendiente y lo devuelve; `skip locked` evita que dos lectores cojan el mismo. */
async function reservar(ej: Ejecutor): Promise<FilaReservada | null> {
  const r = await ej.execute(sql`
    update lecturas_pedidos set estado = 'leyendo', empezada_en = now(), intentos = intentos + 1
    where id = (select id from lecturas_pedidos where estado = 'pendiente' order by id limit 1 for update skip locked)
    returning id, id_usuario, nombre, datos, permitir_duplicados`);
  return (r.rows[0] as unknown as FilaReservada | undefined) ?? null;
}

async function procesar(ej: Ejecutor, fila: FilaReservada): Promise<void> {
  const ahora = () => new Date();
  try {
    if (!fila.datos || fila.id_usuario === null) throw new HttpError(500, "El fichero ya no está guardado: vuelve a subirlo.");
    const datos = descifrarBuffer(Buffer.from(fila.datos));
    const r = await leerPedido(ej, fila.id_usuario, fila.nombre, datos, fila.permitir_duplicados, { paralelo: true });
    await ej.update(lecturasPedidos).set({ estado: "pedido", resultado: r, datos: null, error: null, terminadaEn: ahora() }).where(eq(lecturasPedidos.id, fila.id));
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se ha podido leer";
    if (e instanceof HttpError && mensaje === NO_ES_PEDIDO) {
      // No es un pedido: no se guarda nada del documento
      await ej.update(lecturasPedidos).set({ estado: "descartado", error: "No es un pedido: se ha ignorado.", terminadaEn: ahora() }).where(eq(lecturasPedidos.id, fila.id));
    } else {
      console.error(`Lectura de pedido ${fila.id} fallida:`, mensaje);
      await ej.update(lecturasPedidos).set({ estado: "error", error: mensaje, terminadaEn: ahora() }).where(eq(lecturasPedidos.id, fila.id));
      // Un fallo de lectura no hace desaparecer el pedido: pasa a la cola para rellenarlo a mano mirando el PDF
      if (fila.id_usuario !== null) await rescatarLectura(ej, fila.id_usuario, fila.id).catch(() => undefined);
    }
  }
}

async function bucle(): Promise<void> {
  const st = estadoLectores();
  if (st.reservando) return;
  st.reservando = true;
  try {
    while (st.activos < lectoresPermitidos()) {
      const fila = await reservar(db);
      if (!fila) break;
      st.activos++;
      void procesar(db, fila)
        .catch((e: unknown) => console.error("Error en un lector de pedidos:", e instanceof Error ? e.message : e))
        .finally(() => {
          st.activos--;
          despertarLectores();
        });
    }
  } catch (e) {
    console.error("No se pudo reservar una lectura de pedido:", e instanceof Error ? e.message : e);
  } finally {
    st.reservando = false;
  }
}

/**
 * Pasa a la cola de pedidos un documento descartado o con error, con los datos vacíos y un aviso, para rellenarlo a mano
 * mirando el PDF. Devuelve false si ya no se conserva el fichero.
 */
export async function rescatarLectura(ej: Ejecutor, idUsuario: number, id: number): Promise<boolean> {
  const [f] = await ej.select().from(lecturasPedidos).where(and(eq(lecturasPedidos.id, id), eq(lecturasPedidos.idUsuario, idUsuario), inArray(lecturasPedidos.estado, ["error", "descartado"])));
  if (!f?.datos) return false;
  const datos = descifrarBuffer(Buffer.from(f.datos));
  const adjunto = await guardarAdjunto(ej, { datos, nombre: f.nombre, tipo: "pedido", creadoPor: idUsuario });
  const vacio = parsearPedido("", { modelos: [], tiposVenta: [] });
  const motivo = f.estado === "error" ? `No se pudo leer automáticamente (${f.error ?? "error de lectura"})` : "El lector no lo reconoció como un pedido";
  const resultado: ResultadoPedido = { datos: { ...vacio, esPedido: true, avisos: [`${motivo}: rellena los datos a mano mirando el PDF.`] }, similares: [], adjunto, metodo: "ocr" };
  await ej.update(lecturasPedidos).set({ estado: "pedido", resultado, datos: null, recogidaEn: null, terminadaEn: new Date() }).where(eq(lecturasPedidos.id, id));
  return true;
}

export interface RegistroLectura {
  id: number;
  nombre: string;
  usuario: string | null;
  estado: EstadoLectura;
  error: string | null;
  creadaEn: string;
  terminadaEn: string | null;
  /** Lo que se leyó, si fue un pedido. */
  cliente: string | null;
  numeroPedido: string | null;
  vehiculo: string | null;
  avisos: string[];
  resolucion: "creado" | "completado" | "quitado" | null;
  idExpediente: number | null;
  /** Si el expediente enlazado sigue existiendo (no eliminado). */
  expedienteActivo: boolean;
  /** Se conserva el fichero (descartados, una semana): se puede rescatar a la cola. */
  rescatable: boolean;
}

/** Registro de lecturas (tres meses): qué pasó con cada documento, para localizar fallos de lectura. El administrador ve todos. */
export async function registroLecturas(ej: Ejecutor, idUsuario: number, esAdmin: boolean): Promise<RegistroLectura[]> {
  await limpiarHistorial(ej);
  const filas = await ej
    .select({
      id: lecturasPedidos.id,
      nombre: lecturasPedidos.nombre,
      usuario: usuarios.nombre,
      estado: lecturasPedidos.estado,
      error: lecturasPedidos.error,
      creadaEn: lecturasPedidos.creadaEn,
      terminadaEn: lecturasPedidos.terminadaEn,
      resultado: lecturasPedidos.resultado,
      resolucion: lecturasPedidos.resolucion,
      idExpediente: lecturasPedidos.idExpediente,
      tieneDatos: sql<boolean>`${lecturasPedidos.datos} is not null`,
      expedienteVivo: sql<boolean>`${expedientes.idExpediente} is not null and ${expedientes.eliminadoEn} is null`,
      clienteExp: clientes.nombre,
    })
    .from(lecturasPedidos)
    .leftJoin(usuarios, eq(usuarios.idUsuario, lecturasPedidos.idUsuario))
    .leftJoin(expedientes, eq(expedientes.idExpediente, lecturasPedidos.idExpediente))
    .leftJoin(clientes, eq(clientes.id, expedientes.idCliente))
    .where(esAdmin ? undefined : eq(lecturasPedidos.idUsuario, idUsuario))
    .orderBy(desc(lecturasPedidos.id))
    .limit(3000);
  return filas.map((f) => {
    const r = (f.resultado as ResultadoPedido | null) ?? null;
    return {
      id: f.id,
      nombre: f.nombre,
      usuario: f.usuario,
      estado: f.estado as EstadoLectura,
      error: f.error,
      creadaEn: f.creadaEn.toISOString(),
      terminadaEn: f.terminadaEn?.toISOString() ?? null,
      cliente: r?.datos.cliente ?? f.clienteExp ?? null,
      numeroPedido: r?.datos.numeroPedido ?? null,
      vehiculo: r?.datos.modeloTexto ?? null,
      avisos: r?.datos.avisos ?? [],
      resolucion: (f.resolucion as RegistroLectura["resolucion"]) ?? null,
      idExpediente: f.idExpediente,
      expedienteActivo: !!f.expedienteVivo,
      rescatable: f.tieneDatos && (f.estado === "descartado" || f.estado === "error"),
    };
  });
}

/** Pone a trabajar a los lectores que falten (no espera a que terminen). */
export function despertarLectores(): void {
  void bucle();
}

/** Tras un reinicio del servidor, lo que estaba leyéndose vuelve a pendiente. Se hace una vez por arranque. */
export async function reanudarLecturas(): Promise<void> {
  const st = estadoLectores();
  if (st.reanudado) return;
  st.reanudado = true;
  try {
    await db.update(lecturasPedidos).set({ estado: "pendiente" }).where(eq(lecturasPedidos.estado, "leyendo"));
    despertarLectores();
  } catch (e) {
    st.reanudado = false;
    console.error("No se pudieron retomar las lecturas pendientes:", e instanceof Error ? e.message : e);
  }
}
