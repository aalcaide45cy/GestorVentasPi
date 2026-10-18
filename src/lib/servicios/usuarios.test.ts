import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { expedientes, usuarios } from "@/db/schema";
import { verificarPassword } from "@/lib/auth/password";
import { HttpError } from "@/lib/auth/sesion";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";
import { actualizarUsuario, cambiarRol, crearUsuario, eliminarUsuario, eliminarUsuarioConTodo, resumenBorradoTotal, esquemaCrearUsuario, guardarPerfil, listarUsuarios, listarVendedores, obtenerUsuario } from "./usuarios";

beforeEach(reiniciarBd);

async function codigoDeError(p: Promise<unknown>): Promise<number> {
  try {
    await p;
  } catch (e) {
    if (e instanceof HttpError) return e.status;
    throw e;
  }
  throw new Error("Se esperaba un HttpError");
}

describe("alta de usuarios", () => {
  it("crea el usuario con contraseña temporal válida y obliga a cambiarla", async () => {
    const { usuario, passwordTemporal } = await crearUsuario(db, esquemaCrearUsuario.parse({ nombre: "Marta", email: "Marta@Ejemplo.com", rol: "vendedor" }));
    expect(usuario.login_email).toBe("marta@ejemplo.com");
    expect(usuario.debe_cambiar_password).toBe(true);
    expect(passwordTemporal.length).toBeGreaterThanOrEqual(12);
    const [fila] = await db.select().from(usuarios).where(eq(usuarios.idUsuario, usuario.id_usuario));
    expect(await verificarPassword(fila.passwordHash, passwordTemporal)).toBe(true);
  });

  it("el DTO nunca expone hash ni secreto TOTP", async () => {
    await crearUsuario(db, esquemaCrearUsuario.parse({ nombre: "Marta", email: "m@e.com" }));
    const texto = JSON.stringify(await listarUsuarios(db));
    expect(texto).not.toMatch(/password_?hash|totp_?secret|\$argon2/i);
  });

  it("rechaza un correo repetido (409)", async () => {
    await crearUsuario(db, esquemaCrearUsuario.parse({ nombre: "A", email: "a@e.com" }));
    expect(await codigoDeError(crearUsuario(db, esquemaCrearUsuario.parse({ nombre: "B", email: "a@e.com" })))).toBe(409);
  });

  it("valida el correo con Zod", () => {
    expect(() => esquemaCrearUsuario.parse({ nombre: "A", email: "no-es-correo" })).toThrow();
  });
});

