import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { actualizarCatalogo, crearCatalogo, crearTienda, eliminarCatalogo, eliminarTienda, leerCatalogos, usosDeMarca } from "./catalogos";
import { esquemaCrearExpediente } from "./expedientes";
import { listarExpedientes } from "./expedientes-lectura";
import { crearExpediente } from "./expedientes-escritura";

beforeEach(reiniciarBd);

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

  it("eliminar un tipo de venta con expedientes lo archiva y los expedientes siguen asociados", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const { tiposVenta } = await leerCatalogos(db);
    const contado = tiposVenta.find((t) => t.nombre_tipo_venta === "Contado")!;
    const renting = tiposVenta.find((t) => t.nombre_tipo_venta === "Preference")!;
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_tipo_de_venta: contado.id_tipo_de_venta } }));

    await eliminarCatalogo(db, { tipo: "tipo_venta", id: contado.id_tipo_de_venta });
    expect((await leerCatalogos(db)).tiposVenta.some((t) => t.id_tipo_de_venta === contado.id_tipo_de_venta)).toBe(false);
    const [exp] = await listarExpedientes(db);
    expect(exp.id_tipo_de_venta).toBe(contado.id_tipo_de_venta);
    expect(exp.tipoDeVenta?.nombre_tipo_venta).toBe("Contado");
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
  it("alta y edición de marca con modelos", async () => {
    const marca = (await crearCatalogo(db, { tipo: "marca", nombre: "Nissan", acceso_rapido: true })) as { id_marca: number };
    const modelo = (await crearCatalogo(db, { tipo: "modelo", marca_id: marca.id_marca, nombre_modelo: "Qashqai" })) as { id_modelo: number };
    await actualizarCatalogo(db, { tipo: "modelo", id: modelo.id_modelo, nombre_modelo: "Juke", acceso_rapido: true, orden_acceso_rapido: 3 });
    const cat = await leerCatalogos(db);
    expect(cat.modelos.find((m) => m.id_modelo === modelo.id_modelo)).toMatchObject({ nombre_modelo: "Juke", orden_acceso_rapido: 3 });
  });

  it("las marcas y los modelos están grabados a fuego: no se pueden eliminar, ni desde el servicio ni directamente en la base", async () => {
    const marca = (await crearCatalogo(db, { tipo: "marca", nombre: "Kia" })) as { id_marca: number };
    const modelo = (await crearCatalogo(db, { tipo: "modelo", marca_id: marca.id_marca, nombre_modelo: "Ceed" })) as { id_modelo: number };
    await expect(eliminarCatalogo(db, { tipo: "marca", id: marca.id_marca })).rejects.toMatchObject({ status: 403, message: expect.stringContaining("grabados a fuego") });
    await expect(eliminarCatalogo(db, { tipo: "modelo", id: modelo.id_modelo })).rejects.toMatchObject({ status: 403 });
    // Aunque algo se saltara el servicio, la base lo impide (borrado de verdad y borrado lógico)
    const { marcas, modelos } = await import("@/db/schema");
    await expect(db.delete(modelos).where(eq(modelos.idModelo, modelo.id_modelo))).rejects.toThrow();
    await expect(db.delete(marcas).where(eq(marcas.idMarca, marca.id_marca))).rejects.toThrow();
    await expect(db.update(marcas).set({ eliminadoEn: new Date() }).where(eq(marcas.idMarca, marca.id_marca))).rejects.toThrow();
    expect((await leerCatalogos(db)).marcas.some((m) => m.id_marca === marca.id_marca)).toBe(true);
    expect(await usosDeMarca(db, marca.id_marca)).toEqual({ expedientes: 0, modelos: [] });
  });

  it("desactivar una marca no la borra", async () => {
    const marca = (await crearCatalogo(db, { tipo: "marca", nombre: "Seat" })) as { id_marca: number };
    await eliminarCatalogo(db, { tipo: "marca", id: marca.id_marca, toggleActivo: true, activo: false });
    expect((await leerCatalogos(db)).marcas.find((m) => m.id_marca === marca.id_marca)?.activo).toBe(false);
  });

  it("eliminar una tienda con expedientes la archiva sin desasociar el expediente", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const tienda = await crearTienda(db, { nombre: "Centro", ciudad: "Madrid" });
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_tienda: tienda.id_tienda } }));
    await eliminarTienda(db, tienda.id_tienda);
    expect((await leerCatalogos(db)).tiendas.some((t) => t.id_tienda === tienda.id_tienda)).toBe(false);
    expect((await listarExpedientes(db))[0].id_tienda).toBe(tienda.id_tienda);
    const vacia = await crearTienda(db, { nombre: "Vacía" });
    await eliminarTienda(db, vacia.id_tienda);
  });
});

