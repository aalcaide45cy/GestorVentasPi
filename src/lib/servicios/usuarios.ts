import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { commissionLiquidationLineItems, commissionLiquidationLines, commissionLiquidationVersions, commissionLiquidations, commissionPlanVendedores, emailsUsuarios, expedientes, libroPuntos, pendientesCobro, rejillaFilas, rejillas, telefonosUsuarios, validacionesComision, usuarios, usuariosTiendas } from "@/db/schema";
import type { UsuarioAdminDto } from "@/lib/dto";
import { generarPasswordTemporal, hashPassword } from "@/lib/auth/password";
import { ROLES } from "@/lib/auth/permisos";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import { idOpcional, textoOpcional } from "./comun";

const rolEnum = z.enum(ROLES);
const tipoVendedorEnum = z.enum(["VN", "VO"]);

export const esquemaCrearUsuario = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(255),
  email: z.string().trim().toLowerCase().email("Correo electrónico no válido").max(255),
  telefono: textoOpcional(50).optional(),
  rol: rolEnum.default("invitado"),
  tipo_vendedor: tipoVendedorEnum.default("VN"),
  patron_vo: textoOpcional(100).optional(),
});
export type EntradaCrearUsuario = z.infer<typeof esquemaCrearUsuario>;

export const esquemaActualizarUsuario = z.object({
  id_usuario: z.coerce.number().int().positive("Falta id_usuario"),
  nombre: z.string().trim().min(1).max(255).optional(),
  rol: rolEnum.optional(),
  bloqueado: z.boolean().optional(),
  email: z.union([z.string().trim().toLowerCase().email("Correo electrónico no válido").max(255), z.literal("")]).optional(),
  telefono: textoOpcional(50).optional(),
  tipo_vendedor: tipoVendedorEnum.optional(),
  patron_vo: textoOpcional(100).optional(),
});
export type EntradaActualizarUsuario = z.infer<typeof esquemaActualizarUsuario>;

export const esquemaPerfil = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(255),
  emails: z.array(z.object({ email: z.string().trim().max(255), tipo_email: z.string().trim().max(100).optional().nullable() })).max(20).optional(),
  telefonos: z.array(z.object({ telefono: z.string().trim().max(50), tipo_telefono: z.string().trim().max(100).optional().nullable() })).max(20).optional(),
  tiendas: z.array(z.coerce.number().int().positive()).max(200).optional(),
});
export type EntradaPerfil = z.infer<typeof esquemaPerfil>;

export const esquemaTiendaPredeterminada = z.object({ id_tienda: idOpcional.optional() });

const conRelaciones = { emails: true, telefonos: true, tiendas: true } as const;

type FilaUsuario = Awaited<ReturnType<typeof leerUsuarios>>[number];

function leerUsuarios(ej: Ejecutor) {
  return ej.query.usuarios.findMany({ with: conRelaciones, orderBy: [asc(usuarios.nombre)] });
}

/** DTO sin hash de contraseña ni secreto TOTP (nunca se devuelven). */
function aDto(u: FilaUsuario): UsuarioAdminDto {
  return {
    id_usuario: u.idUsuario,
    login_email: u.loginEmail,
    nombre: u.nombre,
    rol: u.rol,
    fecha_de_registro: u.fechaDeRegistro,
    bloqueado: u.bloqueado ?? false,
    tipo_vendedor: u.tipoVendedor,
    patron_vo: u.patronVo,
    tienda_predeterminada_id: u.tiendaPredeterminadaId,
    totp_activo: u.totpActivo,
    debe_cambiar_password: u.debeCambiarPassword,
    emails: u.emails.map((e) => ({ email: e.email, tipo_email: e.tipoEmail })),
    telefonos: u.telefonos.map((t) => ({ telefono: t.telefono, tipo_telefono: t.tipoTelefono })),
    tiendas: u.tiendas.map((t) => t.idTienda),
  };
}

