import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { clientes, expedientes, marcas, modelos } from "@/db/schema";
import { parsearPedido } from "@/lib/documentos/pedido";
import { reiniciarBd } from "../../../tests/ayudas";
import { aprenderModelo, buscarExpedientesSimilares } from "./documentos";
import { aliasModelos } from "@/db/schema";

beforeEach(reiniciarBd);

describe("modelos enseñados", () => {
  it("guarda la corrección y la aplica en la lectura siguiente", async () => {
    const [marca] = await db.insert(marcas).values({ nombre: "Renault" }).returning();
    const [modelo] = await db.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: "Megane E-Tech" }).returning();
    const texto = "RENAULT NUEVO MEGANE EV60 Techno  35.000,00 €";
    const catalogo = { modelos: [{ id: modelo.idModelo, nombre: "Megane E-Tech", marca: "Renault" }], tiposVenta: [] };
    const pedido = ["CLIENTE  ESTABLECIMIENTO DE LA RED RENAULT", "Sr. Juan Perez", "RESUMEN", `Modelo:  ${texto}`].join("\n");
    expect(parsearPedido(pedido, catalogo).idModelo).toBeNull();

    expect((await aprenderModelo(db, { texto, id_modelo: modelo.idModelo })).alias).toBe("MEGANE EV60");
    const aprendidos = (await db.select().from(aliasModelos)).map((a) => ({ alias: a.alias, id: a.idModelo }));
    expect(parsearPedido(pedido, { ...catalogo, aliasModelos: aprendidos }).idModelo).toBe(modelo.idModelo);
  });
});

describe("pedidos que ya existen", () => {
  it("avisa por bastidor, matrícula o cliente+fecha+modelo, y no confunde expedientes distintos", async () => {
    const [marca] = await db.insert(marcas).values({ nombre: "Dacia" }).returning();
    const [modelo] = await db.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: "Sandero" }).returning();
    const [cli] = await db.insert(clientes).values({ clienteId: "c1", dni: "02251153M", nombre: "Luisa" }).returning();
    const [exp] = await db.insert(expedientes).values({ idCliente: cli.id, idModelo: modelo.idModelo, vin: "UU1ABCDEFGH123456", matricula: "1234 BCD", fechaExpediente: "2026-09-28" }).returning();
    const base = parsearPedido("", { modelos: [], tiposVenta: [] });

    const porVin = await buscarExpedientesSimilares(db, { ...base, vin: "uu1abcdefgh123456" });
    expect(porVin.map((x) => [x.idExpediente, x.motivo])).toEqual([[exp.idExpediente, "mismo bastidor"]]);
    expect((await buscarExpedientesSimilares(db, { ...base, matricula: "1234-BCD" }))[0].motivo).toBe("misma matrícula");
    const porCliente = await buscarExpedientesSimilares(db, { ...base, dni: "02251153m", fechaExpediente: "2026-09-28", idModelo: modelo.idModelo });
    expect(porCliente[0].motivo).toBe("mismo cliente, fecha y modelo");
    expect(await buscarExpedientesSimilares(db, { ...base, dni: "02251153M", fechaExpediente: "2026-10-01", idModelo: modelo.idModelo })).toEqual([]);
    // Mismo cliente y fecha pero otro modelo: es otra compra, no un duplicado
    const [otroModelo] = await db.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: "Duster" }).returning();
    expect(await buscarExpedientesSimilares(db, { ...base, dni: "02251153M", fechaExpediente: "2026-09-28", idModelo: otroModelo.idModelo })).toEqual([]);
    expect(await buscarExpedientesSimilares(db, { ...base, cliente: "Luisa", fechaExpediente: "2026-09-28", idModelo: otroModelo.idModelo })).toEqual([]);
    // Sin DNI (pedido de coche nuevo mal leído): el nombre del cliente y la fecha bastan
    expect((await buscarExpedientesSimilares(db, { ...base, cliente: "LUISA", fechaExpediente: "2026-09-28", idModelo: modelo.idModelo }))[0].idExpediente).toBe(exp.idExpediente);
    expect(await buscarExpedientesSimilares(db, { ...base, cliente: "OTRA PERSONA", fechaExpediente: "2026-09-28", idModelo: modelo.idModelo })).toEqual([]);
    expect(await buscarExpedientesSimilares(db, base)).toEqual([]);
  });
});
