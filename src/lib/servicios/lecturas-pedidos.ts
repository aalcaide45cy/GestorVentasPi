import { createHash } from "node:crypto";
import os from "node:os";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Ejecutor } from "@/db";
import { lecturasPedidos } from "@/db/schema";
import { cifrarBuffer, descifrarBuffer } from "@/lib/auth/cifrado";
import { HttpError } from "@/lib/auth/sesion";
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

const MAX_DIAS_HISTORIAL = 7;

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

export async function listarLecturas(ej: Ejecutor, idUsuario: number): Promise<{ resumen: ResumenLecturas; lecturas: LecturaDto[] }> {
  await reanudarLecturas();
  despertarLectores();
  // Limpieza oportunista: lo ya recogido o descartado hace más de una semana
  const corte = new Date(Date.now() - MAX_DIAS_HISTORIAL * 24 * 3600 * 1000);
  await ej.delete(lecturasPedidos).where(and(lt(lecturasPedidos.terminadaEn, corte), or(eq(lecturasPedidos.estado, "descartado"), eq(lecturasPedidos.estado, "cancelado"), eq(lecturasPedidos.estado, "pedido"))));

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
  accion: z.enum(["recoger", "limpiar", "reintentar", "cancelar"]),
  ids: z.array(z.number().int().positive()).max(5000).optional(),
});

/**
 * - recoger: el navegador ya ha puesto esos pedidos en su cola (dejan de listarse).
 * - limpiar: oculta los descartados y cancelados de la lista.
 * - reintentar: vuelve a poner en pendiente los que dieron error.
 * - cancelar: los que aún no han empezado se cancelan (los que se están leyendo terminan).
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
      await ej.update(lecturasPedidos).set({ estado: "descartado", datos: null, error: "No es un pedido: se ha ignorado.", terminadaEn: ahora() }).where(eq(lecturasPedidos.id, fila.id));
    } else {
      console.error(`Lectura de pedido ${fila.id} fallida:`, mensaje);
      await ej.update(lecturasPedidos).set({ estado: "error", error: mensaje, terminadaEn: ahora() }).where(eq(lecturasPedidos.id, fila.id));
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