export async function listarUsuarios(ej: Ejecutor): Promise<UsuarioAdminDto[]> {
  return (await leerUsuarios(ej)).map(aDto);
}

export async function obtenerUsuario(ej: Ejecutor, id: number): Promise<UsuarioAdminDto | null> {
  const u = await ej.query.usuarios.findFirst({ where: eq(usuarios.idUsuario, id), with: conRelaciones });
  return u ? aDto(u) : null;
}

/** Vendedores seleccionables: usuarios no invitados. */
export async function listarVendedores(ej: Ejecutor): Promise<{ id_usuario: number; nombre: string }[]> {
  const filas = await ej.select().from(usuarios).where(ne(usuarios.rol, "invitado")).orderBy(asc(usuarios.nombre));
  return filas.map((u) => ({ id_usuario: u.idUsuario, nombre: u.nombre || `ID: ${u.idUsuario}` }));
}

async function comprobarEmailLibre(ej: Ejecutor, email: string, excluirId?: number): Promise<void> {
  const [existente] = await ej.select({ id: usuarios.idUsuario }).from(usuarios).where(eq(usuarios.loginEmail, email));
  if (existente && existente.id !== excluirId) {
    throw new HttpError(409, "Este correo electrónico ya está registrado en el sistema.");
  }
}

/** Alta por el administrador con contraseña temporal (se muestra una sola vez al llamante). */
export async function crearUsuario(
  ej: Ejecutor,
  entrada: EntradaCrearUsuario,
): Promise<{ usuario: UsuarioAdminDto; passwordTemporal: string }> {
  const passwordTemporal = generarPasswordTemporal();
  const passwordHash = await hashPassword(passwordTemporal);
  const id = await ej.transaction(async (tx) => {
    await comprobarEmailLibre(tx, entrada.email);
    const [nuevo] = await tx
      .insert(usuarios)
      .values({
        loginEmail: entrada.email,
        passwordHash,
        debeCambiarPassword: true,
        nombre: entrada.nombre,
        rol: entrada.rol,
        fechaDeRegistro: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }),
        bloqueado: false,
        tipoVendedor: entrada.tipo_vendedor,
        patronVo: entrada.patron_vo ?? "Estándar VO",
      })
      .returning({ id: usuarios.idUsuario });
    await tx.insert(emailsUsuarios).values({ idUsuario: nuevo.id, email: entrada.email, tipoEmail: "Principal" });
    if (entrada.telefono) {
      await tx.insert(telefonosUsuarios).values({ idUsuario: nuevo.id, telefono: entrada.telefono, tipoTelefono: "Principal" });
    }
    return nuevo.id;
  });
  const usuario = await obtenerUsuario(ej, id);
  if (!usuario) throw new HttpError(500, "No se pudo leer el usuario creado");
  return { usuario, passwordTemporal };
}

/** Administradores activos (no suspendidos) distintos de `excluirId`: siempre debe quedar al menos uno. */
async function otrosAdministradoresActivos(ej: Ejecutor, excluirId: number): Promise<number> {
  const filas = await ej.select({ id: usuarios.idUsuario }).from(usuarios).where(and(eq(usuarios.rol, "administrador"), eq(usuarios.bloqueado, false), ne(usuarios.idUsuario, excluirId)));
  return filas.length;
}

const SIN_ADMIN = "Tiene que quedar al menos un administrador activo: así la aplicación nunca queda sin nadie que pueda gestionarla.";

