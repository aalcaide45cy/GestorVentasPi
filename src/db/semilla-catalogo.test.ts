import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { marcas, modelos, plantillasPlan, plantillasTarifasVn } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../tests/ayudas";
import { eliminarCatalogo } from "@/lib/servicios/catalogos";
import { CATALOGO_INICIAL, sembrarCatalogoInicial, type CatalogoInicial } from "./semilla";

beforeEach(reiniciarBd);

const catalogo: CatalogoInicial = {
  version: 1,
  marcas: [{ nombre: "Marca A", activo: true, accesoRapido: true, sistemaComisiones: true, color: "#112233", punto: "●", puntoColor: "#445566", modelos: [{ nombre: "Uno", accesoRapido: true, orden: 1 }, { nombre: "Dos", accesoRapido: false, orden: 0 }] }],
  plantillasTarifas: [{ nombre: "Tarifas base", descripcion: "de serie", datos: { marcas: [], tarifas: [] } }],
  plantillasPlan: [{ ambito: "global", nombre: "Plan base", descripcion: null, datos: { notas: "hola" } }],
};

describe("catálogo de partida (grabado a fuego)", () => {
  it("el archivo de serie trae marcas con modelos", () => {
    expect(CATALOGO_INICIAL.marcas.map((m) => m.nombre)).toEqual(expect.arrayContaining(["Dacia", "Renault"]));
    expect(CATALOGO_INICIAL.marcas.every((m) => m.modelos.length > 0)).toBe(true);
  });

  it("una instalación nueva trae las marcas con sus colores y las plantillas base", async () => {
    await sembrarCatalogoInicial(db, catalogo);
    const [m] = await db.select().from(marcas);
    expect(m).toMatchObject({ nombre: "Marca A", color: "#112233", punto: "●", puntoColor: "#445566", accesoRapido: true, sistemaComisiones: true });
    expect((await db.select().from(modelos)).map((x) => x.nombreModelo).sort()).toEqual(["Dos", "Uno"]);
    expect((await db.select().from(plantillasTarifasVn)).filter((p) => p.nombre === "Tarifas base")).toMatchObject([{ nombre: "Tarifas base", sistema: true }]);
    expect(await db.select().from(plantillasPlan)).toMatchObject([{ nombre: "Plan base", sistema: true }]);
  });

  it("repetir el sembrado no duplica nada, y lo borrado a mano no vuelve", async () => {
    await sembrarCatalogoInicial(db, catalogo);
    await sembrarCatalogoInicial(db, catalogo);
    expect((await db.select().from(marcas)).length).toBe(1);
    expect((await db.select().from(plantillasTarifasVn)).filter((p) => p.nombre === "Tarifas base").length).toBe(1);
    // Las plantillas base se borran a mano y no se vuelven a traer
    await db.delete(plantillasTarifasVn);
    await db.delete(plantillasPlan);
    await sembrarCatalogoInicial(db, catalogo);
    expect(await db.select().from(plantillasTarifasVn)).toEqual([]);
    expect(await db.select().from(plantillasPlan)).toEqual([]);
  });

  it("las marcas y los modelos de serie se pueden borrar a mano", async () => {
    await crearUsuarioPrueba("administrador");
    await sembrarCatalogoInicial(db, catalogo);
    const [mo] = await db.select().from(modelos).where(eq(modelos.nombreModelo, "Uno"));
    await eliminarCatalogo(db, { tipo: "modelo", id: mo.idModelo, sin_modelo: true } as never);
    const [m] = await db.select().from(marcas);
    await eliminarCatalogo(db, { tipo: "marca", id: m.idMarca } as never);
    expect((await db.select().from(marcas).where(eq(marcas.idMarca, m.idMarca)))[0].eliminadoEn).not.toBeNull();
  });
});
