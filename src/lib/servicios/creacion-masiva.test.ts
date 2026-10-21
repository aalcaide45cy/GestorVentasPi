import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { clientes, expedientes, marcas, modelos, tipoDeVenta } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { crearExpedientesDePedidos, type ItemCreacion } from "./creacion-masiva";

beforeEach(reiniciarBd);

async function catalogo() {
  const [marca] = await db.insert(marcas).values({ nombre: "Dacia", activo: true }).returning();
  const [bigster] = await db.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: "Bigster" }).returning();
  const [credito] = await db.insert(tipoDeVenta).values({ nombreTipoVenta: "Crédito", categoria: "CREDITO" }).returning();
  return { idModelo: bigster.idModelo, idTipo: credito.idTipoDeVenta };
}

const item = (idItem: string, cliente: string, dni: string | null, idModelo: number | null, idTipo: number | null, extra: Partial<ItemCreacion["datos"]> = {}): ItemCreacion => ({
  idItem,
  nombre: `${idItem}.pdf`,
  adjuntos: [],
  datos: { vin: null, matricula: null, dni, cliente, telefono: null, email: null, domicilio: null, poblacion: null, codigoPostal: null, fechaExpediente: null, fechaEntrega: null, idModelo, idTipoDeVenta: idTipo, tipoPedido: "nuevo", avisos: [], ...extra },
});

describe("crear expedientes de varios pedidos a la vez (en el servidor)", () => {
  it("crea los pedidos claros, deja con su motivo los que tienen dudas y no duplica copias del mismo pedido sin fecha", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const { idModelo, idTipo } = await catalogo();
    const r = await crearExpedientesDePedidos(db, admin, {
      vendedorId: admin.idUsuario,
      items: [
        item("a", "Ana Ruiz Gil", "11111111H", idModelo, idTipo, { fechaExpediente: "2026-04-21" }),
        // Tres copias del mismo pedido (el OCR no leyó el número ni la fecha): solo una se crea
        item("n1", "Natalia Martinez Muñoz", "50877768C", idModelo, idTipo),
        item("n2", "Natalia Martinez Muñoz", "50877768C", idModelo, idTipo),
        item("n3", "Natalia Martinez Muñoz", "50877768C", idModelo, idTipo),
        // Sin modelo en los catálogos y sin forma de pago
        item("m", "Luis Gil", "22222222J", null, idTipo),
        item("p", "Eva Mora", "33333333P", idModelo, null),
      ],
    });
    expect(r.creados.map((c) => c.idItem)).toEqual(["a", "n1"]);
    expect(r.omitidos.map((o) => [o.idItem, o.motivo.slice(0, 22)])).toEqual([
      ["n2", "ya existe el expedient"],
      ["n3", "ya existe el expedient"],
      ["m", "su marca o modelo no e"],
      ["p", "no se ha reconocido la"],
    ]);
    expect(await db.select().from(expedientes)).toHaveLength(2);
    expect(await db.select().from(clientes)).toHaveLength(2);
    expect(r.detalle[0]).toBe("2 expedientes creados");
  });

  it("si el cliente ya existe por DNI se le asocia, y si solo coincide el nombre se deja para revisar", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const { idModelo, idTipo } = await catalogo();
    await db.insert(clientes).values({ clienteId: "c1", nombre: "Pedro Gil Mora", dni: "44444444A" });
    await db.insert(clientes).values({ clienteId: "c2", nombre: "Marta Sanz Lopez", dni: "55555555B" });
    const r = await crearExpedientesDePedidos(db, admin, {
      vendedorId: admin.idUsuario,
      items: [item("mismo-dni", "Pedro Gil Mora", "44444444A", idModelo, idTipo, { fechaExpediente: "2026-05-02" }), item("otro-dni", "Marta Sanz Lopez", "99999999R", idModelo, idTipo, { fechaExpediente: "2026-05-03" })],
    });
    expect(r.creados.map((c) => c.idItem)).toEqual(["mismo-dni"]);
    expect(r.omitidos).toEqual([{ idItem: "otro-dni", nombre: "Marta Sanz Lopez", motivo: "hay dudas con el cliente (varios parecidos o sin el mismo DNI)" }]);
    expect(await db.select().from(clientes)).toHaveLength(2); // no se ha creado ningún cliente nuevo
  });
});