/** Un administrador no puede bloquearse ni degradarse a sí mismo (7.4), y siempre queda al menos un administrador activo. */
export async function actualizarUsuario(
  ej: Ejecutor,
  admin: UsuarioActual,
  entrada: EntradaActualizarUsuario,
): Promise<void> {
  const id = entrada.id_usuario;
  await ej.transaction(async (tx) => {
    const [objetivo] = await tx.select().from(usuarios).where(eq(usuarios.idUsuario, id));
    if (!objetivo) throw new HttpError(404, "Usuario no encontrado");
    if (objetivo.idUsuario === admin.idUsuario) {
      if (entrada.bloqueado === true) throw new HttpError(400, "No puedes bloquear tu propia cuenta.");
      if (entrada.rol !== undefined && entrada.rol !== "administrador") {
        throw new HttpError(400, "No puedes degradar tu propio rol de Administrador.");
      }
    }
    const eraAdminActivo = objetivo.rol === "administrador" && !objetivo.bloqueado;
    if (eraAdminActivo && (entrada.bloqueado === true || (entrada.rol !== undefined && entrada.rol !== "administrador")) && (await otrosAdministradoresActivos(tx, id)) === 0) {
      throw new HttpError(400, SIN_ADMIN);
    }
    if (entrada.email) await comprobarEmailLibre(tx, entrada.email, id);

    const set: Partial<typeof usuarios.$inferInsert> = {};
    if (entrada.nombre !== undefined) set.nombre = entrada.nombre;
    if (entrada.rol !== undefined) set.rol = entrada.rol;
    if (entrada.bloqueado !== undefined) set.bloqueado = entrada.bloqueado;
    if (entrada.tipo_vendedor !== undefined) set.tipoVendedor = entrada.tipo_vendedor;
    if (entrada.patron_vo !== undefined) set.patronVo = entrada.patron_vo ?? "Estándar VO";
    if (entrada.email) set.loginEmail = entrada.email;
    if (Object.keys(set).length > 0) await tx.update(usuarios).set(set).where(eq(usuarios.idUsuario, id));

    if (entrada.email !== undefined) {
      await tx.delete(emailsUsuarios).where(eq(emailsUsuarios.idUsuario, id));
      if (entrada.email) await tx.insert(emailsUsuarios).values({ idUsuario: id, email: entrada.email, tipoEmail: "Principal" });
    }
    if (entrada.telefono !== undefined) {
      await tx.delete(telefonosUsuarios).where(eq(telefonosUsuarios.idUsuario, id));
      if (entrada.telefono) {
        await tx.insert(telefonosUsuarios).values({ idUsuario: id, telefono: entrada.telefono, tipoTelefono: "Principal" });
      }
    }
  });
}

export async function cambiarRol(ej: Ejecutor, admin: UsuarioActual, id: number, rol: (typeof ROLES)[number]): Promise<void> {
  if (id === admin.idUsuario && rol !== "administrador") {
    throw new HttpError(400, "No puedes degradar tu propio rol de Administrador.");
  }
  const [objetivo] = await ej.select().from(usuarios).where(eq(usuarios.idUsuario, id));
  if (!objetivo) throw new HttpError(404, "Usuario no encontrado");
  if (rol !== "administrador" && objetivo.rol === "administrador" && !objetivo.bloqueado && (await otrosAdministradoresActivos(ej, id)) === 0) throw new HttpError(400, SIN_ADMIN);
  await ej.update(usuarios).set({ rol }).where(eq(usuarios.idUsuario, id));
}

/** Lo que se perdería al borrar un usuario junto con todo lo suyo (para enseñarlo antes de confirmar). */
export async function resumenBorradoTotal(ej: Ejecutor, id: number): Promise<{ expedientes: number; liquidaciones: number; rejillas: number }> {
  const exp = await ej.select({ id: expedientes.idExpediente }).from(expedientes).where(and(eq(expedientes.idUsuario, id), isNull(expedientes.eliminadoEn)));
  const liq = await ej.select({ id: commissionLiquidations.idLiquidation }).from(commissionLiquidations).where(eq(commissionLiquidations.idUsuario, id));
  const rej = await ej.select({ id: rejillas.id }).from(rejillas).where(eq(rejillas.idUsuario, id));
  return { expedientes: exp.length, liquidaciones: liq.length, rejillas: rej.length };
}

