import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { adjuntos, adjuntosDatos, ajustes, biblioteca, usuarios } from "@/db/schema";
import { cifrar, cifrarBuffer, descifrar, descifrarBuffer } from "@/lib/auth/cifrado";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { ajustarCifradoTrasRestaurar, asegurarComprobacion, configurarClaveRecuperacion, copiasPortablesActivas, estadoClaveRecuperacion, prepararPortabilidad, recifrarBiblioteca, secretoValido } from "./clave-recuperacion";
import { guardarArchivo, leerArchivo, listarArchivos } from "./biblioteca";

const ORIGINAL = process.env.APP_SECRET;
const SECRETO_A = "a".repeat(40);
const SECRETO_B = "b".repeat(40);

beforeEach(async () => {
  process.env.APP_SECRET = SECRETO_A;
  await reiniciarBd();
});
afterEach(() => {
  process.env.APP_SECRET = ORIGINAL;
});

async function datosCifradosConA() {
  const u = await crearUsuarioPrueba("administrador");
  await db.update(usuarios).set({ totpSecretoCifrado: cifrar("SECRETO-TOTP", "totp"), totpActivo: true }).where(eq(usuarios.idUsuario, u.idUsuario));
  const [a] = await db.insert(adjuntos).values({ ambito: "pendiente", nombre: "dni.jpg", mime: "image/jpeg", tamano: 3 }).returning();
  await db.insert(adjuntosDatos).values({ idAdjunto: a.id, datos: cifrarBuffer(Buffer.from("contenido")), miniatura: cifrarBuffer(Buffer.from("mini")) });
  return { idUsuario: u.idUsuario, idAdjunto: a.id };
}

describe("clave de recuperación: restaurar en otra instalación", () => {
  it("en la misma instalación no hay nada que recifrar; en otra, hace falta la clave y todo se vuelve a abrir", async () => {
    const { idUsuario, idAdjunto } = await datosCifradosConA();
    expect(await estadoClaveRecuperacion(db)).toEqual({ configurada: false });
    await expect(configurarClaveRecuperacion(db, "corta")).rejects.toMatchObject({ status: 400 });
    await configurarClaveRecuperacion(db, "mi-clave-de-recuperacion");
    expect(await estadoClaveRecuperacion(db)).toEqual({ configurada: true });
    expect(await ajustarCifradoTrasRestaurar(db, undefined)).toEqual({ recifrado: false });

    // La copia se restaura en otra instalación: otro APP_SECRET
    process.env.APP_SECRET = SECRETO_B;
    expect(await secretoValido(db, SECRETO_B)).toBe(false);
    expect(await secretoValido(db, SECRETO_A)).toBe(true);
    await expect(ajustarCifradoTrasRestaurar(db, undefined)).rejects.toMatchObject({ status: 400, message: expect.stringContaining("otra instalación") });
    await expect(ajustarCifradoTrasRestaurar(db, "clave-equivocada-123")).rejects.toMatchObject({ status: 400, message: expect.stringContaining("no es correcta") });

    expect(await ajustarCifradoTrasRestaurar(db, "mi-clave-de-recuperacion")).toEqual({ recifrado: true });
    const [u] = await db.select().from(usuarios).where(eq(usuarios.idUsuario, idUsuario));
    expect(descifrar(u.totpSecretoCifrado!, "totp")).toBe("SECRETO-TOTP");
    const [d] = await db.select().from(adjuntosDatos).where(eq(adjuntosDatos.idAdjunto, idAdjunto));
    expect(descifrarBuffer(d.datos).toString()).toBe("contenido");
    expect(descifrarBuffer(d.miniatura!).toString()).toBe("mini");
    expect(await secretoValido(db, SECRETO_B)).toBe(true);
    // La misma clave sigue valiendo, ahora con el secreto de esta instalación
    expect(await estadoClaveRecuperacion(db)).toEqual({ configurada: true });
    process.env.APP_SECRET = SECRETO_A;
    expect(await secretoValido(db, SECRETO_A)).toBe(false);
  });

  it("copia portable: se restaura en otra instalación sin pedir ninguna clave y la copia siguiente sigue siendo portable", async () => {
    const { idUsuario, idAdjunto } = await datosCifradosConA();
    await prepararPortabilidad(db);
    expect(await copiasPortablesActivas(db)).toBe(true);
    process.env.APP_SECRET = SECRETO_B;
    expect(await secretoValido(db, SECRETO_B)).toBe(false);
    expect(await ajustarCifradoTrasRestaurar(db, undefined)).toEqual({ recifrado: true });
    const [u] = await db.select().from(usuarios).where(eq(usuarios.idUsuario, idUsuario));
    expect(descifrar(u.totpSecretoCifrado!, "totp")).toBe("SECRETO-TOTP");
    const [d] = await db.select().from(adjuntosDatos).where(eq(adjuntosDatos.idAdjunto, idAdjunto));
    expect(descifrarBuffer(d.datos).toString()).toBe("contenido");
    // La clave guardada pasa a ser la de esta instalación: la próxima copia también se podrá llevar a otro PC
    const [fila] = await db.select().from(ajustes).where(eq(ajustes.clave, "clave_portable"));
    expect(fila.valor).toBe(SECRETO_B);
  });

  it("si se desactivan las copias portables, la copia no lleva la clave y en otra instalación se vuelve a pedir", async () => {
    await datosCifradosConA();
    await prepararPortabilidad(db);
    await db.insert(ajustes).values({ clave: "backup_portables", valor: "false" }).onConflictDoUpdate({ target: ajustes.clave, set: { valor: "false" } });
    expect(await copiasPortablesActivas(db)).toBe(false);
    await prepararPortabilidad(db);
    expect(await db.select().from(ajustes).where(eq(ajustes.clave, "clave_portable"))).toHaveLength(0);
    process.env.APP_SECRET = SECRETO_B;
    await expect(ajustarCifradoTrasRestaurar(db, undefined)).rejects.toMatchObject({ status: 400, message: expect.stringContaining("otra instalación") });
  });

  it("copia de otra instalación sin la clave: con «sin clave» se restaura todo lo demás, sin documentos ni doble factor", async () => {
    const { idUsuario, idAdjunto } = await datosCifradosConA();
    process.env.APP_SECRET = SECRETO_B;
    await expect(ajustarCifradoTrasRestaurar(db, undefined)).rejects.toMatchObject({ status: 400 });
    expect(await ajustarCifradoTrasRestaurar(db, undefined, true)).toEqual({ recifrado: false, descartado: true });
    const [u] = await db.select().from(usuarios).where(eq(usuarios.idUsuario, idUsuario));
    expect(u).toMatchObject({ totpSecretoCifrado: null, totpActivo: false });
    expect(await db.select().from(adjuntosDatos).where(eq(adjuntosDatos.idAdjunto, idAdjunto))).toHaveLength(0);
    // El registro del documento sigue (sin archivo) y la base ya es legible con la clave de esta instalación
    expect(await db.select().from(adjuntos).where(eq(adjuntos.id, idAdjunto))).toHaveLength(1);
    expect(await secretoValido(db, SECRETO_B)).toBe(true);
  });

  it("también vale el APP_SECRET de origen en lugar de la clave, y la clave de origen queda sin validez", async () => {
    const { idAdjunto } = await datosCifradosConA();
    await asegurarComprobacion(db);
    await configurarClaveRecuperacion(db, "mi-clave-de-recuperacion");
    process.env.APP_SECRET = SECRETO_B;
    expect(await ajustarCifradoTrasRestaurar(db, SECRETO_A)).toEqual({ recifrado: true });
    const [d] = await db.select().from(adjuntosDatos).where(eq(adjuntosDatos.idAdjunto, idAdjunto));
    expect(descifrarBuffer(d.datos).toString()).toBe("contenido");
    // Al recifrar con el secreto, la clave guardada era la de origen: se descarta
    expect(await estadoClaveRecuperacion(db)).toEqual({ configurada: false });
  });
});

