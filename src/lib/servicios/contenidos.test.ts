import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { adjuntos, adjuntosDatos, biblioteca, bibliotecaDatos, contenidosCompartidos } from "@/db/schema";
import { cifrarBuffer } from "@/lib/auth/cifrado";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { guardarAdjunto, leerAdjunto } from "./adjuntos";
import { guardarArchivo, leerArchivo } from "./biblioteca";
import { archivosRepetidos, huellaDe } from "./contenidos";

beforeEach(reiniciarBd);

const pdf = (texto: string) => Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\n% ${texto}\ntrailer<<>>\n%%EOF`);
const totalCompartidos = async () => (await db.select().from(contenidosCompartidos)).length;

describe("documentos repetidos guardados una sola vez", () => {
  it("un pedido guardado como adjunto y luego en la biblioteca queda en una sola copia y se lee igual desde los dos sitios", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const datos = pdf("pedido de Ana");
    const a = await guardarAdjunto(db, { datos, nombre: "pedido.pdf", tipo: "pedido", creadoPor: u.idUsuario });
    expect(await totalCompartidos()).toBe(0);
    const b = await guardarArchivo(db, { datos, nombre: "Pedido - Ana.pdf", categoria: "pedido", creadoPor: u.idUsuario });
    expect(await totalCompartidos()).toBe(1);
    const [da] = await db.select().from(adjuntosDatos).where(eq(adjuntosDatos.idAdjunto, a.id));
    const [db_] = await db.select().from(bibliotecaDatos).where(eq(bibliotecaDatos.idArchivo, b.archivo.id));
    expect(da.datos).toBeNull();
    expect(db_.datos).toBeNull();
    expect(da.contenidoHash).toBe(huellaDe(datos));
    expect((await leerAdjunto(db, a.id))?.datos.equals(datos)).toBe(true);
    expect((await leerArchivo(db, b.archivo.id))?.datos.equals(datos)).toBe(true);
  });

  it("el archivo compartido se borra solo cuando ya nadie lo usa", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const datos = pdf("pedido de Luis");
    const a = await guardarAdjunto(db, { datos, nombre: "pedido.pdf", tipo: "pedido", creadoPor: u.idUsuario });
    const b = await guardarArchivo(db, { datos, nombre: "Pedido - Luis.pdf", categoria: "pedido", creadoPor: u.idUsuario });
    await db.delete(adjuntos).where(eq(adjuntos.id, a.id));
    expect(await totalCompartidos()).toBe(1);
    expect((await leerArchivo(db, b.archivo.id))?.datos.equals(datos)).toBe(true);
    await db.delete(biblioteca).where(eq(biblioteca.id, b.archivo.id));
    expect(await totalCompartidos()).toBe(0);
  });

  it("dos adjuntos iguales (el mismo PDF subido dos veces) también se guardan una sola vez", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const datos = pdf("repetido");
    const a1 = await guardarAdjunto(db, { datos, nombre: "uno.pdf", tipo: "pedido", creadoPor: u.idUsuario });
    const a2 = await guardarAdjunto(db, { datos, nombre: "dos.pdf", tipo: "pedido", creadoPor: u.idUsuario });
    expect(await totalCompartidos()).toBe(1);
    expect((await leerAdjunto(db, a1.id))?.datos.equals(datos)).toBe(true);
    expect((await leerAdjunto(db, a2.id))?.datos.equals(datos)).toBe(true);
    // Uno distinto no se mezcla
    const a3 = await guardarAdjunto(db, { datos: pdf("otro"), nombre: "tres.pdf", tipo: "pedido", creadoPor: u.idUsuario });
    expect(await totalCompartidos()).toBe(1);
    expect((await leerAdjunto(db, a3.id))?.datos.equals(pdf("otro"))).toBe(true);
  });

  it("limpia lo que ya estaba repetido de antes, cuenta lo que ahorra y no toca las rejillas", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const datos = pdf("de antes ".repeat(500));
    // Como estaba antes de esta versión: cada copia con su contenido y sin huella
    const [ad] = await db.insert(adjuntos).values({ ambito: "pendiente", tipo: "pedido", nombre: "antiguo.pdf", mime: "application/pdf", tamano: datos.length, creadoPor: u.idUsuario }).returning();
    await db.insert(adjuntosDatos).values({ idAdjunto: ad.id, datos: cifrarBuffer(datos) });
    const huella = huellaDe(datos);
    const [bi] = await db.insert(biblioteca).values({ categoria: "pedido", nombre: "antiguo.pdf", nombreOriginal: "antiguo.pdf", mime: "application/pdf", tamano: datos.length, huella, creadoPor: u.idUsuario }).returning();
    await db.insert(bibliotecaDatos).values({ idArchivo: bi.id, datos: cifrarBuffer(datos) });
    // Una rejilla con el mismo contenido que un adjunto: no se debe tocar
    const rej = pdf("rejilla");
    const [ad2] = await db.insert(adjuntos).values({ ambito: "pendiente", tipo: "pedido", nombre: "r.pdf", mime: "application/pdf", tamano: rej.length, creadoPor: u.idUsuario }).returning();
    await db.insert(adjuntosDatos).values({ idAdjunto: ad2.id, datos: cifrarBuffer(rej) });
    const [br] = await db.insert(biblioteca).values({ categoria: "rejilla", nombre: "Rejilla - Octubre 2026.pdf", nombreOriginal: "r.pdf", mime: "application/pdf", tamano: rej.length, huella: huellaDe(rej), creadoPor: u.idUsuario }).returning();
    await db.insert(bibliotecaDatos).values({ idArchivo: br.id, datos: cifrarBuffer(rej) });

    const ver = await archivosRepetidos(db, false);
    expect(ver).toMatchObject({ grupos: 1, copiasSobrantes: 1 });
    expect(ver.bytesLiberados).toBeGreaterThan(0);
    expect(await totalCompartidos()).toBe(0);

    const hecho = await archivosRepetidos(db, true);
    expect(hecho).toMatchObject({ grupos: 1, copiasSobrantes: 1 });
    expect(await totalCompartidos()).toBe(1);
    expect((await leerAdjunto(db, ad.id))?.datos.equals(datos)).toBe(true);
    expect((await leerArchivo(db, bi.id))?.datos.equals(datos)).toBe(true);
    // La rejilla sigue con su propio contenido y sin huella
    const [dr] = await db.select().from(bibliotecaDatos).where(eq(bibliotecaDatos.idArchivo, br.id));
    expect(dr.datos).not.toBeNull();
    expect(dr.contenidoHash).toBeNull();
    // Repetirlo no cambia nada
    expect(await archivosRepetidos(db, true)).toMatchObject({ grupos: 0, copiasSobrantes: 0 });
  });
});
