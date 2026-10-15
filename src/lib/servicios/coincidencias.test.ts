import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { clientes } from "@/db/schema";
import { reiniciarBd } from "../../../tests/ayudas";
import { buscarCoincidencias } from "./clientes";

beforeEach(reiniciarBd);

describe("coincidencias de cliente para un pedido", () => {
  it("encuentra por DNI (sin importar espacios o guiones) y por palabras del nombre, y no mezcla eliminados", async () => {
    await db.insert(clientes).values([
      { clienteId: "a", dni: "53042524Q", nombre: "ALFONSO ALCAIDE CORNEJO" },
      { clienteId: "b", dni: "11111111H", nombre: "Alfonso Pérez" },
      { clienteId: "c", dni: "22222222J", nombre: "María Alcaide" },
      { clienteId: "d", dni: "53042524Q", nombre: "Borrado", eliminadoEn: new Date() },
    ]);
    const porDni = await buscarCoincidencias(db, { dni: "53.042.524-q", nombre: null });
    expect(porDni).toHaveLength(1);
    expect(porDni[0]).toMatchObject({ nombre: "ALFONSO ALCAIDE CORNEJO", porDni: true });

    const porNombre = await buscarCoincidencias(db, { nombre: "Alcaide Alfonso" });
    expect(porNombre.map((c) => c.nombre)).toEqual(["ALFONSO ALCAIDE CORNEJO"]);

    const mezcla = await buscarCoincidencias(db, { dni: "53042524Q", nombre: "alfonso" });
    expect(mezcla.map((c) => c.porDni)).toEqual([true, false]);
    expect(mezcla.map((c) => c.nombre)).toEqual(["ALFONSO ALCAIDE CORNEJO", "Alfonso Pérez"]);

    expect(await buscarCoincidencias(db, { dni: "", nombre: "" })).toEqual([]);
    expect(await buscarCoincidencias(db, { nombre: "Nadie Existe" })).toEqual([]);
  });
});
