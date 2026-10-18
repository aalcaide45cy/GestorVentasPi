import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { actualizarCatalogo, crearCatalogo, crearTienda, eliminarCatalogo, eliminarTienda, leerCatalogos } from "./catalogos";
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

  it("eliminar una marca o modelo con expedientes los archiva sin desasociar el expediente", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const marca = (await crearCatalogo(db, { tipo: "marca", nombre: "Kia" })) as { id_marca: number };
    const modelo = (await crearCatalogo(db, { tipo: "modelo", marca_id: marca.id_marca, nombre_modelo: "Ceed" })) as { id_modelo: number };
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_modelo: modelo.id_modelo } }));
    await eliminarCatalogo(db, { tipo: "marca", id: marca.id_marca });
    const cat = await leerCatalogos(db);
    expect(cat.marcas.some((m) => m.id_marca === marca.id_marca)).toBe(false);
    expect(cat.modelos.some((m) => m.id_modelo === modelo.id_modelo)).toBe(false);
    const [exp] = await listarExpedientes(db);
    expect(exp.id_modelo).toBe(modelo.id_modelo);
    expect(exp.modelo?.nombre_modelo).toBe("Ceed");
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

describe("eliminar un modelo con expedientes", () => {
  async function preparar() {
    const admin = await crearUsuarioPrueba("administrador");
    const marca = (await crearCatalogo(db, { tipo: "marca", nombre: "Dacia" })) as { id_marca: number };
    const sandero = (await crearCatalogo(db, { tipo: "modelo", marca_id: marca.id_marca, nombre_modelo: "Sandero" })) as { id_modelo: number };
    const stepway = (await crearCatalogo(db, { tipo: "modelo", marca_id: marca.id_marca, nombre_modelo: "Sandero Stepway" })) as { id_modelo: number };
    const { expedientes } = await import("@/db/schema");
    await db.insert(expedientes).values([{ idUsuario: admin.idUsuario, idModelo: stepway.id_modelo }, { idUsuario: admin.idUsuario, idModelo: stepway.id_modelo }]);
    return { marca, sandero, stepway, expedientes };
  }

  it("exige elegir adónde pasan los expedientes", async () => {
    const { stepway } = await preparar();
    await expect(eliminarCatalogo(db, { tipo: "modelo", id: stepway.id_modelo })).rejects.toMatchObject({ status: 409 });
  });

  it("los pasa a un modelo existente y borra el modelo", async () => {
    const { sandero, stepway, expedientes } = await preparar();
    const msg = await eliminarCatalogo(db, { tipo: "modelo", id: stepway.id_modelo, reasignar_a: sandero.id_modelo });
    expect(msg).toMatch(/2 expedientes/);
    const filas = await db.select().from(expedientes);
    expect(filas.every((f) => f.idModelo === sandero.id_modelo)).toBe(true);
    expect((await leerCatalogos(db)).modelos.some((m) => m.id_modelo === stepway.id_modelo)).toBe(false);
  });

  it("los pasa a un modelo nuevo", async () => {
    const { marca, stepway, expedientes } = await preparar();
    await eliminarCatalogo(db, { tipo: "modelo", id: stepway.id_modelo, crear_modelo: { marca_id: marca.id_marca, nombre: "Sandero 2" } });
    const nuevo = (await leerCatalogos(db)).modelos.find((m) => m.nombre_modelo === "Sandero 2");
    expect(nuevo).toBeDefined();
    expect((await db.select().from(expedientes)).every((f) => f.idModelo === nuevo!.id_modelo)).toBe(true);
  });

  it("o los deja sin modelo", async () => {
    const { stepway, expedientes } = await preparar();
    await eliminarCatalogo(db, { tipo: "modelo", id: stepway.id_modelo, sin_modelo: true });
    expect((await db.select().from(expedientes)).every((f) => f.idModelo === null)).toBe(true);
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
