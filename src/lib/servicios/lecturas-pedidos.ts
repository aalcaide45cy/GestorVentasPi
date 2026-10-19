import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Ejecutor } from "@/db";
import { adjuntos, clientes, expedientes, lecturasPedidos, usuarios } from "@/db/schema";
import { cifrarBuffer, descifrarBuffer } from "@/lib/auth/cifrado";
import { HttpError } from "@/lib/auth/sesion";
import { parsearPedido } from "@/lib/documentos/pedido";
import { guardarAdjunto } from "./adjuntos";
import { NoEsPedidoError, leerPedido, type ResultadoPedido } from "./documentos";
import { carpetaCopias } from "@/lib/mantenimiento";
import { MAX_BYTES_OCR, tipoDeFichero } from "./ocr";
import { ajustesOcr, cargarAjustesOcr } from "./ocr-ajustes";

/**
 * Lectura de pedidos en lote. Cada PDF o foto se guarda (cifrado) en `lecturas_pedidos` nada más subirse, antes de leerlo, como
 * «pendiente». Varios lectores en paralelo van cogiendo de esa lista de uno en uno (cada lector marca el suyo como «leyendo»,
 * así nadie lee dos veces el mismo). Si el servidor se reinicia, lo que estaba leyéndose vuelve a pendiente. Cada documento
 * acaba como «pedido», «descartado» (no es un pedido) o «error» (se puede reintentar); nunca desaparece en silencio.
 */

export type EstadoLectura = "subiendo" | "pendiente" | "leyendo" | "pedido" | "descartado" | "error" | "cancelado";