describe("marcas: color de la cápsula y punto", () => {
  it("guarda el color, el símbolo y el color del punto, y no los pierde al editar otros datos", async () => {
    const m = (await crearCatalogo(db, { tipo: "marca", nombre: "Dacia", color: "#22c55e", punto: "●", punto_color: "#facc15" })) as { id_marca: number; color: string | null; punto: string | null; punto_color: string | null };
    expect(m).toMatchObject({ color: "#22c55e", punto: "●", punto_color: "#facc15" });
    // Editar solo el nombre no toca el aspecto
    const igual = (await actualizarCatalogo(db, { tipo: "marca", id: m.id_marca, nombre: "Dacia SA" })) as { color: string | null; punto: string | null; punto_color: string | null };
    expect(igual).toMatchObject({ color: "#22c55e", punto: "●", punto_color: "#facc15" });
    // Cambiar el símbolo y quitar el color de la cápsula
    const otro = (await actualizarCatalogo(db, { tipo: "marca", id: m.id_marca, nombre: "Dacia SA", color: null, punto: ",", punto_color: "#ef4444" })) as { color: string | null; punto: string | null; punto_color: string | null };
    expect(otro).toMatchObject({ color: null, punto: ",", punto_color: "#ef4444" });
    // Quitar el punto
    const sin = (await actualizarCatalogo(db, { tipo: "marca", id: m.id_marca, nombre: "Dacia SA", punto: null, punto_color: null })) as { punto: string | null; punto_color: string | null };
    expect(sin).toMatchObject({ punto: null, punto_color: null });
  });
});

describe("estados de vehículo: cápsula, punto y quién prevalece", () => {
  it("guarda el aspecto del estado y no lo pierde al editar otros datos", async () => {
    const e = (await crearCatalogo(db, { tipo: "estado_vehiculo", nombre_estado_vehiculo: "KM0", clase: "VO", subtipo_vo: "KM0" })) as { id_estado_vehiculo: number; prevalece: string };
    expect(e.prevalece).toBe("marca");
    const a = (await actualizarCatalogo(db, { tipo: "estado_vehiculo", id: e.id_estado_vehiculo, nombre_estado_vehiculo: "KM0", clase: "VO", subtipo_vo: "KM0", capsula_color: "#ef444480", punto: "★", punto_color: "#facc15", prevalece: "estado" })) as { capsula_color: string | null; punto: string | null; punto_color: string | null; prevalece: string };
    expect(a).toMatchObject({ capsula_color: "#ef444480", punto: "★", punto_color: "#facc15", prevalece: "estado" });
    const igual = (await actualizarCatalogo(db, { tipo: "estado_vehiculo", id: e.id_estado_vehiculo, nombre_estado_vehiculo: "KM0 nuevo", clase: "VO", subtipo_vo: "KM0" })) as { capsula_color: string | null; punto: string | null; prevalece: string };
    expect(igual).toMatchObject({ capsula_color: "#ef444480", punto: "★", prevalece: "estado" });
  });
});