describe("la biblioteca de archivos también se vuelve a cifrar al restaurar en otra instalación", () => {
  it("con la clave de recuperación, los archivos de la biblioteca se abren en la otra instalación", async () => {
    const u = await crearUsuarioPrueba("administrador");
    const { archivo } = await guardarArchivo(db, { datos: Buffer.from("%PDF-1.4 contenido de la biblioteca"), nombre: "Pedido - Ana.pdf", creadoPor: u.idUsuario });
    await configurarClaveRecuperacion(db, "mi-clave-de-recuperacion");
    process.env.APP_SECRET = SECRETO_B;
    await expect(leerArchivo(db, archivo.id)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("otra instalación") });
    expect(await ajustarCifradoTrasRestaurar(db, "mi-clave-de-recuperacion")).toEqual({ recifrado: true });
    expect((await leerArchivo(db, archivo.id))?.datos.toString()).toContain("contenido de la biblioteca");
  });

  it("repara una biblioteca que quedó sin recifrar (recifrarBiblioteca) y se puede repetir", async () => {
    const u = await crearUsuarioPrueba("administrador");
    const { archivo } = await guardarArchivo(db, { datos: Buffer.from("%PDF-1.4 otro archivo"), nombre: "Rejilla.pdf", creadoPor: u.idUsuario });
    process.env.APP_SECRET = SECRETO_B;
    expect(await recifrarBiblioteca(db, SECRETO_A)).toEqual({ recifrados: 1, yaLegibles: 0, ilegibles: 0 });
    expect((await leerArchivo(db, archivo.id))?.datos.toString()).toContain("otro archivo");
    expect(await recifrarBiblioteca(db, SECRETO_A)).toEqual({ recifrados: 0, yaLegibles: 1, ilegibles: 0 });
    expect(await recifrarBiblioteca(db, "c".repeat(40))).toEqual({ recifrados: 0, yaLegibles: 1, ilegibles: 0 });
  });

  it("sin la clave («sin clave»), los archivos de la biblioteca que no se pueden abrir se quitan con su ficha", async () => {
    const u = await crearUsuarioPrueba("administrador");
    await guardarArchivo(db, { datos: Buffer.from("%PDF-1.4 perdido"), nombre: "Perdido.pdf", creadoPor: u.idUsuario });
    await asegurarComprobacion(db);
    process.env.APP_SECRET = SECRETO_B;
    expect(await ajustarCifradoTrasRestaurar(db, undefined, true)).toMatchObject({ descartado: true });
    expect(await listarArchivos(db)).toHaveLength(0);
    expect(await db.select().from(biblioteca)).toHaveLength(0);
  });
});
