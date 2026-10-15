import { createCanvas } from "@napi-rs/canvas";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { adjuntos, adjuntosDatos, clientes } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { detectarMime, eliminarAdjunto, establecerFotoCliente, guardarAdjunto, leerAdjunto, listarAdjuntos, vincularPendientes } from "./adjuntos";
import { crearCliente, esquemaCliente } from "./clientes";

beforeEach(reiniciarBd);

function png(ancho = 3000, alto = 2000): Buffer {
  const l = createCanvas(ancho, alto);
  const ctx = l.getContext("2d");
  ctx.fillStyle = "#336699";
  ctx.fillRect(0, 0, ancho, alto);
  return l.toBuffer("image/png");
}

const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

describe("adjuntos", () => {
  it("reconoce el tipo por la firma y rechaza lo demás", async () => {
    expect(detectarMime(png(10, 10))).toBe("image/png");
    expect(detectarMime(pdf)).toBe("application/pdf");
    expect(detectarMime(Buffer.from("hola"))).toBeNull();
    const u = await crearUsuarioPrueba("vendedor");
    await expect(guardarAdjunto(db, { datos: Buffer.from("MZ ejecutable"), nombre: "x.exe", tipo: "otro", creadoPor: u.idUsuario })).rejects.toMatchObject({ status: 415 });
    await expect(guardarAdjunto(db, { datos: Buffer.alloc(0), nombre: "x", tipo: "otro", creadoPor: u.idUsuario })).rejects.toMatchObject({ status: 400 });
  });

  it("guarda la imagen reducida, cifrada y con miniatura, y la devuelve igual", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const c = await crearCliente(db, esquemaCliente.parse({ nombre: "Ana" }), null);
    const a = await guardarAdjunto(db, { datos: png(), nombre: "dni.png", tipo: "dni_frente", idCliente: c.id, creadoPor: u.idUsuario });
    expect(a).toMatchObject({ mime: "image/jpeg", tieneMiniatura: true, tipo: "dni_frente", idCliente: c.id });
    const r = await leerAdjunto(db, a.id);
    expect(detectarMime(r!.datos)).toBe("image/jpeg");
    const miniatura = await leerAdjunto(db, a.id, true);
    expect(miniatura!.datos.length).toBeLessThan(r!.datos.length);
    // En la base de datos no está en claro
    const [fila] = await db.select().from(adjuntosDatos).where(eq(adjuntosDatos.idAdjunto, a.id));
    expect(fila.datos.equals(r!.datos)).toBe(false);
    expect(detectarMime(fila.datos)).toBeNull();
    expect((await listarAdjuntos(db, { idCliente: c.id })).map((x) => x.id)).toEqual([a.id]);
  });

  it("los PDF se guardan tal cual y sin miniatura", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const a = await guardarAdjunto(db, { datos: pdf, nombre: "pedido.pdf", tipo: "pedido", creadoPor: u.idUsuario });
    expect(a).toMatchObject({ mime: "application/pdf", tieneMiniatura: false });
    expect((await leerAdjunto(db, a.id))!.datos.equals(pdf)).toBe(true);
  });

  it("lo subido antes de guardar queda pendiente y se vincula; la foto del cliente se enlaza sola", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const otro = await crearUsuarioPrueba("vendedor", "Otro");
    const dni = await guardarAdjunto(db, { datos: png(400, 300), nombre: "dni.png", tipo: "dni_frente", creadoPor: u.idUsuario });
    const foto = await guardarAdjunto(db, { datos: png(300, 380), nombre: "foto.jpg", tipo: "foto_cliente", creadoPor: u.idUsuario, miniaturaPropia: png(300, 380) });
    expect(dni.idCliente).toBeNull();
    const c = await crearCliente(db, esquemaCliente.parse({ nombre: "Luis" }), null);
    // otro usuario no puede vincular lo que subió este
    expect(await vincularPendientes(db, [dni.id, foto.id], { idCliente: c.id }, otro.idUsuario)).toBe(0);
    expect(await vincularPendientes(db, [dni.id, foto.id], { idCliente: c.id }, u.idUsuario)).toBe(2);
    const [cli] = await db.select().from(clientes).where(eq(clientes.id, c.id));
    expect(cli.fotoAdjuntoId).toBe(foto.id);
    // ya vinculado: no se vuelve a mover
    expect(await vincularPendientes(db, [dni.id], { idCliente: c.id }, u.idUsuario)).toBe(0);
  });

  it("eliminar es un borrado lógico (se conserva el fichero) y quita la foto del cliente", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const otro = await crearUsuarioPrueba("vendedor", "Otro");
    const admin = await crearUsuarioPrueba("administrador", "Admin");
    const c = await crearCliente(db, esquemaCliente.parse({ nombre: "Eva" }), null);
    const foto = await guardarAdjunto(db, { datos: png(300, 380), nombre: "foto.jpg", tipo: "foto_cliente", idCliente: c.id, creadoPor: u.idUsuario });
    await establecerFotoCliente(db, c.id, foto.id);
    await expect(eliminarAdjunto(db, otro, foto.id)).rejects.toMatchObject({ status: 403 });
    await eliminarAdjunto(db, admin, foto.id);
    expect(await leerAdjunto(db, foto.id)).toBeNull();
    expect(await listarAdjuntos(db, { idCliente: c.id })).toHaveLength(0);
    expect((await db.select().from(clientes).where(eq(clientes.id, c.id)))[0].fotoAdjuntoId).toBeNull();
    // la fila y el contenido siguen en la base de datos
    expect((await db.select().from(adjuntos).where(eq(adjuntos.id, foto.id)))[0].eliminadoEn).not.toBeNull();
    expect(await db.select().from(adjuntosDatos).where(eq(adjuntosDatos.idAdjunto, foto.id))).toHaveLength(1);
  });
});
