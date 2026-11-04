import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { Ejecutor } from "@/db";
import {
  ajustes,
  alertas,
  clientes,
  correoCola,
  correoCuentas,
  correoPlantillas,
  expedientes,
} from "@/db/schema";
import { cifrar, descifrar } from "@/lib/auth/cifrado";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import {
  direccionValida,
  esquemaCorreo,
  rellenarPlantilla,
  separarDirecciones,
  type AjustesCorreoDto,
  type CorreoDto,
  type CuentaDto,
  type EntradaCambioCorreo,
  type EntradaCorreo,
  type EntradaCuenta,
  type EntradaPlantilla,
  type EstadoCorreo,
  type PlantillaDto,
} from "@/lib/correo";
import { leerAdjunto } from "./adjuntos";
import { aDto, relacionesExpediente } from "./expedientes";
import { formatDate } from "@/lib/date-utils";

/* ------------------------------ Transporte ------------------------------ */

type FabricaTransporte = (
  c: typeof correoCuentas.$inferSelect,
  clave: string,
) => Transporte;
interface Transporte {
  sendMail: Transporter["sendMail"];
  verify?: () => Promise<unknown>;
}
let fabrica: FabricaTransporte | null = null;
/** Solo para las pruebas: sustituye el envío real por otro. */
export function fijarTransporteDePrueba(f: FabricaTransporte | null): void {
  fabrica = f;
}
function transporteDe(c: typeof correoCuentas.$inferSelect): Transporte {
  const clave = descifrar(c.passwordCifrada, "correo");
  if (fabrica) return fabrica(c, clave);
  return nodemailer.createTransport({
    host: c.host,
    port: c.puerto,
    secure: c.seguro,
    auth: { user: c.usuarioSmtp, pass: clave },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}
/** El motivo de un fallo, en español y sin datos sensibles. */
function motivoDeError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const c = (e as { code?: string; responseCode?: number })?.code;
  if (c === "EAUTH" || /Invalid login|authentication/i.test(m))
    return "El servidor rechazó el usuario o la contraseña (en Gmail hace falta una contraseña de aplicación).";
  if (
    c === "ECONNECTION" ||
    c === "ESOCKET" ||
    c === "ETIMEDOUT" ||
    c === "ENOTFOUND" ||
    c === "ECONNREFUSED"
  )
    return "No se pudo conectar con el servidor de correo (revisa el servidor y el puerto, y la conexión a internet).";
  return m.replace(/pass(word)?=\S+/gi, "").slice(0, 300);
}

/* ------------------------------ Cuentas ------------------------------ */

const inicioDeHoy = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

async function enviadosHoy(
  ej: Ejecutor,
  ids: number[],
): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  if (ids.length === 0) return m;
  const filas = await ej
    .select({ id: correoCola.idCuenta, n: sql<number>`count(*)::int` })
    .from(correoCola)
    .where(
      and(
        inArray(correoCola.idCuenta, ids),
        eq(correoCola.estado, "enviado"),
        gte(correoCola.enviadoEn, inicioDeHoy()),
      ),
    )
    .groupBy(correoCola.idCuenta);
  for (const f of filas) if (f.id !== null) m.set(f.id, f.n);
  return m;
}
const aCuenta = (
  c: typeof correoCuentas.$inferSelect,
  hoy: number,
): CuentaDto => ({
  id: c.id,
  id_usuario: c.idUsuario,
  nombre: c.nombre,
  email: c.email,
  proveedor: c.proveedor as CuentaDto["proveedor"],
  host: c.host,
  puerto: c.puerto,
  seguro: c.seguro,
  usuario_smtp: c.usuarioSmtp,
  con_password: c.passwordCifrada !== "",
  firma: c.firma,
  limite_diario: c.limiteDiario,
  activa: c.activa,
  enviados_hoy: hoy,
});

