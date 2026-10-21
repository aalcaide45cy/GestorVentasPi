import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { clientes } from "@/db/schema";
import { reiniciarBd } from "../../../tests/ayudas";
import { crearCliente, editarClientesEnMasa, esquemaCliente, esquemaEdicionMasivaClientes } from "./clientes";

beforeEach(reiniciarBd);

const leer = async (id: number) => (await db.select().from(clientes).where(eq(clientes.id, id)))[0];

describe("edición en masa de clientes", () => {
  it("solo cambia los campos rellenados y añade o sustituye los comentarios", async () => {
    const a = await crearCliente(db, esquemaCliente.parse({ nombre: "Ana", poblacion: "Getafe", comentarios: "VIP" }), null);
    const b = await crearCliente(db, esquemaCliente.parse({ nombre: "Beto", poblacion: "Leganés" }), null);
    const fuera = await crearCliente(db, esquemaCliente.parse({ nombre: "Fuera", poblacion: "Móstoles" }), null);

    const n = await editarClientesEnMasa(db, esquemaEdicionMasivaClientes.parse({ ids: [a.id, b.id], codigo_postal: "28001", comentarios: "Llamar en mayo", comentarios_modo: "anadir" }));
    expect(n).toBe(2);
    expect(await leer(a.id)).toMatchObject({ poblacion: "Getafe", codigoPostal: "28001", comentarios: "VIP\nLlamar en mayo" });
    expect(await leer(b.id)).toMatchObject({ poblacion: "Leganés", codigoPostal: "28001", comentarios: "Llamar en mayo" });
    expect(await leer(fuera.id)).toMatchObject({ codigoPostal: null });

    await editarClientesEnMasa(db, esquemaEdicionMasivaClientes.parse({ ids: [a.id], comentarios: "Nuevo", comentarios_modo: "reemplazar" }));
    expect((await leer(a.id)).comentarios).toBe("Nuevo");
  });

  it("rechaza una petición sin ningún cambio y permite quitar la tienda", () => {
    expect(esquemaEdicionMasivaClientes.safeParse({ ids: [1] }).success).toBe(false);
    expect(esquemaEdicionMasivaClientes.safeParse({ ids: [1], tienda_id: null }).success).toBe(true);
  });
});
