import { isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { clientes, tiendas } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { importarSeccion } from "./intercambio";
import { FORMATO_LOTE, ORDEN_IMPORTACION, SECCIONES_DE_TODO, exportarLote, importarLote, leerLote, resumenLote } from "./intercambio-lote";

beforeEach(reiniciarBd);

const archivoClientes = {
  app: "GestorVentasPi",
  formato: "gv-seccion-1",
  seccion: "clientes",
  datos: [
    { dni: "11111111H", nombre: "Ana Uno", tienda: "Rivas" },
    { dni: "22222222J", nombre: "Beto Dos", tienda: "Rivas" },
  ],
};

async function prepararOrigen(idAdmin: number) {
  await db.insert(tiendas).values({ nombre: "Rivas", ciudad: "Madrid" });
  await importarSeccion(db, idAdmin, archivoClientes, "anadir", true);
}

describe("exportar todo e importar en lote", () => {
  it("el lote lleva las secciones en el orden de importación y sin duplicar clientes y expedientes por separado", async () => {
    const lote = await exportarLote(db, SECCIONES_DE_TODO, "9.9.9");
    expect(lote).toMatchObject({ app: "GestorVentasPi", formato: FORMATO_LOTE, version: "9.9.9" });
    const orden = lote.secciones.map((p) => p.seccion);
    expect(orden).toEqual(ORDEN_IMPORTACION.filter((s) => SECCIONES_DE_TODO.includes(s)));
    expect(orden).not.toContain("clientes");
    expect(orden).not.toContain("expedientes");
    expect(orden.indexOf("tiendas")).toBeLessThan(orden.indexOf("clientes_expedientes"));
  });

  it("leerLote acepta el archivo de una sola sección y rechaza lo que no es de la aplicación", () => {
    expect(leerLote(archivoClientes).secciones).toHaveLength(1);
    expect(() => leerLote({ app: "Otra", formato: FORMATO_LOTE, secciones: [] })).toThrow();
    expect(() => leerLote({ app: "GestorVentasPi", formato: FORMATO_LOTE, secciones: [{ seccion: "tiendas", datos: [] }, { seccion: "tiendas", datos: [] }] })).toThrow(/dos veces/);
    expect(() => leerLote(null)).toThrow();
  });

  it("cotejar no cambia nada y enseña lo que se aplicaría; aplicar lo hace y una segunda vez no hay nada nuevo", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await prepararOrigen(admin.idUsuario);
    const lote = leerLote(await exportarLote(db, ["tiendas", "clientes"]));
    expect(resumenLote(lote).secciones.map((s) => [s.seccion, s.registros])).toEqual([["tiendas", 1], ["clientes", 2]]);

    // Se vacía la aplicación y se importa el archivo
    await reiniciarBd();
    const admin2 = await crearUsuarioPrueba("administrador");
    const elecciones = [
      { seccion: "clientes" as const, modo: "anadir" as const },
      { seccion: "tiendas" as const, modo: "anadir" as const },
    ];
    const cotejo = await importarLote(db, admin2.idUsuario, lote, elecciones, false);
    expect(cotejo.aplicado).toBe(false);
    // Salen en el orden de importación (tiendas antes que clientes) y cuentan con lo que crean las anteriores
    expect(cotejo.informes.map((i) => [i.seccion, i.nuevos])).toEqual([["tiendas", 1], ["clientes", 2]]);
    expect(await db.select().from(clientes).where(isNull(clientes.eliminadoEn))).toHaveLength(0);
    expect(await db.select().from(tiendas)).toHaveLength(0);

    const hecho = await importarLote(db, admin2.idUsuario, lote, elecciones, true);
    expect(hecho.aplicado).toBe(true);
    expect(await db.select().from(clientes).where(isNull(clientes.eliminadoEn))).toHaveLength(2);
    expect(await db.select().from(tiendas)).toHaveLength(1);

    const otra = await importarLote(db, admin2.idUsuario, lote, elecciones, true);
    expect(otra.informes.map((i) => i.nuevos)).toEqual([0, 0]);
  });

  it("solo se importa lo elegido", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await prepararOrigen(admin.idUsuario);
    const lote = leerLote(await exportarLote(db, ["tiendas", "clientes"]));
    await reiniciarBd();
    const admin2 = await crearUsuarioPrueba("administrador");
    await importarLote(db, admin2.idUsuario, lote, [{ seccion: "tiendas", modo: "anadir" }], true);
    expect(await db.select().from(tiendas)).toHaveLength(1);
    expect(await db.select().from(clientes).where(isNull(clientes.eliminadoEn))).toHaveLength(0);
  });

  it("no deja elegir lo que el archivo no trae, lo que no se importa ni un modo no disponible", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const lote = leerLote({ app: "GestorVentasPi", formato: FORMATO_LOTE, secciones: [{ seccion: "tiendas", datos: [] }, { seccion: "usuarios", datos: [] }, { seccion: "ajustes", datos: [] }] });
    await expect(importarLote(db, admin.idUsuario, lote, [{ seccion: "clientes", modo: "anadir" }], false)).rejects.toThrow(/no trae/);
    await expect(importarLote(db, admin.idUsuario, lote, [{ seccion: "usuarios", modo: "anadir" }], false)).rejects.toThrow(/solo se puede exportar/);
    await expect(importarLote(db, admin.idUsuario, lote, [{ seccion: "ajustes", modo: "sustituir" }], false)).rejects.toThrow(/no está disponible/);
    await expect(importarLote(db, admin.idUsuario, lote, [], false)).rejects.toThrow(/al menos una/);
  });
});
