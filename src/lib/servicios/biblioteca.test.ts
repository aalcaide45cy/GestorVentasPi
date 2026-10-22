import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { clientes, expedientes } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { adivinarCategoria, cambiarArchivos, eliminarArchivos, guardarArchivo, guardarCopiaAutomatica, leerArchivo, listarArchivos, renombrarSegunLectura } from "./biblioteca";

beforeEach(reiniciarBd);

describe("biblioteca de archivos", () => {
  it("propone la categoría por el nombre y el tipo", () => {
    expect(adivinarCategoria("Expedientes_2026.xlsx")).toBe("listado");
    expect(adivinarCategoria("pago_rci.pdf")).toBe("pago_rci");
    expect(adivinarCategoria("ren-91-561595-1.pdf")).toBe("rejilla");
    expect(adivinarCategoria("SC332-1i26101517001.pdf")).toBe("pedido");
    expect(adivinarCategoria("notas.docx")).toBe("otro");
  });

  it("guarda cifrado, devuelve el mismo contenido y no duplica un archivo repetido", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const datos = Buffer.from("%PDF-1.4 contenido de prueba");
    const a = await guardarArchivo(db, { datos, nombre: "pago_rci_8000.pdf", creadoPor: u.idUsuario });
    expect(a).toMatchObject({ repetido: false, archivo: { categoria: "pago_rci", mime: "application/pdf", tamano: datos.length } });
    const otra = await guardarArchivo(db, { datos, nombre: "copia.pdf", creadoPor: u.idUsuario });
    expect(otra).toMatchObject({ repetido: true, archivo: { id: a.archivo.id, nombre: "pago_rci_8000.pdf" } });
    expect((await leerArchivo(db, a.archivo.id))?.datos.equals(datos)).toBe(true);
  });

  it("guarda con el nombre «Tipo - Cliente - Fecha» lo que se lee, sin duplicar y sin pisar otros nombres", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const datos = Buffer.from("%PDF-1.4 pedido de Jose Francisco");
    await guardarCopiaAutomatica(db, { datos, nombreOriginal: "SC332-1i26.pdf", categoria: "pedido", cliente: "JOSE FRANCISCO GOMEZ", fecha: "2026-07-07", creadoPor: u.idUsuario });
    let lista = await listarArchivos(db);
    expect(lista.map((f) => f.nombre)).toEqual(["Pedido - Jose Francisco Gomez - 07 Julio 2026.pdf"]);
    // El mismo archivo otra vez: no se duplica
    await guardarCopiaAutomatica(db, { datos, nombreOriginal: "otro-nombre.pdf", categoria: "pedido", cliente: "Jose Francisco Gomez", fecha: "2026-07-07", creadoPor: u.idUsuario });
    expect(await listarArchivos(db)).toHaveLength(1);
    // Otro documento distinto con el mismo cliente y fecha: «(2)»
    await guardarCopiaAutomatica(db, { datos: Buffer.from("%PDF-1.4 otro"), nombreOriginal: "x.pdf", categoria: "pedido", cliente: "Jose Francisco Gomez", fecha: "2026-07-07", creadoPor: u.idUsuario });
    lista = await listarArchivos(db);
    expect(lista.map((f) => f.nombre).sort()).toEqual(["Pedido - Jose Francisco Gomez - 07 Julio 2026 (2).pdf", "Pedido - Jose Francisco Gomez - 07 Julio 2026.pdf"]);
    // Sin cliente ni fecha leídos queda igualmente con nombre ordenado y con la fecha de subida; el nombre original se conserva
    await guardarCopiaAutomatica(db, { datos: Buffer.from("%PDF-1.4 sin nombre"), nombreOriginal: "raro.pdf", categoria: "pedido", cliente: null, creadoPor: u.idUsuario });
    const sinLeer = (await listarArchivos(db)).find((f) => f.nombreOriginal === "raro.pdf");
    expect(sinLeer?.nombre).toMatch(/^Pedido - Sin cliente - \d{2} [A-Za-zé]+ \d{4}\.pdf$/);
  });

  it("una rejilla se guarda como «Rejilla - Mes Año» y un archivo ya guardado se renombra con lo leído de él", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    await guardarCopiaAutomatica(db, { datos: Buffer.from("rejilla abril"), nombreOriginal: "Rejilla Comisiones - Abril 2024.pdf", categoria: "rejilla", mes: "2024-04", creadoPor: u.idUsuario });
    expect((await listarArchivos(db))[0].nombre).toBe("Rejilla - Abril 2024.pdf");
    const { archivo } = await guardarArchivo(db, { datos: Buffer.from("pago a mano"), nombre: "pago_rci_8000.pdf", creadoPor: u.idUsuario });
    expect(await renombrarSegunLectura(db, archivo.id, { cliente: "ana perez lopez", fecha: "2026-05-02" })).toBe("Pago RCI - Ana Perez Lopez - 02 Mayo 2026.pdf");
    // Sin datos para ponerle nombre no cambia
    expect(await renombrarSegunLectura(db, archivo.id, { cliente: null })).toBeNull();
  });

  it("filtra por categoría, renombra, cambia de categoría y elimina", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const x = await guardarArchivo(db, { datos: Buffer.from("uno"), nombre: "listado.xlsx", creadoPor: u.idUsuario });
    const y = await guardarArchivo(db, { datos: Buffer.from("dos"), nombre: "pedido.pdf", creadoPor: u.idUsuario });
    expect((await listarArchivos(db, ["listado"])).map((f) => f.id)).toEqual([x.archivo.id]);
    await cambiarArchivos(db, [y.archivo.id], { nombre: "Pedido de Ana.pdf", categoria: "rejilla" });
    expect((await listarArchivos(db, ["rejilla"]))[0]).toMatchObject({ nombre: "Pedido de Ana.pdf" });
    await expect(cambiarArchivos(db, [9999], { nombre: "x" })).rejects.toMatchObject({ status: 404 });
    expect(await eliminarArchivos(db, [x.archivo.id, y.archivo.id])).toBe(2);
    expect(await listarArchivos(db)).toEqual([]);
    expect(await leerArchivo(db, x.archivo.id)).toBeNull();
  });

  it("eliminar manda a la Papelera (no borra) y volver a subir el mismo archivo lo saca de ella", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const { archivo } = await guardarArchivo(db, { datos: Buffer.from("contenido"), nombre: "pedido.pdf", creadoPor: u.idUsuario });
    expect(await eliminarArchivos(db, [archivo.id])).toBe(1);
    expect(await listarArchivos(db)).toEqual([]);
    const otra = await guardarArchivo(db, { datos: Buffer.from("contenido"), nombre: "pedido.pdf", creadoPor: u.idUsuario });
    expect(otra.repetido).toBe(true);
    expect((await listarArchivos(db)).map((f) => f.id)).toEqual([archivo.id]);
  });

  it("asigna a un cliente o a un expediente (con su cliente), y se puede quitar la asignación", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const [cli] = await db.insert(clientes).values({ clienteId: "c1", nombre: "Ana Pérez" }).returning();
    const [exp] = await db.insert(expedientes).values({ idUsuario: u.idUsuario, idCliente: cli.id, fechaExpediente: "2026-10-01" }).returning();
    const a = await guardarArchivo(db, { datos: Buffer.from("uno"), nombre: "a.pdf", creadoPor: u.idUsuario });
    const b = await guardarArchivo(db, { datos: Buffer.from("dos"), nombre: "b.pdf", creadoPor: u.idUsuario });
    expect((await listarArchivos(db)).every((f) => f.asignadoA === null)).toBe(true);

    await cambiarArchivos(db, [a.archivo.id], { idCliente: cli.id });
    await cambiarArchivos(db, [b.archivo.id], { idExpediente: exp.idExpediente });
    const lista = await listarArchivos(db);
    expect(lista.find((f) => f.id === a.archivo.id)).toMatchObject({ idCliente: cli.id, idExpediente: null, asignadoA: "Ana Pérez" });
    expect(lista.find((f) => f.id === b.archivo.id)).toMatchObject({ idCliente: cli.id, idExpediente: exp.idExpediente, asignadoA: `#EXP-${String(exp.idExpediente).padStart(4, "0")} · Ana Pérez` });

    await cambiarArchivos(db, [a.archivo.id, b.archivo.id], { idCliente: null });
    expect((await listarArchivos(db)).every((f) => f.asignadoA === null)).toBe(true);
    await expect(cambiarArchivos(db, [a.archivo.id], { idCliente: 99999 })).rejects.toMatchObject({ status: 404 });
    await expect(cambiarArchivos(db, [a.archivo.id], {})).rejects.toMatchObject({ status: 400 });
  });
});
