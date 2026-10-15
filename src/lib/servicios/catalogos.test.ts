import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { HttpError } from "@/lib/auth/sesion";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { actualizarCatalogo, crearCatalogo, crearTienda, eliminarCatalogo, eliminarTienda, leerCatalogos } from "./catalogos";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";

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

describe("tipos de venta (pagos)", () => {
  it("la semilla trae Contado, Crédito y Preference con su categoría (sin Renting)", async () => {
    const { tiposVenta } = await leerCatalogos(db);
    const porNombre = Object.fromEntries(tiposVenta.map((t) => [t.nombre_tipo_venta, t.categoria]));
    expect(porNombre).toEqual({ Contado: "CONTADO", Crédito: "CREDITO", Preference: "PREFERENCE" });
  });

  it("deduce la categoría del nombre al crear y al renombrar", async () => {
    const creado = (await crearCatalogo(db, { tipo: "tipo_venta", nombre_tipo_venta: "Financiación Preference" })) as { id_tipo_de_venta: number; categoria: string };
    expect(creado.categoria).toBe("PREFERENCE");
    const renombrado = (await actualizarCatalogo(db, { tipo: "tipo_venta", id: creado.id_tipo_de_venta, nombre_tipo_venta: "Financiación Crédito" })) as { categoria: string };
    expect(renombrado.categoria).toBe("CREDITO");
  });

  it("respeta la categoría indicada y permite editar color y orden", async () => {
    const t = (await crearCatalogo(db, { tipo: "tipo_venta", nombre_tipo_venta: "Especial", categoria: "RENTING", color: "#112233", orden: 7 })) as {
      id_tipo_de_venta: number;
      categoria: string;
      color: string;
      orden: number;
    };
    expect(t).toMatchObject({ categoria: "RENTING", color: "#112233", orden: 7 });
    const e = (await actualizarCatalogo(db, { tipo: "tipo_venta", id: t.id_tipo_de_venta, nombre_tipo_venta: "Especial 2", categoria: "RENTING", color: "#ffffff", orden: 1 })) as {
      color: string;
      orden: number;
    };
    expect(e).toMatchObject({ color: "#ffffff", orden: 1 });
  });

  it("se puede eliminar si no tiene expedientes y se rechaza (409) si los tiene", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const { tiposVenta } = await leerCatalogos(db);
    const contado = tiposVenta.find((t) => t.nombre_tipo_venta === "Contado")!;
    const renting = tiposVenta.find((t) => t.nombre_tipo_venta === "Preference")!;
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_tipo_de_venta: contado.id_tipo_de_venta } }));

    expect(await codigoDeError(eliminarCatalogo(db, { tipo: "tipo_venta", id: contado.id_tipo_de_venta }))).toBe(409);
    await eliminarCatalogo(db, { tipo: "tipo_venta", id: renting.id_tipo_de_venta });
    expect((await leerCatalogos(db)).tiposVenta.some((t) => t.nombre_tipo_venta === "Preference")).toBe(false);
  });
});

describe("estados del vehículo", () => {
  it("deduce clase y subtipo del nombre", async () => {
    const buyback = (await crearCatalogo(db, { tipo: "estado_vehiculo", nombre_estado_vehiculo: "Buyback 2" })) as { clase: string; subtipo_vo: string | null };
    expect(buyback).toMatchObject({ clase: "VO", subtipo_vo: "BUYBACK" });
    const nuevo2 = (await crearCatalogo(db, { tipo: "estado_vehiculo", nombre_estado_vehiculo: "nuevo" })) as { clase: string };
    expect(nuevo2.clase).toBe("VN");
  });

  it("solo uno puede ser el predeterminado", async () => {
    const a = (await crearCatalogo(db, { tipo: "estado_vehiculo", nombre_estado_vehiculo: "A", predeterminado: true })) as { id_estado_vehiculo: number };
    await crearCatalogo(db, { tipo: "estado_vehiculo", nombre_estado_vehiculo: "B", predeterminado: true });
    const { estados } = await leerCatalogos(db);
    expect(estados.filter((e) => e.predeterminado).map((e) => e.nombre_estado_vehiculo)).toEqual(["B"]);
    await actualizarCatalogo(db, { tipo: "estado_vehiculo", id: a.id_estado_vehiculo, nombre_estado_vehiculo: "A", predeterminado: true });
    expect((await leerCatalogos(db)).estados.filter((e) => e.predeterminado).map((e) => e.nombre_estado_vehiculo)).toEqual(["A"]);
  });
});

describe("marcas, modelos y tiendas", () => {
  it("alta, edición y baja de marca con modelos", async () => {
    const marca = (await crearCatalogo(db, { tipo: "marca", nombre: "Nissan", acceso_rapido: true })) as { id_marca: number };
    const modelo = (await crearCatalogo(db, { tipo: "modelo", marca_id: marca.id_marca, nombre_modelo: "Qashqai" })) as { id_modelo: number };
    await actualizarCatalogo(db, { tipo: "modelo", id: modelo.id_modelo, nombre_modelo: "Juke", acceso_rapido: true, orden_acceso_rapido: 3 });
    const cat = await leerCatalogos(db);
    expect(cat.modelos.find((m) => m.id_modelo === modelo.id_modelo)).toMatchObject({ nombre_modelo: "Juke", orden_acceso_rapido: 3 });

    await eliminarCatalogo(db, { tipo: "marca", id: marca.id_marca });
    const despues = await leerCatalogos(db);
    expect(despues.marcas.some((m) => m.id_marca === marca.id_marca)).toBe(false);
    expect(despues.modelos.some((m) => m.id_modelo === modelo.id_modelo)).toBe(false); // se borran con la marca
  });

  it("no elimina una marca cuyos modelos tienen expedientes", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const marca = (await crearCatalogo(db, { tipo: "marca", nombre: "Kia" })) as { id_marca: number };
    const modelo = (await crearCatalogo(db, { tipo: "modelo", marca_id: marca.id_marca, nombre_modelo: "Ceed" })) as { id_modelo: number };
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_modelo: modelo.id_modelo } }));
    expect(await codigoDeError(eliminarCatalogo(db, { tipo: "marca", id: marca.id_marca }))).toBe(409);
    expect(await codigoDeError(eliminarCatalogo(db, { tipo: "modelo", id: modelo.id_modelo }))).toBe(409);
  });

  it("desactivar una marca no la borra", async () => {
    const marca = (await crearCatalogo(db, { tipo: "marca", nombre: "Seat" })) as { id_marca: number };
    await eliminarCatalogo(db, { tipo: "marca", id: marca.id_marca, toggleActivo: true, activo: false });
    expect((await leerCatalogos(db)).marcas.find((m) => m.id_marca === marca.id_marca)?.activo).toBe(false);
  });

  it("no elimina una tienda con expedientes", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const tienda = await crearTienda(db, { nombre: "Centro", ciudad: "Madrid" });
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_tienda: tienda.id_tienda } }));
    expect(await codigoDeError(eliminarTienda(db, tienda.id_tienda))).toBe(409);
    const vacia = await crearTienda(db, { nombre: "Vacía" });
    await eliminarTienda(db, vacia.id_tienda);
  });
});