export async function listarCuentas(
  ej: Ejecutor,
  u: UsuarioActual,
): Promise<CuentaDto[]> {
  const filas = await ej
    .select()
    .from(correoCuentas)
    .where(eq(correoCuentas.idUsuario, u.idUsuario))
    .orderBy(asc(correoCuentas.id));
  const hoy = await enviadosHoy(
    ej,
    filas.map((f) => f.id),
  );
  return filas.map((f) => aCuenta(f, hoy.get(f.id) ?? 0));
}

async function cuentaPropia(
  ej: Ejecutor,
  u: Pick<UsuarioActual, "idUsuario">,
  id: number,
): Promise<typeof correoCuentas.$inferSelect> {
  const [c] = await ej
    .select()
    .from(correoCuentas)
    .where(
      and(eq(correoCuentas.id, id), eq(correoCuentas.idUsuario, u.idUsuario)),
    );
  if (!c) throw new HttpError(404, "Cuenta de correo no encontrada");
  return c;
}

export async function guardarCuenta(
  ej: Ejecutor,
  u: UsuarioActual,
  id: number | null,
  e: EntradaCuenta,
): Promise<CuentaDto> {
  const valores = {
    nombre: e.nombre,
    email: e.email,
    proveedor: e.proveedor,
    host: e.host,
    puerto: e.puerto,
    seguro: e.seguro,
    usuarioSmtp: e.usuario_smtp,
    firma: e.firma,
    limiteDiario: e.limite_diario,
    activa: e.activa,
  };
  if (id === null) {
    if (!e.password) throw new HttpError(400, "Falta la contraseña");
    const [c] = await ej
      .insert(correoCuentas)
      .values({
        ...valores,
        idUsuario: u.idUsuario,
        passwordCifrada: cifrar(e.password, "correo"),
      })
      .returning();
    return aCuenta(c, 0);
  }
  await cuentaPropia(ej, u, id);
  const [c] = await ej
    .update(correoCuentas)
    .set({
      ...valores,
      ...(e.password ? { passwordCifrada: cifrar(e.password, "correo") } : {}),
    })
    .where(eq(correoCuentas.id, id))
    .returning();
  return aCuenta(c, (await enviadosHoy(ej, [id])).get(id) ?? 0);
}

export async function eliminarCuenta(
  ej: Ejecutor,
  u: UsuarioActual,
  id: number,
): Promise<void> {
  await cuentaPropia(ej, u, id);
  await ej.delete(correoCuentas).where(eq(correoCuentas.id, id));
}

/** Envía un correo de prueba a la propia cuenta (o a otra dirección) para comprobar que los ajustes valen. */
export async function probarCuenta(
  ej: Ejecutor,
  u: UsuarioActual,
  id: number,
  destino?: string,
): Promise<string> {
  const c = await cuentaPropia(ej, u, id);
  const para = destino?.trim() || c.email;
  if (!direccionValida(para))
    throw new HttpError(400, "La dirección no es válida");
  try {
    await transporteDe(c).sendMail({
      from: `"${c.nombre.replace(/"/g, "")}" <${c.email}>`,
      to: para,
      subject: "Prueba de GestorVentas",
      text: "Este es un correo de prueba de GestorVentas. Si lo lees, la cuenta funciona.",
    });
  } catch (e) {
    throw new HttpError(400, motivoDeError(e));
  }
  return `Correo de prueba enviado a ${para}`;
}

/* ------------------------------ Plantillas ------------------------------ */

const aPlantilla = (p: typeof correoPlantillas.$inferSelect): PlantillaDto => ({
  id: p.id,
  nombre: p.nombre,
  asunto: p.asunto,
  cuerpo: p.cuerpo,
});
export async function listarPlantillas(ej: Ejecutor): Promise<PlantillaDto[]> {
  return (
    await ej
      .select()
      .from(correoPlantillas)
      .orderBy(asc(correoPlantillas.nombre))
  ).map(aPlantilla);
}
export async function guardarPlantilla(
  ej: Ejecutor,
  u: UsuarioActual,
  id: number | null,
  e: EntradaPlantilla,
): Promise<PlantillaDto> {
  if (id === null)
    return aPlantilla(
      (
        await ej
          .insert(correoPlantillas)
          .values({ ...e, creadoPor: u.idUsuario })
          .returning()
      )[0],
    );
  const [p] = await ej
    .update(correoPlantillas)
    .set(e)
    .where(eq(correoPlantillas.id, id))
    .returning();
  if (!p) throw new HttpError(404, "Plantilla no encontrada");
  return aPlantilla(p);
}
export async function eliminarPlantilla(
  ej: Ejecutor,
  id: number,
): Promise<void> {
  await ej.delete(correoPlantillas).where(eq(correoPlantillas.id, id));
}