/**
 * Borra un usuario con todo lo suyo (para quitar usuarios de prueba): sus expedientes pasan a eliminados, y se borran su libro de
 * puntos, liquidaciones, rejillas, validaciones y pendientes. Es irreversible; el administrador lo confirma antes.
 */
export async function eliminarUsuarioConTodo(ej: Ejecutor, admin: UsuarioActual, id: number): Promise<void> {
  if (id === admin.idUsuario) throw new HttpError(400, "No puedes eliminar tu propia cuenta.");
  const [u] = await ej.select().from(usuarios).where(eq(usuarios.idUsuario, id));
  if (!u) throw new HttpError(404, "Usuario no encontrado");
  if (u.rol === "administrador" && !u.bloqueado && (await otrosAdministradoresActivos(ej, id)) === 0) throw new HttpError(400, SIN_ADMIN);
  await ej.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.borrado_autorizado', 'on', true)`);
    await tx.update(expedientes).set({ eliminadoEn: new Date() }).where(and(eq(expedientes.idUsuario, id), isNull(expedientes.eliminadoEn)));
    await tx.update(expedientes).set({ idUsuario: null }).where(eq(expedientes.idUsuario, id));
    const liqs = (await tx.select({ id: commissionLiquidations.idLiquidation }).from(commissionLiquidations).where(eq(commissionLiquidations.idUsuario, id))).map((l) => l.id);
    if (liqs.length > 0) {
      const lineas = (await tx.select({ id: commissionLiquidationLines.idLine }).from(commissionLiquidationLines).where(inArray(commissionLiquidationLines.idLiquidation, liqs))).map((l) => l.id);
      if (lineas.length > 0) await tx.delete(commissionLiquidationLineItems).where(inArray(commissionLiquidationLineItems.idLine, lineas));
      await tx.delete(commissionLiquidationLines).where(inArray(commissionLiquidationLines.idLiquidation, liqs));
      await tx.delete(commissionLiquidationVersions).where(inArray(commissionLiquidationVersions.idLiquidation, liqs));
      await tx.delete(commissionLiquidations).where(inArray(commissionLiquidations.idLiquidation, liqs));
    }
    await tx.delete(libroPuntos).where(eq(libroPuntos.idUsuario, id));
    await tx.delete(commissionPlanVendedores).where(eq(commissionPlanVendedores.idUsuario, id));
    const hojas = (await tx.select({ id: rejillas.id }).from(rejillas).where(eq(rejillas.idUsuario, id))).map((r) => r.id);
    if (hojas.length > 0) await tx.delete(rejillaFilas).where(inArray(rejillaFilas.idRejilla, hojas));
    await tx.delete(rejillas).where(eq(rejillas.idUsuario, id));
    await tx.delete(validacionesComision).where(eq(validacionesComision.idUsuario, id));
    await tx.delete(pendientesCobro).where(eq(pendientesCobro.idUsuario, id));
    await tx.delete(usuarios).where(eq(usuarios.idUsuario, id));
  });
}