export const esquemaDestinoLectura = z.object({
  eleccion: z.unknown().nullish(),
  idExpediente: z.number().int().positive().nullish(),
  /** DNI soltado junto con este pedido: ya está leído y guardado (adjuntos pendientes) y se une al expediente cuando se cree o se complete. */
  dni: z
    .object({
      adjuntos: z.array(z.number().int().positive()).max(6),
      fotoId: z.number().int().positive().nullish(),
      fechaNacimiento: z.string().max(10).nullish(),
    })
    .nullish(),
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
  /** Subidos pero todavía no se empieza a leer (la lectura arranca al terminar la subida del lote). */
  subiendo: number;
  pendientes: number;
  leyendo: number;
  pedidos: number;
  descartados: number;
  errores: number;
  /** Cuántas lecturas se hacen a la vez ahora y el máximo que admite este equipo. */
  lectores: number;
  maximo: number;
  /** Lectura manual: lo subido espera a que el usuario pulse «Iniciar lectura». */
  manual: boolean;
}

/**
 * Lecturas simultáneas. Cada una gasta memoria (la hoja dibujada y el reconocimiento de texto), así que el límite lo ponen los
 * núcleos y la memoria del equipo: en un PC potente salen bastantes y en una Raspberry Pi, dos. Se puede fijar con la variable
 * de entorno `LECTORES_PEDIDOS` o, mejor, en Configuración (ajuste «lecturas a la vez»; 0 = automático).
 */
export function lectoresPermitidos(): number {
  const fijo = Number(process.env.LECTORES_PEDIDOS);
  if (Number.isInteger(fijo) && fijo > 0) return Math.min(fijo, 32);
  const elegido = ajustesOcr().simultaneas;
  if (elegido > 0) return Math.min(elegido, 32);
  // Por defecto, hasta 6 a la vez (2 en una Raspberry, que además de leer atiende la aplicación y la base de datos): leer miles de
  // pedidos va sobrado de rápido sin forzar el equipo. Se puede cambiar en Configuración › BBDD › Sistema.
  const enRaspberry = process.arch === "arm64" && process.platform === "linux";
  const porNucleos = Math.floor(os.availableParallelism() * 0.75);
  const porMemoria = Math.floor(os.totalmem() / (1.5 * 1024 ** 3));
  return Math.max(1, Math.min(enRaspberry ? 2 : MAXIMO_POR_DEFECTO, porNucleos, porMemoria));
}

/** ¿Se fijó el número de lectores a mano (`LECTORES_PEDIDOS`)? Entonces no se ajusta solo. */
const lectoresFijos = (): boolean => (Number.isInteger(Number(process.env.LECTORES_PEDIDOS)) && Number(process.env.LECTORES_PEDIDOS) > 0) || ajustesOcr().simultaneas > 0;

const MAXIMO_POR_DEFECTO = 6;

/** Lecturas con las que se arranca; de ahí se sube poco a poco mientras el equipo vaya sobrado. */
export const LECTORES_INICIALES = 2;
const CPU_SUBIR = 75;
const CPU_BAJAR = 92;
const MEMORIA_LIBRE_SUBIR = 0.2;
const MEMORIA_LIBRE_BAJAR = 0.1;

/**
 * Cuántas lecturas se permiten ahora, según cómo va el equipo. Sube de una en una (no de golpe) si hay trabajo en espera y sobran
 * CPU y memoria, y baja si el consumo se acerca al límite. Es una función pura para poder probarla.
 */
export function ajustarLectores(actual: number, medida: { cpu: number; memoriaLibre: number; enEspera: number; activos: number }, maximo: number): number {
  if (medida.cpu > CPU_BAJAR || medida.memoriaLibre < MEMORIA_LIBRE_BAJAR) return Math.max(1, Math.min(actual, medida.activos) - 1);
  if (medida.enEspera > 0 && medida.activos >= actual && medida.cpu < CPU_SUBIR && medida.memoriaLibre > MEMORIA_LIBRE_SUBIR) return Math.min(maximo, actual + 1);
  return actual;
}

const MAX_DIAS_REGISTRO = 90;

interface EstadoLectores {
  activos: number;
  reservando: boolean;
  reanudado: boolean;
  /** Lecturas simultáneas permitidas ahora (se ajusta sola). */
  objetivo: number;
  vigilante: ReturnType<typeof setInterval> | null;
  cpuAnterior: { reposo: number; total: number } | null;
}
const G = globalThis as unknown as { __lectoresPedidos?: EstadoLectores };
const estadoLectores = (): EstadoLectores => (G.__lectoresPedidos ??= { activos: 0, reservando: false, reanudado: false, objetivo: LECTORES_INICIALES, vigilante: null, cpuAnterior: null });

/** Lecturas simultáneas permitidas ahora. */
function limiteActual(): number {
  return lectoresFijos() ? lectoresPermitidos() : Math.min(estadoLectores().objetivo, lectoresPermitidos());
}

/** Uso de CPU de todo el equipo desde la medida anterior (0 a 100). */
function usoCpu(st: EstadoLectores): number {
  const t = os.cpus().reduce((a, c) => ({ reposo: a.reposo + c.times.idle, total: a.total + c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq }), { reposo: 0, total: 0 });
  const antes = st.cpuAnterior;
  st.cpuAnterior = t;
  if (!antes || t.total === antes.total) return 0;
  return Math.round(100 * (1 - (t.reposo - antes.reposo) / (t.total - antes.total)));
}

/** Mientras haya lecturas en marcha o en espera, cada pocos segundos mide el equipo y ajusta cuántas se hacen a la vez. */
function vigilar(): void {
  const st = estadoLectores();
  if (st.vigilante || lectoresFijos()) return;
  st.cpuAnterior = null;
  usoCpu(st);
  st.vigilante = setInterval(() => {
    void (async () => {
      try {
        const [{ n }] = (await db.execute(sql`select count(*)::int as n from lecturas_pedidos where estado = 'pendiente'`)).rows as unknown as { n: number }[];
        if (n === 0 && st.activos === 0) {
          // Sin trabajo: se para y la próxima tanda vuelve a empezar despacio
          if (st.vigilante) clearInterval(st.vigilante);
          st.vigilante = null;
          st.objetivo = LECTORES_INICIALES;
          return;
        }
        const nuevo = ajustarLectores(st.objetivo, { cpu: usoCpu(st), memoriaLibre: os.freemem() / os.totalmem(), enEspera: n, activos: st.activos }, lectoresPermitidos());
        if (nuevo !== st.objetivo) {
          st.objetivo = nuevo;
          despertarLectores();
        }
      } catch {
        /* una medida fallida no cambia nada */
      }
    })();
  }, 3000);
  st.vigilante.unref?.();
}

/* ------------------------------------------------------------------ */
/* Ficheros en espera                                                  */
/* ------------------------------------------------------------------ */

/** Los ficheros esperan su lectura en disco (cifrados), no en la base: con miles de PDF no la engordan ni sus copias de seguridad. */
export function carpetaLecturas(): string {
  return process.env.LECTURAS_DIR ?? path.join(/*turbopackIgnore: true*/ carpetaCopias(), "lecturas-pendientes");
}

async function guardarFichero(datos: Buffer): Promise<string> {
  const dir = carpetaLecturas();
  await mkdir(dir, { recursive: true });
  const ruta = path.join(/*turbopackIgnore: true*/ dir, `${randomUUID()}.bin`);
  await writeFile(ruta, cifrarBuffer(datos));
  return ruta;
}

async function leerFichero(ruta: string): Promise<Buffer> {
  return descifrarBuffer(await readFile(ruta));
}

async function borrarFicheros(rutas: (string | null | undefined)[]): Promise<void> {
  await Promise.all(rutas.filter((r): r is string => !!r).map((r) => rm(r, { force: true }).catch(() => undefined)));
}

/** Borra la carpeta de ficheros en espera (al vaciar la base de datos). */
export async function borrarTodosLosFicheros(): Promise<void> {
  await rm(carpetaLecturas(), { recursive: true, force: true }).catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* Cola                                                                */
/* ------------------------------------------------------------------ */

export async function encolarLectura(ej: Ejecutor, idUsuario: number, nombre: string, datos: Buffer, destino: DestinoLectura | null, permitirDuplicados: boolean, retener = false): Promise<{ id: number; estado: EstadoLectura }> {
  if (datos.length === 0) throw new HttpError(400, "El fichero está vacío.");
  if (datos.length > MAX_BYTES_OCR) throw new HttpError(413, "El fichero es demasiado grande (máximo 500 MB).");
  if (!tipoDeFichero(datos)) throw new HttpError(415, "Formato no admitido: sube un PDF o una imagen (JPG, PNG, WebP).");
  const nombreLimpio = nombre.replace(/[\\/\0]/g, "_").slice(0, 200) || "pedido";
  const huella = createHash("sha256").update(datos).digest("hex");

  if (!permitirDuplicados) {
    const [previa] = await ej
      .select({ id: lecturasPedidos.id, estado: lecturasPedidos.estado })
      .from(lecturasPedidos)
      .where(and(eq(lecturasPedidos.idUsuario, idUsuario), eq(lecturasPedidos.huella, huella), inArray(lecturasPedidos.estado, ["subiendo", "pendiente", "leyendo", "pedido"])))
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

  const ruta = await guardarFichero(datos);
  let f: { id: number };
  try {
    [f] = await ej
      .insert(lecturasPedidos)
      .values({ idUsuario, nombre: nombreLimpio, tamano: datos.length, huella, ruta, destino: destino ?? null, permitirDuplicados, estado: retener ? "subiendo" : "pendiente" })
      .returning({ id: lecturasPedidos.id });
  } catch (e) {
    await borrarFicheros([ruta]);
    throw e;
  }
  // En una subida por lotes no se empieza a leer hasta que termine («iniciar»): subir y leer a la vez recarga demasiado el equipo
  if (!retener) despertarLectores();
  return { id: f.id, estado: retener ? "subiendo" : "pendiente" };
}

/** Se limpia el historial como mucho cada diez minutos (no en cada consulta). */
let ultimaLimpieza = 0;
async function limpiarHistorial(ej: Ejecutor, forzar = false): Promise<void> {
  if (!forzar && Date.now() - ultimaLimpieza < 10 * 60 * 1000) return;
  ultimaLimpieza = Date.now();
  const tresMeses = new Date(Date.now() - MAX_DIAS_REGISTRO * 24 * 3600 * 1000);
  await ej.delete(lecturasPedidos).where(and(lt(lecturasPedidos.terminadaEn, tresMeses), inArray(lecturasPedidos.estado, ["descartado", "cancelado", "pedido"])));
}

/** Los subidos de un lote que quedó a medias (se cerró la página) empiezan a leerse pasado un minuto y medio sin novedades. */
async function promoverAbandonadas(ej: Ejecutor, idUsuario?: number): Promise<void> {
  // En lectura manual lo subido espera hasta que el usuario pulse «Iniciar lectura»: nada empieza solo
  if ((await cargarAjustesOcr(ej)).lecturaManual) return;
  const usuariosConLote = idUsuario !== undefined ? [idUsuario] : (await ej.selectDistinct({ id: lecturasPedidos.idUsuario }).from(lecturasPedidos).where(eq(lecturasPedidos.estado, "subiendo"))).flatMap((u) => (u.id === null ? [] : [u.id]));
  for (const id of usuariosConLote) {
    // La subconsulta no depende de la fila (se calcula una vez), para que con decenas de miles de ficheros siga siendo instantánea
    const r = await ej.execute(sql`
      update lecturas_pedidos set estado = 'pendiente'
      where estado = 'subiendo' and id_usuario = ${id}
        and (select max(creada_en) from lecturas_pedidos where estado = 'subiendo' and id_usuario = ${id}) < now() - interval '90 seconds'`);
    if ((r.rowCount ?? 0) > 0) despertarLectores();
  }
}

/**
 * Resumen (contado en la base, valga cuantos haya) y lista corta: por defecto los pedidos ya leídos que aún no se han recogido
 * (de 60 en 60); con `otros`, los ignorados, con error y cancelados (los 500 últimos).
 */
export interface LecturaEnMarcha {
  id: number;
  nombre: string;
  estado: "subiendo" | "pendiente" | "leyendo";
}

export async function listarLecturas(ej: Ejecutor, idUsuario: number, opciones: { otros?: boolean } = {}): Promise<{ resumen: ResumenLecturas; lecturas: LecturaDto[]; enMarcha: LecturaEnMarcha[] }> {
  await reanudarLecturas();
  await promoverAbandonadas(ej, idUsuario);
  despertarLectores();
  await limpiarHistorial(ej);

  const suyas = and(eq(lecturasPedidos.idUsuario, idUsuario), isNull(lecturasPedidos.recogidaEn));
  const cuentas = await ej.select({ estado: lecturasPedidos.estado, n: sql<number>`count(*)::int` }).from(lecturasPedidos).where(suyas).groupBy(lecturasPedidos.estado);
  const n = (e: EstadoLectura) => cuentas.find((c) => c.estado === e)?.n ?? 0;
  const filas = await ej
    .select({ id: lecturasPedidos.id, nombre: lecturasPedidos.nombre, estado: lecturasPedidos.estado, error: lecturasPedidos.error, destino: lecturasPedidos.destino, resultado: opciones.otros ? sql<null>`null` : lecturasPedidos.resultado, creadaEn: lecturasPedidos.creadaEn })
    .from(lecturasPedidos)
    .where(and(suyas, opciones.otros ? inArray(lecturasPedidos.estado, ["descartado", "error", "cancelado"]) : eq(lecturasPedidos.estado, "pedido")))
    .orderBy(opciones.otros ? desc(lecturasPedidos.id) : lecturasPedidos.id)
    .limit(opciones.otros ? 500 : 60);
  // Lo que se está subiendo, esperando o leyendo (los 100 primeros), para poder cancelar cada uno
  const enMarcha = await ej
    .select({ id: lecturasPedidos.id, nombre: lecturasPedidos.nombre, estado: lecturasPedidos.estado })
    .from(lecturasPedidos)
    .where(and(suyas, inArray(lecturasPedidos.estado, ["subiendo", "pendiente", "leyendo"])))
    .orderBy(lecturasPedidos.id)
    .limit(100);
  return {
    enMarcha: enMarcha as LecturaEnMarcha[],
    resumen: { subiendo: n("subiendo"), pendientes: n("pendiente"), leyendo: n("leyendo"), pedidos: n("pedido"), descartados: n("descartado"), errores: n("error"), lectores: limiteActual(), maximo: lectoresPermitidos(), manual: (await cargarAjustesOcr(ej)).lecturaManual },
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
  accion: z.enum(["recoger", "limpiar", "reintentar", "cancelar", "rescatar", "resolver", "iniciar"]),
  /** Solo en «iniciar»: lo manda el navegador al terminar de subir; en lectura manual no hace nada (la lectura la inicia el usuario). */
  automatico: z.boolean().optional(),
  ids: z.array(z.number().int().positive()).max(5000).optional(),
  /** Solo en «resolver»: qué se hizo con el pedido y con qué expediente. */
  resolucion: z.enum(["creado", "completado", "quitado"]).optional(),
  idExpediente: z.number().int().positive().nullish(),
});

/**
 * - recoger: el navegador ya ha puesto esos pedidos en su cola (dejan de listarse).
 * - limpiar: oculta los descartados y cancelados de la lista.
 * - reintentar: vuelve a poner en pendiente los que dieron error.
 * - iniciar: termina la subida de un lote: lo subido empieza a leerse (hasta entonces no se lee nada).
 * - cancelar: se cancelan los que se están subiendo, los que esperan y los que se están leyendo: el lector acaba la hoja en la que está,
 *   pero tira el resultado y borra el documento que hubiera guardado (nada queda a medias). Con `ids`, solo esos.
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
      const r = await ej.update(lecturasPedidos).set({ recogidaEn: ahora }).where(and(suyas, inArray(lecturasPedidos.estado, e.ids && e.ids.length > 0 ? ["descartado", "cancelado", "error"] : ["descartado", "cancelado"]), deLaLista)).returning({ id: lecturasPedidos.id });
      return r.length;
    }
    case "reintentar": {
      const r = await ej
        .update(lecturasPedidos)
        .set({ estado: "pendiente", error: null, terminadaEn: null })
        .where(and(suyas, eq(lecturasPedidos.estado, "error"), sql`(${lecturasPedidos.ruta} is not null or ${lecturasPedidos.datos} is not null)`, deLaLista))
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
    case "iniciar": {
      if (e.automatico && (await cargarAjustesOcr(ej)).lecturaManual) return 0;
      const r = await ej.update(lecturasPedidos).set({ estado: "pendiente" }).where(and(suyas, eq(lecturasPedidos.estado, "subiendo"), deLaLista)).returning({ id: lecturasPedidos.id });
      despertarLectores();
      return r.length;
    }
    case "cancelar": {
      const enMarcha = inArray(lecturasPedidos.estado, ["subiendo", "pendiente", "leyendo"]);
      const aCancelar = await ej.select({ ruta: lecturasPedidos.ruta }).from(lecturasPedidos).where(and(suyas, enMarcha, deLaLista));
      await borrarFicheros(aCancelar.map((x) => x.ruta));
      const r = await ej
        .update(lecturasPedidos)
        .set({ estado: "cancelado", datos: null, ruta: null, terminadaEn: ahora })
        .where(and(suyas, enMarcha, deLaLista))
        .returning({ id: lecturasPedidos.id });
      return r.length;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Lectores                                                            */
/* ------------------------------------------------------------------ */

export interface FilaReservada {
  id: number;
  id_usuario: number | null;
  nombre: string;
  datos: Buffer | null;
  ruta: string | null;
  permitir_duplicados: boolean;
}

/** Marca como «leyendo» el siguiente pendiente y lo devuelve; `skip locked` evita que dos lectores cojan el mismo. */
async function reservar(ej: Ejecutor): Promise<FilaReservada | null> {
  const r = await ej.execute(sql`
    update lecturas_pedidos set estado = 'leyendo', empezada_en = now(), intentos = intentos + 1
    where id = (select id from lecturas_pedidos where estado = 'pendiente' order by id limit 1 for update skip locked)
    returning id, id_usuario, nombre, datos, ruta, permitir_duplicados`);
  return (r.rows[0] as unknown as FilaReservada | undefined) ?? null;
}

/** ¿Sigue la lectura en marcha? (Si el usuario la canceló, su fila ya no está «leyendo».) */
async function sigueLeyendo(ej: Ejecutor, id: number): Promise<boolean> {
  const [f] = await ej.select({ e: lecturasPedidos.estado }).from(lecturasPedidos).where(eq(lecturasPedidos.id, id));
  return f?.e === "leyendo";
}

export async function procesar(ej: Ejecutor, fila: FilaReservada): Promise<void> {
  const ahora = () => new Date();
  try {
    if ((!fila.ruta && !fila.datos) || fila.id_usuario === null) throw new HttpError(500, "El fichero ya no está guardado: vuelve a subirlo.");
    const datos = fila.ruta ? await leerFichero(fila.ruta).catch(() => { throw new HttpError(500, "El fichero ya no está guardado: vuelve a subirlo."); }) : descifrarBuffer(Buffer.from(fila.datos as Buffer));
    // Cancelada justo después de reservarla: ni se empieza a leer
    if (!(await sigueLeyendo(ej, fila.id))) return;
    const r = await leerPedido(ej, fila.id_usuario, fila.nombre, datos, fila.permitir_duplicados, { paralelo: true });
    const guardada = await ej
      .update(lecturasPedidos)
      .set({ estado: "pedido", resultado: r, datos: null, ruta: null, error: null, terminadaEn: ahora() })
      .where(and(eq(lecturasPedidos.id, fila.id), eq(lecturasPedidos.estado, "leyendo")))
      .returning({ id: lecturasPedidos.id });
    if (guardada.length === 0) {
      // Se canceló mientras se leía: el documento que se guardó al leerlo no debe quedar como un pedido a medias
      await ej.delete(adjuntos).where(eq(adjuntos.id, r.adjunto.id)).catch(() => undefined);
      return;
    }
    await borrarFicheros([fila.ruta]);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se ha podido leer";
    if (e instanceof NoEsPedidoError) {
      // No es un pedido: no se guarda nada del documento, solo el principio de lo que se leyó para poder ver por qué en el registro
      await ej.update(lecturasPedidos).set({ estado: "descartado", datos: null, ruta: null, error: `No es un pedido${e.cabecera ? `: «${e.cabecera}»` : ""}`, terminadaEn: ahora() }).where(and(eq(lecturasPedidos.id, fila.id), eq(lecturasPedidos.estado, "leyendo")));
      await borrarFicheros([fila.ruta]);
    } else {
      console.error(`Lectura de pedido ${fila.id} fallida:`, mensaje);
      const falla = await ej.update(lecturasPedidos).set({ estado: "error", error: mensaje, terminadaEn: ahora() }).where(and(eq(lecturasPedidos.id, fila.id), eq(lecturasPedidos.estado, "leyendo"))).returning({ id: lecturasPedidos.id });
      // Un fallo de lectura no hace desaparecer el pedido: pasa a la cola para rellenarlo a mano mirando el PDF (salvo si se canceló)
      if (falla.length > 0 && fila.id_usuario !== null) await rescatarLectura(ej, fila.id_usuario, fila.id).catch(() => undefined);
    }
  }
}

async function bucle(): Promise<void> {
  const st = estadoLectores();
  if (st.reservando) return;
  st.reservando = true;
  try {
    vigilar();
    while (st.activos < limiteActual()) {
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
  const [f] = await ej.select().from(lecturasPedidos).where(and(eq(lecturasPedidos.id, id), eq(lecturasPedidos.idUsuario, idUsuario), eq(lecturasPedidos.estado, "error")));
  if (!f?.ruta && !f?.datos) return false;
  const datos = f.ruta ? await leerFichero(f.ruta).catch(() => null) : descifrarBuffer(Buffer.from(f.datos as Buffer));
  if (!datos) return false;
  const adjunto = await guardarAdjunto(ej, { datos, nombre: f.nombre, tipo: "pedido", creadoPor: idUsuario });
  const vacio = parsearPedido("", { modelos: [], tiposVenta: [] });
  const motivo = f.estado === "error" ? `No se pudo leer automáticamente (${f.error ?? "error de lectura"})` : "El lector no lo reconoció como un pedido";
  const resultado: ResultadoPedido = { datos: { ...vacio, esPedido: true, avisos: [`${motivo}: rellena los datos a mano mirando el PDF.`] }, similares: [], adjunto, metodo: "ocr" };
  await ej.update(lecturasPedidos).set({ estado: "pedido", resultado, datos: null, ruta: null, recogidaEn: null, terminadaEn: new Date() }).where(eq(lecturasPedidos.id, id));
  await borrarFicheros([f.ruta]);
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
  /** Se conserva el fichero (solo los que dieron error): se puede reintentar o pasar a la cola. */
  rescatable: boolean;
}

/** Registro de lecturas (tres meses): qué pasó con cada documento, para localizar fallos de lectura. El administrador ve todos. */
export async function registroLecturas(ej: Ejecutor, idUsuario: number, esAdmin: boolean): Promise<RegistroLectura[]> {
  await limpiarHistorial(ej, true);
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
      tieneDatos: sql<boolean>`(${lecturasPedidos.datos} is not null or ${lecturasPedidos.ruta} is not null)`,
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
      rescatable: f.tieneDatos && f.estado === "error",
    };
  });
}

/** Pone a trabajar a los lectores que falten (no espera a que terminen). */
export function despertarLectores(): void {
  // Los ajustes de Configuración (lecturas a la vez, motor) se refrescan antes de poner a trabajar a los lectores
  void cargarAjustesOcr().catch(() => undefined);
  void bucle();
}

/** Tras un reinicio del servidor, lo que estaba leyéndose vuelve a pendiente. Se hace una vez por arranque. */
export async function reanudarLecturas(): Promise<void> {
  const st = estadoLectores();
  if (st.reanudado) return;
  st.reanudado = true;
  try {
    await db.update(lecturasPedidos).set({ estado: "pendiente" }).where(eq(lecturasPedidos.estado, "leyendo"));
    await promoverAbandonadas(db);
    despertarLectores();
  } catch (e) {
    st.reanudado = false;
    console.error("No se pudieron retomar las lecturas pendientes:", e instanceof Error ? e.message : e);
  }
}
