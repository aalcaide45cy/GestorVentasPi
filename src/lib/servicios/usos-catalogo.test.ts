import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { crearCatalogo } from "./catalogos";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente, eliminarExpedientes } from "./expedientes-escritura";
import { contarUsosCatalogo, expedientesDeCatalogo } from "./usos-catalogo";

beforeEach(reiniciarBd);

describe("qué expedientes usan cada marca y cada modelo", () => {
  it("cuenta los vigentes y los de la Papelera, por modelo y por marca, y lista los expedientes", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const marca = (await crearCatalogo(db, { tipo: "marca", nombre: "Kia" })) as { id_marca: number };
    const ceed = (await crearCatalogo(db, { tipo: "modelo", marca_id: marca.id_marca, nombre_modelo: "Ceed" })) as { id_modelo: number };
    const sportage = (await crearCatalogo(db, { tipo: "modelo", marca_id: marca.id_marca, nombre_modelo: "Sportage" })) as { id_modelo: number };
    const sinUso = (await crearCatalogo(db, { tipo: "modelo", marca_id: marca.id_marca, nombre_modelo: "Niro" })) as { id_modelo: number };
    const e1 = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_modelo: ceed.id_modelo, matricula: "1111AAA" } }));
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_modelo: ceed.id_modelo } }));
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_modelo: sportage.id_modelo } }));

    let usos = await contarUsosCatalogo(db);
    expect(usos.modelos[ceed.id_modelo]).toEqual({ activos: 2, papelera: 0 });
    expect(usos.modelos[sportage.id_modelo]).toEqual({ activos: 1, papelera: 0 });
    expect(usos.modelos[sinUso.id_modelo]).toBeUndefined();
    expect(usos.marcas[marca.id_marca]).toEqual({ activos: 3, papelera: 0 });

    // Uno a la Papelera: sigue contando aparte
    await eliminarExpedientes(db, admin, [e1.id_expediente]);
    usos = await contarUsosCatalogo(db);
    expect(usos.modelos[ceed.id_modelo]).toEqual({ activos: 1, papelera: 1 });
    expect(usos.marcas[marca.id_marca]).toEqual({ activos: 2, papelera: 1 });

    const delModelo = await expedientesDeCatalogo(db, { idModelo: ceed.id_modelo });
    expect(delModelo.total).toBe(2);
    expect(delModelo.filas.map((f) => f.eliminado)).toEqual([false, true]); // los vigentes primero
    expect(delModelo.filas.every((f) => f.modelo === "Ceed" && f.marca === "Kia")).toBe(true);
    const delaMarca = await expedientesDeCatalogo(db, { idMarca: marca.id_marca });
    expect(delaMarca.total).toBe(3);
    expect(new Set(delaMarca.filas.map((f) => f.modelo))).toEqual(new Set(["Ceed", "Sportage"]));
    expect((await expedientesDeCatalogo(db, { idModelo: sinUso.id_modelo })).total).toBe(0);
  });
});
