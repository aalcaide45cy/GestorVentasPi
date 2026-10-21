import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { estadoVehiculo, marcas, tipoDeVenta } from "@/db/schema";
import { reiniciarBd } from "../../../tests/ayudas";
import { PALETA_POR_DEFECTO } from "@/lib/paletas-colores";
import { aplicarPaleta, aplicarPaletaPorDefecto, coloresActuales, eliminarPaleta, guardarPaleta, leerPaleta, listarPaletas, renombrarPaleta } from "./paletas";

beforeEach(reiniciarBd);

const tipo = async (nombre: string) => (await db.select().from(tipoDeVenta)).find((t) => t.nombreTipoVenta === nombre)!;
const estado = async (nombre: string) => (await db.select().from(estadoVehiculo)).find((t) => t.nombreEstadoVehiculo === nombre)!;

/** Parte de los pagos y estados que siembra la aplicación (Contado, Crédito, Preference; Nuevo, Demo…) y les pone otros colores. */
async function escenario() {
  await db.update(tipoDeVenta).set({ color: "#22c55e" }).where(eq(tipoDeVenta.nombreTipoVenta, "Contado"));
  await db.update(tipoDeVenta).set({ color: "#3b82f6" }).where(eq(tipoDeVenta.nombreTipoVenta, "Crédito"));
  await db.update(tipoDeVenta).set({ color: "#a855f7" }).where(eq(tipoDeVenta.nombreTipoVenta, "Preference"));
  const [dacia] = await db.insert(marcas).values({ nombre: "Dacia", color: "#111111", punto: "●", puntoColor: "#222222" }).returning();
  await db.insert(marcas).values({ nombre: "Renault" });
  await db.update(estadoVehiculo).set({ color: "#abcdef", prevalece: "estado" }).where(eq(estadoVehiculo.nombreEstadoVehiculo, "Nuevo"));
  return { dacia };
}

describe("paletas de colores", () => {
  it("lee los colores actuales (de las marcas y estados, solo lo que tiene color) y los vuelve a aplicar tras cambiarlos", async () => {
    const e = await escenario();
    const actuales = await coloresActuales(db);
    expect(actuales.tiposVenta).toEqual([{ nombre: "Contado", color: "#22c55e" }, { nombre: "Crédito", color: "#3b82f6" }, { nombre: "Preference", color: "#a855f7" }]);
    expect(actuales.marcas).toEqual([{ nombre: "Dacia", color: "#111111", punto: "●", puntoColor: "#222222" }]);
    expect(actuales.estados).toHaveLength(1);
    expect(actuales.estados[0]).toMatchObject({ nombre: "Nuevo", color: "#abcdef", prevalece: "estado" });

    await db.update(tipoDeVenta).set({ color: "#000000" }).where(eq(tipoDeVenta.nombreTipoVenta, "Contado"));
    await db.update(marcas).set({ color: null }).where(eq(marcas.idMarca, e.dacia.idMarca));
    const r = await aplicarPaleta(db, actuales);
    expect(r).toMatchObject({ tiposVenta: 3, marcas: 1, estados: 1, sinCoincidencia: [] });
    expect((await tipo("Contado")).color).toBe("#22c55e");
    expect((await db.select().from(marcas).where(eq(marcas.idMarca, e.dacia.idMarca)))[0].color).toBe("#111111");
  });

  it("busca por nombre sin acentos ni mayúsculas, avisa de lo que no existe y no toca lo que no nombra", async () => {
    const e = await escenario();
    const r = await aplicarPaleta(db, { tiposVenta: [{ nombre: "CREDITO", color: "#e69d00" }, { nombre: "Renting", color: "#123456" }], marcas: [], estados: [] });
    expect(r).toMatchObject({ tiposVenta: 1, sinCoincidencia: ["Pago «Renting»"] });
    expect((await tipo("Crédito")).color).toBe("#e69d00");
    expect((await tipo("Contado")).color).toBe("#22c55e");
    expect((await db.select().from(marcas).where(eq(marcas.idMarca, e.dacia.idMarca)))[0].color).toBe("#111111");
  });

  it("la paleta por defecto deja los pagos en rojo, ámbar y azul y quita el color de marcas y estados", async () => {
    const e = await escenario();
    await aplicarPaletaPorDefecto(db);
    expect([(await tipo("Contado")).color, (await tipo("Crédito")).color, (await tipo("Preference")).color]).toEqual(["#ff0000", "#e69d00", "#3b82f6"]);
    expect((await db.select().from(marcas).where(eq(marcas.idMarca, e.dacia.idMarca)))[0]).toMatchObject({ color: null, punto: null, puntoColor: null });
    expect(await estado("Nuevo")).toMatchObject({ color: null, prevalece: "marca" });
  });

  it("guarda, lista, renombra y borra paletas, y no deja repetir el nombre", async () => {
    await escenario();
    const datos = await coloresActuales(db);
    const p = await guardarPaleta(db, { nombre: "Mía", descripcion: "x", datos });
    await expect(guardarPaleta(db, { nombre: "Mía", datos })).rejects.toMatchObject({ status: 409 });
    expect((await guardarPaleta(db, { nombre: "Mía", datos, sustituir: true })).id).toBe(p.id);
    expect((await listarPaletas(db))[0]).toMatchObject({ nombre: "Mía", elementos: 5 });
    await renombrarPaleta(db, p.id, "Otra");
    expect((await leerPaleta(db, p.id))?.meta.nombre).toBe("Otra");
    await eliminarPaleta(db, p.id);
    expect(await listarPaletas(db)).toEqual([]);
    await expect(eliminarPaleta(db, p.id)).rejects.toMatchObject({ status: 404 });
  });

  it("la base recién sembrada ya trae los colores por defecto en los pagos", async () => {
    expect((await coloresActuales(db)).tiposVenta).toEqual(PALETA_POR_DEFECTO.tiposVenta);
  });
});