/* ------------------------------ Ajustes ------------------------------ */

export async function leerAjustesCorreo(
  ej: Ejecutor,
): Promise<AjustesCorreoDto> {
  const filas = await ej
    .select()
    .from(ajustes)
    .where(inArray(ajustes.clave, ["correo.automatico", "correo.pausa"]));
  const v = (k: string) => filas.find((f) => f.clave === k)?.valor;
  return {
    envio_automatico: v("correo.automatico") === "true",
    pausa_segundos: Math.max(1, Number(v("correo.pausa")) || 10),
  };
}
export async function guardarAjustesCorreo(
  ej: Ejecutor,
  a: AjustesCorreoDto,
): Promise<AjustesCorreoDto> {
  for (const [clave, valor] of [
    ["correo.automatico", String(a.envio_automatico)],
    ["correo.pausa", String(a.pausa_segundos)],
  ] as const)
    await ej
      .insert(ajustes)
      .values({ clave, valor })
      .onConflictDoUpdate({ target: ajustes.clave, set: { valor } });
  return a;
}

/* ------------------------------ Datos de un expediente ------------------------------ */

const f = (v: string | null | undefined): string => (v ? formatDate(v) : "");

/** Los valores de los campos de plantilla para un expediente (y su cliente). */
export async function datosDeExpediente(
  ej: Ejecutor,
  idExpediente: number | null,
  cuenta?: { firma: string } | null,
): Promise<Record<string, string>> {
  const hoy = formatDate(new Date().toISOString().slice(0, 10));
  const base: Record<string, string> = { hoy, firma: cuenta?.firma ?? "" };
  if (!idExpediente) return base;
  const fila = await ej.query.expedientes.findFirst({
    where: eq(expedientes.idExpediente, idExpediente),
    with: relacionesExpediente,
  });
  if (!fila) return base;
  const d = aDto(fila);
  const cli = d.cliente;
  const [tienda] = d.id_tienda
    ? await ej
        .execute<{ nombre: string; ciudad: string | null }>(
          sql`select nombre, ciudad from tiendas where id_tienda = ${d.id_tienda}`,
        )
        .then((r) => r.rows)
    : [];
  return {
    ...base,
    cliente: cli?.nombre ?? "",
    dni: cli?.dni ?? "",
    email_cliente: cli?.emails[0]?.email ?? "",
    telefono_cliente: cli?.telefonos[0]?.telefono ?? "",
    domicilio: [cli?.domicilio, cli?.codigo_postal, cli?.poblacion]
      .filter(Boolean)
      .join(", "),
    expediente: `#EXP-${String(d.id_expediente).padStart(4, "0")}`,
    matricula: d.matricula ?? "",
    bastidor: d.vin ?? "",
    marca: d.modelo?.marca?.nombre ?? "",
    modelo: d.modelo?.nombre_modelo ?? "",
    tipo_pago: d.tipoDeVenta?.nombre_tipo_venta ?? "",
    estado: d.estadoVehiculo?.nombre_estado_vehiculo ?? "",
    estado_intranet: d.estado_intranet ?? "",
    vendedor: d.usuario?.nombre ?? "",
    tienda: tienda
      ? tienda.ciudad
        ? `${tienda.nombre} (${tienda.ciudad})`
        : tienda.nombre
      : "",
    comentarios: d.comentarios ?? "",
    fecha_pedido: f(d.fecha_expediente),
    fecha_afectacion: f(d.fecha_afectacion),
    fecha_rci: f(d.fecha_rci),
    fecha_matriculacion: f(d.fecha_matriculacion),
    fecha_facturacion: f(d.fecha_facturacion),
    fecha_entrega: f(d.fecha_entrega),
    hora_entrega: d.hora_entrega ?? "",
    fecha_entrega_hora: d.fecha_entrega
      ? `${f(d.fecha_entrega)}${d.hora_entrega ? ` a las ${d.hora_entrega}` : ""}`
      : "",
  };
}