describe("reglas del administrador (7.4)", () => {
  it("no puede bloquearse, degradarse ni eliminarse a sí mismo", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    expect(await codigoDeError(actualizarUsuario(db, admin, { id_usuario: admin.idUsuario, bloqueado: true }))).toBe(400);
    expect(await codigoDeError(actualizarUsuario(db, admin, { id_usuario: admin.idUsuario, rol: "vendedor" }))).toBe(400);
    expect(await codigoDeError(cambiarRol(db, admin, admin.idUsuario, "vendedor"))).toBe(400);
    expect(await codigoDeError(eliminarUsuario(db, admin, admin.idUsuario))).toBe(400);
  });

  it("puede suspender a otro administrador mientras quede uno activo, y a un vendedor; nunca a sí mismo", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const otro = await crearUsuarioPrueba("administrador");
    const vendedor = await crearUsuarioPrueba("vendedor");
    expect(await codigoDeError(actualizarUsuario(db, admin, { id_usuario: admin.idUsuario, bloqueado: true }))).toBe(400);
    await actualizarUsuario(db, admin, { id_usuario: otro.idUsuario, bloqueado: true });
    expect((await obtenerUsuario(db, otro.idUsuario))?.bloqueado).toBe(true);
    await actualizarUsuario(db, admin, { id_usuario: otro.idUsuario, bloqueado: false });
    await actualizarUsuario(db, admin, { id_usuario: vendedor.idUsuario, bloqueado: true });
    expect((await obtenerUsuario(db, vendedor.idUsuario))?.bloqueado).toBe(true);
  });

  it("siempre queda al menos un administrador activo (suspender, degradar o eliminar al último)", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const otro = await crearUsuarioPrueba("administrador");
    await actualizarUsuario(db, admin, { id_usuario: otro.idUsuario, bloqueado: true });
    // El otro administrador está suspendido: el actual es el único activo
    const tercero = await crearUsuarioPrueba("administrador");
    await actualizarUsuario(db, admin, { id_usuario: tercero.idUsuario, bloqueado: true });
    expect(await codigoDeError(cambiarRol(db, tercero, admin.idUsuario, "vendedor"))).toBe(400);
    expect(await codigoDeError(eliminarUsuario(db, tercero, admin.idUsuario))).toBe(400);
    // Con los suspendidos de vuelta no hay problema
    await actualizarUsuario(db, admin, { id_usuario: tercero.idUsuario, bloqueado: false });
    await cambiarRol(db, tercero, admin.idUsuario, "vendedor");
    expect((await obtenerUsuario(db, admin.idUsuario))?.rol).toBe("vendedor");
  });

  it("un usuario cuyos expedientes están todos eliminados sí se puede borrar", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const v = await crearUsuarioPrueba("vendedor");
    const e = await crearExpediente(db, v, esquemaCrearExpediente.parse({ expediente: {} }));
    expect(await codigoDeError(eliminarUsuario(db, admin, v.idUsuario))).toBe(409);
    await db.update(expedientes).set({ eliminadoEn: new Date() }).where(eq(expedientes.idExpediente, e.id_expediente));
    await eliminarUsuario(db, admin, v.idUsuario);
    expect(await obtenerUsuario(db, v.idUsuario)).toBeNull();
  });

  it("no elimina usuarios con expedientes (409) y sí los que no tienen", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const conVentas = await crearUsuarioPrueba("vendedor");
    const sinVentas = await crearUsuarioPrueba("vendedor");
    await crearExpediente(db, conVentas, esquemaCrearExpediente.parse({ expediente: {} }));
    expect(await codigoDeError(eliminarUsuario(db, admin, conVentas.idUsuario))).toBe(409);
    await eliminarUsuario(db, admin, sinVentas.idUsuario);
    expect(await obtenerUsuario(db, sinVentas.idUsuario)).toBeNull();
  });

  it("los invitados no aparecen como vendedores", async () => {
    await crearUsuarioPrueba("invitado", "Invitado Uno");
    await crearUsuarioPrueba("vendedor", "Vendedora Uno");
    expect((await listarVendedores(db)).map((v) => v.nombre)).toEqual(["Vendedora Uno"]);
  });
});

describe("perfil propio", () => {
  it("reemplaza contactos y tiendas", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    await guardarPerfil(db, u.idUsuario, { nombre: "Nuevo Nombre", emails: [{ email: "x@y.com", tipo_email: "Trabajo" }], telefonos: [{ telefono: "600000000" }], tiendas: [] });
    const p = await obtenerUsuario(db, u.idUsuario);
    expect(p).toMatchObject({ nombre: "Nuevo Nombre", emails: [{ email: "x@y.com", tipo_email: "Trabajo" }], telefonos: [{ telefono: "600000000", tipo_telefono: "Principal" }] });
  });

  it("un usuario de prueba con expedientes se puede borrar con todo lo suyo, y sus expedientes dejan de verse", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const v = await crearUsuarioPrueba("vendedor");
    const e = await crearExpediente(db, v, esquemaCrearExpediente.parse({ expediente: {} }));
    expect((await resumenBorradoTotal(db, v.idUsuario)).expedientes).toBe(1);
    expect(await codigoDeError(eliminarUsuario(db, admin, v.idUsuario))).toBe(409);
    await eliminarUsuarioConTodo(db, admin, v.idUsuario);
    expect(await obtenerUsuario(db, v.idUsuario)).toBeNull();
    const [fila] = await db.select().from(expedientes).where(eq(expedientes.idExpediente, e.id_expediente));
    expect(fila.eliminadoEn).not.toBeNull();
    expect(await codigoDeError(eliminarUsuarioConTodo(db, admin, admin.idUsuario))).toBe(400);
  });
});