export async function eliminarUsuario(ej: Ejecutor, admin: UsuarioActual, id: number): Promise<void> {
  if (id === admin.idUsuario) throw new HttpError(400, "No puedes eliminar tu propia cuenta.");
  const [usuarioBorrar] = await ej.select().from(usuarios).where(eq(usuarios.idUsuario, id));
  if (!usuarioBorrar) throw new HttpError(404, "Usuario no encontrado");
  if (usuarioBorrar.rol === "administrador" && !usuarioBorrar.bloqueado && (await otrosAdministradoresActivos(ej, id)) === 0) throw new HttpError(400, SIN_ADMIN);
  const expedientesDe = await ej.select({ id: expedientes.idExpediente, eliminado: expedientes.eliminadoEn }).from(expedientes).where(eq(expedientes.idUsuario, id));
  const activos = expedientesDe.filter((e) => e.eliminado === null).length;
  if (activos > 0) {
    throw new HttpError(
      409,
      `No se puede eliminar el usuario porque tiene ${activos} expediente${activos === 1 ? "" : "s"} activo${activos === 1 ? "" : "s"}. Pásalos a otro vendedor (en Expedientes, filtra por su nombre y usa «Editar» en la selección masiva) o elimínalos; mientras tanto puedes suspender su acceso.`,
    );
  }
  // Los expedientes ya eliminados (que no se ven en la lista) no impiden borrar al usuario: se quedan sin vendedor
  if (expedientesDe.length > 0) await ej.update(expedientes).set({ idUsuario: null }).where(eq(expedientes.idUsuario, id));
  // Comisiones: el libro de puntos, las liquidaciones y los objetivos de plan son históricos y no se borran con el usuario
  const [libro] = await ej.select({ id: libroPuntos.id }).from(libroPuntos).where(eq(libroPuntos.idUsuario, id)).limit(1);
  const [liq] = await ej.select({ id: commissionLiquidations.idLiquidation }).from(commissionLiquidations).where(eq(commissionLiquidations.idUsuario, id)).limit(1);
  const [objetivo] = await ej.select({ id: commissionPlanVendedores.id }).from(commissionPlanVendedores).where(eq(commissionPlanVendedores.idUsuario, id)).limit(1);
  const [rej] = await ej.select({ id: rejillas.id }).from(rejillas).where(eq(rejillas.idUsuario, id)).limit(1);
  const [val] = await ej.select({ id: validacionesComision.id }).from(validacionesComision).where(eq(validacionesComision.idUsuario, id)).limit(1);
  if (libro || liq || objetivo || rej || val) {
    throw new HttpError(409, "No se puede eliminar el usuario porque tiene historial de comisiones (puntos, liquidaciones o planes). Bloquea su cuenta para suspender su acceso.");
  }
  const filas = await ej.delete(usuarios).where(eq(usuarios.idUsuario, id)).returning({ id: usuarios.idUsuario });
  if (filas.length === 0) throw new HttpError(404, "Usuario no encontrado");
}

export async function guardarPerfil(ej: Ejecutor, idUsuario: number, entrada: EntradaPerfil): Promise<void> {
  await ej.transaction(async (tx) => {
    await tx.update(usuarios).set({ nombre: entrada.nombre }).where(eq(usuarios.idUsuario, idUsuario));

    await tx.delete(emailsUsuarios).where(eq(emailsUsuarios.idUsuario, idUsuario));
    const emails = (entrada.emails ?? []).filter((e) => e.email);
    if (emails.length > 0) {
      await tx.insert(emailsUsuarios).values(emails.map((e) => ({ idUsuario, email: e.email, tipoEmail: e.tipo_email || "Principal" })));
    }

    await tx.delete(telefonosUsuarios).where(eq(telefonosUsuarios.idUsuario, idUsuario));
    const telefonos = (entrada.telefonos ?? []).filter((t) => t.telefono);
    if (telefonos.length > 0) {
      await tx.insert(telefonosUsuarios).values(
        telefonos.map((t) => ({ idUsuario, telefono: t.telefono, tipoTelefono: t.tipo_telefono || "Principal" })),
      );
    }

    await tx.delete(usuariosTiendas).where(eq(usuariosTiendas.idUsuario, idUsuario));
    const tiendas = [...new Set(entrada.tiendas ?? [])];
    if (tiendas.length > 0) {
      await tx.insert(usuariosTiendas).values(tiendas.map((idTienda) => ({ idUsuario, idTienda })));
    }
  });
}

export async function establecerTiendaPredeterminada(ej: Ejecutor, idUsuario: number, idTienda: number | null): Promise<void> {
  await ej.update(usuarios).set({ tiendaPredeterminadaId: idTienda }).where(eq(usuarios.idUsuario, idUsuario));
}