/* ------------------------------ Cola ------------------------------ */

async function aCorreos(
  ej: Ejecutor,
  filas: (typeof correoCola.$inferSelect)[],
): Promise<CorreoDto[]> {
  if (filas.length === 0) return [];
  const cuentas = new Map(
    (
      await ej
        .select({ id: correoCuentas.id, nombre: correoCuentas.nombre })
        .from(correoCuentas)
    ).map((c) => [c.id, c.nombre]),
  );
  const idsCli = [
    ...new Set(
      filas.map((x) => x.idCliente).filter((x): x is number => x !== null),
    ),
  ];
  const cli = new Map(
    idsCli.length
      ? (
          await ej
            .select({ id: clientes.id, nombre: clientes.nombre })
            .from(clientes)
            .where(inArray(clientes.id, idsCli))
        ).map((c) => [c.id, c.nombre])
      : [],
  );
  const reglas = new Map(
    (
      await ej.execute<{ id: number; nombre: string }>(
        sql`select id, nombre from alertas_reglas`,
      )
    ).rows.map((r) => [r.id, r.nombre]),
  );
  return filas.map((x) => ({
    id: x.id,
    id_usuario: x.idUsuario,
    id_cuenta: x.idCuenta,
    cuenta: x.idCuenta ? (cuentas.get(x.idCuenta) ?? null) : null,
    id_plantilla: x.idPlantilla,
    id_expediente: x.idExpediente,
    id_cliente: x.idCliente,
    cliente: x.idCliente ? (cli.get(x.idCliente) ?? null) : null,
    para: x.para,
    asunto: x.asunto,
    cuerpo: x.cuerpo,
    adjuntos: x.adjuntos,
    estado: x.estado as EstadoCorreo,
    origen: x.origen,
    regla: x.idRegla ? (reglas.get(x.idRegla) ?? null) : null,
    error: x.error,
    intentos: x.intentos,
    creado_en: x.creadoEn.toISOString(),
    enviado_en: x.enviadoEn?.toISOString() ?? null,
  }));
}

export interface OpcionesCreacion {
  origen?: "manual" | "boton" | "regla";
  idRegla?: number | null;
  /** Si la cola está en automático, los de reglas pasan directos a «programado». */
  respetarAutomatico?: boolean;
}

