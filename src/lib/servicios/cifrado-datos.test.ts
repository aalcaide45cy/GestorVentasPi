import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { bibliotecaDatos, usuarios } from "@/db/schema";
import { cifrar, cifrarBufferReal, descifrar, fijarCifradoActivo } from "@/lib/auth/cifrado";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { guardarArchivo, leerArchivo } from "./biblioteca";
import { convertirTodo, estadoCifrado } from "./cifrado-datos";

beforeEach(async () => {
  fijarCifradoActivo(true);
  await reiniciarBd();
});
afterAll(() => fijarCifradoActivo(false));

describe("interruptor del cifrado: convertir lo ya guardado", () => {
  it("pasa a claro lo cifrado, se sigue leyendo igual, y se puede volver a cifrar", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    await db.update(usuarios).set({ totpSecretoCifrado: cifrar("JBSWY3DPEHPK3PXP", "totp"), totpActivo: true }).where(eq(usuarios.idUsuario, u.idUsuario));
    const { archivo } = await guardarArchivo(db, { datos: Buffer.from("%PDF contenido secreto"), nombre: "a.pdf", creadoPor: u.idUsuario });
    expect(await estadoCifrado(db)).toMatchObject({ cifrados: 2, enClaro: 0 });

    // A claro
    fijarCifradoActivo(false);
    const r = await convertirTodo(db, false);
    expect(r.ilegibles).toBe(0);
    expect(await estadoCifrado(db)).toMatchObject({ cifrados: 0, enClaro: 2 });
    const [fila] = await db.select().from(bibliotecaDatos).where(eq(bibliotecaDatos.idArchivo, archivo.id));
    expect(Buffer.from(fila.datos as Buffer).subarray(0, 4).toString()).toBe("GVP0");
    expect((await leerArchivo(db, archivo.id))?.datos.toString()).toBe("%PDF contenido secreto");
    const [usr] = await db.select().from(usuarios).where(eq(usuarios.idUsuario, u.idUsuario));
    expect(descifrar(usr.totpSecretoCifrado as string, "totp")).toBe("JBSWY3DPEHPK3PXP");
    // Repetirlo no cambia nada
    expect((await convertirTodo(db, false)).convertidos).toBe(0);

    // De vuelta a cifrado
    fijarCifradoActivo(true);
    expect((await convertirTodo(db, true)).convertidos).toBeGreaterThanOrEqual(2);
    expect(await estadoCifrado(db)).toMatchObject({ cifrados: 2, enClaro: 0 });
    expect((await leerArchivo(db, archivo.id))?.datos.toString()).toBe("%PDF contenido secreto");
  });

  it("lo cifrado con la clave de otra instalación se deja como está y se cuenta", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const { archivo } = await guardarArchivo(db, { datos: Buffer.from("de otro equipo"), nombre: "b.pdf", creadoPor: u.idUsuario });
    const original = process.env.APP_SECRET;
    process.env.APP_SECRET = "otro-secreto-muy-largo-de-prueba-para-otra-instalacion-1234567890";
    const ajeno = cifrarBufferReal(Buffer.from("de otro equipo"));
    process.env.APP_SECRET = original;
    await db.update(bibliotecaDatos).set({ datos: ajeno }).where(eq(bibliotecaDatos.idArchivo, archivo.id));
    fijarCifradoActivo(false);
    const r = await convertirTodo(db, false);
    expect(r.ilegibles).toBe(1);
    expect(r.convertidos).toBe(0);
  });
});
