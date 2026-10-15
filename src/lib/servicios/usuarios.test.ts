import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { verificarPassword } from "@/lib/auth/password";
import { HttpError } from "@/lib/auth/sesion";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";
import { actualizarUsuario, cambiarRol, crearUsuario, eliminarUsuario, esquemaCrearUsuario, guardarPerfil, listarUsuarios, listarVendedores, obtenerUsuario } from "./usuarios";

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

  it("no puede suspender a otro administrador, pero sí a un vendedor", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const otro = await crearUsuarioPrueba("administrador");
    const vendedor = await crearUsuarioPrueba("vendedor");
    expect(await codigoDeError(actualizarUsuario(db, admin, { id_usuario: otro.idUsuario, bloqueado: true }))).toBe(400);
    await actualizarUsuario(db, admin, { id_usuario: vendedor.idUsuario, bloqueado: true });
    expect((await obtenerUsuario(db, vendedor.idUsuario))?.bloqueado).toBe(true);
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
});