/** Crea un correo en la cola (borrador). Con una plantilla y un expediente, se rellenan asunto y cuerpo; si no se indican destinatarios, se usa el correo del cliente. */
export async function crearCorreoOpcional(
  ej: Ejecutor,
  u: Pick<UsuarioActual, "idUsuario">,
  entrada: EntradaCorreo,
  op: OpcionesCreacion = {},
): Promise<CorreoDto | null> {
  const e = esquemaCorreo.parse(entrada);
  let idCuenta = e.id_cuenta ?? null;
  if (idCuenta) await cuentaPropia(ej, u, idCuenta);
  else
    idCuenta =
      (
        await ej
          .select({ id: correoCuentas.id })
          .from(correoCuentas)
          .where(
            and(
              eq(correoCuentas.idUsuario, u.idUsuario),
              eq(correoCuentas.activa, true),
            ),
          )
          .orderBy(asc(correoCuentas.id))
          .limit(1)
      )[0]?.id ?? null;
  const cuenta = idCuenta
    ? (
        await ej
          .select()
          .from(correoCuentas)
          .where(eq(correoCuentas.id, idCuenta))
      )[0]
    : null;
  let asunto = e.asunto;
  let cuerpo = e.cuerpo;
  let para = e.para.trim();
  let idCliente = e.id_cliente ?? null;
  let aviso: string | null = null;
  const datos = await datosDeExpediente(ej, e.id_expediente ?? null, cuenta);
  if (e.id_plantilla) {
    const [p] = await ej
      .select()
      .from(correoPlantillas)
      .where(eq(correoPlantillas.id, e.id_plantilla));
    if (!p) throw new HttpError(404, "Plantilla no encontrada");
    if (!asunto) asunto = p.asunto;
    if (!cuerpo) cuerpo = p.cuerpo;
  }
  if (e.rellenar || e.id_plantilla) {
    asunto = rellenarPlantilla(asunto, datos, false);
    cuerpo = rellenarPlantilla(cuerpo, datos, true);
  }
  if (e.id_expediente && !idCliente)
    idCliente =
      (
        await ej
          .select({ c: expedientes.idCliente })
          .from(expedientes)
          .where(eq(expedientes.idExpediente, e.id_expediente))
      )[0]?.c ?? null;
  if (!para && datos.email_cliente) {
    // El correo del cliente, salvo que esté marcado como «no enviar correos»
    const marcado = idCliente
      ? (
          await ej
            .select({ n: clientes.noEnviarCorreos })
            .from(clientes)
            .where(eq(clientes.id, idCliente))
        )[0]?.n
      : false;
    if (marcado)
      aviso =
        "El cliente está marcado como «no enviar correos»: no se ha puesto su dirección.";
    else para = datos.email_cliente;
  }
  const auto = op.respetarAutomatico
    ? (await leerAjustesCorreo(ej)).envio_automatico
    : false;
  const listo = para !== "" && cuenta !== null && aviso === null;
  const [fila] = await ej
    .insert(correoCola)
    .values({
      idUsuario: u.idUsuario,
      idCuenta,
      idPlantilla: e.id_plantilla ?? null,
      idExpediente: e.id_expediente ?? null,
      idCliente,
      para,
      asunto,
      cuerpo,
      adjuntos: e.adjuntos,
      estado: auto && listo ? "programado" : "borrador",
      origen: op.origen ?? "manual",
      idRegla: op.idRegla ?? null,
      error: aviso,
    })
    .onConflictDoNothing()
    .returning();
  // Una regla no repite el correo para el mismo expediente (índice único): en ese caso no se crea otro
  return fila ? (await aCorreos(ej, [fila]))[0] : null;
}

/** Igual que `crearCorreoOpcional`, pero siempre devuelve el correo creado. */
export async function crearCorreo(
  ej: Ejecutor,
  u: Pick<UsuarioActual, "idUsuario">,
  entrada: EntradaCorreo,
  op: OpcionesCreacion = {},
): Promise<CorreoDto> {
  const c = await crearCorreoOpcional(ej, u, entrada, op);
  if (!c)
    throw new HttpError(
      409,
      "Ya hay un correo de esta regla para este expediente",
    );
  return c;
}

export async function listarCorreos(
  ej: Ejecutor,
  u: UsuarioActual,
  filtro: {
    estados?: EstadoCorreo[];
    idExpediente?: number;
    idCliente?: number;
  } = {},
): Promise<CorreoDto[]> {
  const filas = await ej
    .select()
    .from(correoCola)
    .where(
      and(
        eq(correoCola.idUsuario, u.idUsuario),
        filtro.estados ? inArray(correoCola.estado, filtro.estados) : undefined,
        filtro.idExpediente
          ? eq(correoCola.idExpediente, filtro.idExpediente)
          : undefined,
        filtro.idCliente
          ? eq(correoCola.idCliente, filtro.idCliente)
          : undefined,
      ),
    )
    .orderBy(desc(correoCola.id))
    .limit(1000);
  return aCorreos(ej, filas);
}

async function correoPropio(
  ej: Ejecutor,
  u: UsuarioActual,
  id: number,
): Promise<typeof correoCola.$inferSelect> {
  const [c] = await ej
    .select()
    .from(correoCola)
    .where(and(eq(correoCola.id, id), eq(correoCola.idUsuario, u.idUsuario)));
  if (!c) throw new HttpError(404, "Correo no encontrado");
  return c;
}

