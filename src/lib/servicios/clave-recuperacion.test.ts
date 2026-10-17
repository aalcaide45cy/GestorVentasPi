import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { adjuntos, adjuntosDatos, usuarios } from "@/db/schema";
import { cifrar, cifrarBuffer, descifrar, descifrarBuffer } from "@/lib/auth/cifrado";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { ajustarCifradoTrasRestaurar, asegurarComprobacion, configurarClaveRecuperacion, estadoClaveRecuperacion, secretoValido } from "./clave-recuperacion";

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