export async function cambiarCorreo(
  ej: Ejecutor,
  u: UsuarioActual,
  id: number,
  e: EntradaCambioCorreo,
): Promise<CorreoDto> {
  const c = await correoPropio(ej, u, id);
  if (
    c.estado !== "borrador" &&
    c.estado !== "programado" &&
    c.estado !== "error"
  )
    throw new HttpError(409, "Este correo ya no se puede editar");
  if (e.id_cuenta) await cuentaPropia(ej, u, e.id_cuenta);
  const [f2] = await ej
    .update(correoCola)
    .set({
      ...(e.id_cuenta !== undefined ? { idCuenta: e.id_cuenta } : {}),
      ...(e.para !== undefined ? { para: e.para.trim() } : {}),
      ...(e.asunto !== undefined ? { asunto: e.asunto } : {}),
      ...(e.cuerpo !== undefined ? { cuerpo: e.cuerpo } : {}),
      ...(e.adjuntos !== undefined ? { adjuntos: e.adjuntos } : {}),
      estado: c.estado === "error" ? "borrador" : c.estado,
      error: null,
    })
    .where(eq(correoCola.id, id))
    .returning();
  return (await aCorreos(ej, [f2]))[0];
}

/** Cancela un correo que aún no se ha enviado (se queda en el histórico como cancelado). */
export async function cancelarCorreo(
  ej: Ejecutor,
  u: UsuarioActual,
  id: number,
): Promise<void> {
  const c = await correoPropio(ej, u, id);
  if (c.estado === "enviado" || c.estado === "enviando")
    throw new HttpError(409, "Este correo ya se envió");
  await ej
    .update(correoCola)
    .set({ estado: "cancelado" })
    .where(eq(correoCola.id, id));
}
/** Quita del todo un correo cancelado, con error o enviado (del histórico). */
export async function borrarCorreo(
  ej: Ejecutor,
  u: UsuarioActual,
  id: number,
): Promise<void> {
  const c = await correoPropio(ej, u, id);
  if (
    c.estado === "borrador" ||
    c.estado === "programado" ||
    c.estado === "enviando"
  )
    throw new HttpError(409, "Cancélalo primero");
  await ej.delete(correoCola).where(eq(correoCola.id, id));
}
/** Los pasa a «programado»: los enviará el servidor uno tras otro, con la pausa de los ajustes. */
export async function programarCorreos(
  ej: Ejecutor,
  u: UsuarioActual,
  ids: number[],
): Promise<number> {
  let n = 0;
  for (const id of ids) {
    const c = await correoPropio(ej, u, id);
    if (c.estado !== "borrador" && c.estado !== "error") continue;
    validarParaEnviar(c);
    await ej
      .update(correoCola)
      .set({ estado: "programado", error: null })
      .where(eq(correoCola.id, id));
    n++;
  }
  return n;
}
/** Vuelve a dejar un programado como borrador (para revisarlo otra vez). */
export async function pausarCorreo(
  ej: Ejecutor,
  u: UsuarioActual,
  id: number,
): Promise<void> {
  const c = await correoPropio(ej, u, id);
  if (c.estado === "programado")
    await ej
      .update(correoCola)
      .set({ estado: "borrador" })
      .where(eq(correoCola.id, id));
}

function validarParaEnviar(c: typeof correoCola.$inferSelect): string[] {
  const dir = separarDirecciones(c.para);
  if (dir.length === 0) throw new HttpError(400, "No hay destinatario");
  const mal = dir.find((d) => !direccionValida(d));
  if (mal) throw new HttpError(400, `La dirección «${mal}» no es válida`);
  if (!c.idCuenta)
    throw new HttpError(400, "Elige la cuenta desde la que se envía");
  if (!c.asunto.trim()) throw new HttpError(400, "Falta el asunto");
  return dir;
}

const textoPlano = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

async function avisarFallo(
  ej: Ejecutor,
  c: typeof correoCola.$inferSelect,
  motivo: string,
): Promise<void> {
  await ej.insert(alertas).values({
    idUsuario: c.idUsuario,
    idExpediente: c.idExpediente,
    mensaje: `✉️ No se pudo enviar el correo «${c.asunto || "(sin asunto)"}» a ${c.para || "(sin destinatario)"}: ${motivo}`,
  });
}

/** Envía un correo ahora. Si falla, queda con el motivo, y se avisa en las notificaciones. */
export async function enviarCorreo(
  ej: Ejecutor,
  u: UsuarioActual,
  id: number,
): Promise<CorreoDto> {
  const c = await correoPropio(ej, u, id);
  if (c.estado === "enviado" || c.estado === "enviando")
    throw new HttpError(409, "Este correo ya se envió");
  validarParaEnviar(c);
  return (await enviarFila(ej, c))!;
}

async function enviarFila(
  ej: Ejecutor,
  c: typeof correoCola.$inferSelect,
): Promise<CorreoDto | null> {
  const dir = separarDirecciones(c.para);
  const [cuenta] = c.idCuenta
    ? await ej
        .select()
        .from(correoCuentas)
        .where(eq(correoCuentas.id, c.idCuenta))
    : [];
  const falla = async (motivo: string): Promise<CorreoDto> => {
    const [x] = await ej
      .update(correoCola)
      .set({ estado: "error", error: motivo, intentos: c.intentos + 1 })
      .where(eq(correoCola.id, c.id))
      .returning();
    await avisarFallo(ej, x, motivo);
    return (await aCorreos(ej, [x]))[0];
  };
  if (!cuenta) return falla("La cuenta de envío ya no existe");
  if (!cuenta.activa) return falla("La cuenta de envío está desactivada");
  if (
    cuenta.limiteDiario > 0 &&
    ((await enviadosHoy(ej, [cuenta.id])).get(cuenta.id) ?? 0) >=
      cuenta.limiteDiario
  )
    return falla(
      `Se alcanzó el límite de ${cuenta.limiteDiario} correos al día de esta cuenta (se puede cambiar en Ajustes de la cuenta)`,
    );
  await ej
    .update(correoCola)
    .set({ estado: "enviando" })
    .where(eq(correoCola.id, c.id));
  try {
    const adj = [];
    for (const idAdj of c.adjuntos) {
      const a = await leerAdjunto(ej, idAdj);
      if (a)
        adj.push({
          filename: a.meta.nombre,
          content: a.datos,
          contentType: a.mime,
        });
    }
    await transporteDe(cuenta).sendMail({
      from: `"${cuenta.nombre.replace(/"/g, "")}" <${cuenta.email}>`,
      to: dir,
      subject: c.asunto,
      html: c.cuerpo,
      text: textoPlano(c.cuerpo),
      attachments: adj,
    });
  } catch (e) {
    return falla(motivoDeError(e));
  }
  const [x] = await ej
    .update(correoCola)
    .set({
      estado: "enviado",
      enviadoEn: new Date(),
      error: null,
      intentos: c.intentos + 1,
    })
    .where(eq(correoCola.id, c.id))
    .returning();
  return (await aCorreos(ej, [x]))[0];
}

/* ------------------------------ Envío automático (uno tras otro) ------------------------------ */

let ultimoEnvio = 0;
let procesando = false;
/** Cada pocos segundos: si ha pasado la pausa, envía el siguiente correo «programado». Devuelve true si envió (o falló) uno. */
export async function procesarCola(
  ej: Ejecutor,
  ahora = Date.now(),
): Promise<boolean> {
  if (procesando) return false;
  procesando = true;
  try {
    const { pausa_segundos } = await leerAjustesCorreo(ej);
    if (ahora - ultimoEnvio < pausa_segundos * 1000) return false;
    const [c] = await ej
      .select()
      .from(correoCola)
      .where(eq(correoCola.estado, "programado"))
      .orderBy(asc(correoCola.id))
      .limit(1);
    if (!c) return false;
    ultimoEnvio = ahora;
    try {
      validarParaEnviar(c);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : "Datos incompletos";
      const [x] = await ej
        .update(correoCola)
        .set({ estado: "error", error: motivo, intentos: c.intentos + 1 })
        .where(eq(correoCola.id, c.id))
        .returning();
      await avisarFallo(ej, x, motivo);
      return true;
    }
    await enviarFila(ej, c);
    return true;
  } finally {
    procesando = false;
  }
}
/** Solo para las pruebas. */
export function reiniciarRitmoDeEnvio(): void {
  ultimoEnvio = 0;
}

/* ------------------------------ Correos de las reglas ------------------------------ */

type ReglaConCorreo = {
  id: number;
  definicion: {
    correo?: {
      id_plantilla: number;
      id_cuenta: number;
      para: "cliente" | "fijo";
      para_fijo: string;
    };
  };
};

/** Prepara el correo que pide una regla de aviso para un expediente (una sola vez por regla y expediente). Devuelve si se creó. */
export async function prepararCorreoDeRegla(
  ej: Ejecutor,
  regla: ReglaConCorreo,
  idExpediente: number,
): Promise<boolean> {
  const c = regla.definicion.correo;
  if (!c) return false;
  const [ya] = await ej
    .select({ id: correoCola.id })
    .from(correoCola)
    .where(
      and(
        eq(correoCola.idRegla, regla.id),
        eq(correoCola.idExpediente, idExpediente),
      ),
    )
    .limit(1);
  if (ya) return false;
  const [cuenta] = await ej
    .select({ idUsuario: correoCuentas.idUsuario })
    .from(correoCuentas)
    .where(eq(correoCuentas.id, c.id_cuenta));
  if (!cuenta) return false;
  const creado = await crearCorreoOpcional(
    ej,
    { idUsuario: cuenta.idUsuario },
    {
      id_cuenta: c.id_cuenta,
      id_plantilla: c.id_plantilla,
      id_expediente: idExpediente,
      para: c.para === "fijo" ? c.para_fijo : "",
    },
    { origen: "regla", idRegla: regla.id, respetarAutomatico: true },
  );
  return creado !== null;
}

/** Las reglas con fecha («2 días antes de la entrega…») preparan su correo cuando llega la hora. Se llama cada minuto. */
export async function prepararCorreosVencidos(ej: Ejecutor): Promise<number> {
  const filas = await ej.execute<{
    id_regla: number;
    id_expediente: number;
    definicion: ReglaConCorreo["definicion"];
  }>(sql`
    select a.id_regla, a.id_expediente, r.definicion
    from alertas a join alertas_reglas r on r.id = a.id_regla
    where r.activa and a.estado <> 'resuelta' and a.vence_en is not null and a.vence_en <= now()
      and a.id_expediente is not null and r.definicion ? 'correo'
      and not exists (select 1 from correo_cola q where q.id_regla = a.id_regla and q.id_expediente = a.id_expediente)
    limit 200`);
  let n = 0;
  for (const f of filas.rows)
    if (
      await prepararCorreoDeRegla(
        ej,
        { id: f.id_regla, definicion: f.definicion },
        f.id_expediente,
      )
    )
      n++;
  return n;
}

/* ------------------------------ Clientes que no quieren correos ------------------------------ */

export async function leerNoEnviar(
  ej: Ejecutor,
  idCliente: number,
): Promise<boolean> {
  const [c] = await ej
    .select({ n: clientes.noEnviarCorreos })
    .from(clientes)
    .where(eq(clientes.id, idCliente));
  if (!c) throw new HttpError(404, "Cliente no encontrado");
  return c.n;
}
export async function fijarNoEnviar(
  ej: Ejecutor,
  idCliente: number,
  valor: boolean,
): Promise<void> {
  await leerNoEnviar(ej, idCliente);
  await ej
    .update(clientes)
    .set({ noEnviarCorreos: valor })
    .where(eq(clientes.id, idCliente));
}
