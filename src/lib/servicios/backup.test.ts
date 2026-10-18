import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { adjuntos, clientes, expedientes, tiendas, usuarios } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { esquemaCopia, exportarCopia, restaurarCopia, VERSION_COPIA } from "./backup";
import { leerCatalogos } from "./catalogos";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";
import { listarExpedientes } from "./expedientes-lectura";
import { analizarBbdd, esquemaLimpieza, limpiarBbdd } from "./mantenimiento";

beforeEach(reiniciarBd);

describe("copia de seguridad JSON", () => {
  it("exporta y restaura: los datos vuelven tal cual tras vaciar la base", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const [tienda] = await db.insert(tiendas).values({ nombre: "Madrid", ciudad: "Madrid" }).returning();
    await crearExpediente(
      db,
      admin,
      esquemaCrearExpediente.parse({
        cliente: { nombre: "Laura", dni: "1A", emails: [{ email: "l@e.com" }], telefonos: [{ telefono: "600" }] },
        expediente: { id_tienda: tienda.idTienda, matricula: "1111AAA", fecha_expediente: "2026-02-02" },
      }),
    );

    const copia = JSON.parse(JSON.stringify(await exportarCopia(db))); // pasa por JSON como en la descarga
    expect(copia.version).toBe(VERSION_COPIA);
    expect(Object.keys(copia.data)).not.toContain("sesiones");

    await db.delete(expedientes);
    await db.delete(clientes);
    expect(await listarExpedientes(db)).toHaveLength(0);

    await restaurarCopia(db, admin, esquemaCopia.parse(copia));
    const [e] = await listarExpedientes(db);
    expect(e).toMatchObject({ matricula: "1111AAA", fecha_expediente: "2026-02-02" });
    expect(e.cliente).toMatchObject({ nombre: "Laura", dni: "1A" });
    expect(e.cliente?.emails[0].email).toBe("l@e.com");
    expect((await leerCatalogos(db)).tiendas.map((t) => t.nombre)).toContain("Madrid");
  });

  it("la secuencia queda por delante del máximo: se pueden crear filas nuevas tras restaurar", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: {} }));
    const copia = JSON.parse(JSON.stringify(await exportarCopia(db)));
    await restaurarCopia(db, admin, esquemaCopia.parse(copia));
    const nuevo = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: {} }));
    expect(nuevo.id_expediente).toBeGreaterThan(1);
  });

  it("conserva al administrador que restaura aunque no esté en la copia", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const copia = JSON.parse(JSON.stringify(await exportarCopia(db)));
    copia.data.usuarios = []; // copia sin usuarios
    await restaurarCopia(db, admin, esquemaCopia.parse(copia));
    const filas = await db.select().from(usuarios).where(eq(usuarios.loginEmail, admin.loginEmail));
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ rol: "administrador", bloqueado: false });
  });

  it("rechaza copias de la aplicación antigua (1.0) y tablas desconocidas", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await expect(restaurarCopia(db, admin, { version: "1.0", data: {} })).rejects.toBeInstanceOf(HttpError);
    await expect(restaurarCopia(db, admin, { version: VERSION_COPIA, data: { tablaInventada: [] } })).rejects.toBeInstanceOf(HttpError);
  });

  it("si la restauración falla a medias no se pierde nada (transacción)", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await db.insert(tiendas).values({ nombre: "Original" });
    const copia = JSON.parse(JSON.stringify(await exportarCopia(db)));
    copia.data.modelos = [{ idModelo: 1, marcaId: 99999, nombreModelo: "Huérfano" }]; // viola la clave foránea
    await expect(restaurarCopia(db, admin, esquemaCopia.parse(copia))).rejects.toThrow();
    expect((await leerCatalogos(db)).tiendas.map((t) => t.nombre)).toContain("Original");
  });
});

describe("mantenimiento de la base de datos", () => {
  it("con claves foráneas reales no hay huérfanos y la limpieza no borra nada", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ cliente: { nombre: "Laura", emails: [{ email: "l@e.com" }] }, expediente: {} }));
    const analisis = await analizarBbdd(db);
    expect(analisis.stats.totalAnomalies).toBe(0);
    expect(await limpiarBbdd(db, esquemaLimpieza.parse({}))).toBe(0);
    expect(await listarExpedientes(db)).toHaveLength(1);
  });

  it("avisa de lo que hay que revisar a mano (sin tocarlo) y limpia solo los adjuntos sueltos de más de dos días", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ cliente: { nombre: "Ana", dni: "12345678Z" }, expediente: { vin: "VF1ABC", matricula: "1234BCD" } }));
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ cliente: { nombre: "Ana Dos" }, expediente: { vin: "vf1 abc", matricula: "9999ZZZ" } }));
    await db.insert(clientes).values([{ clienteId: "solo", nombre: "Sin Compras" }, { clienteId: "d1", nombre: "Dup Uno", dni: "11111111H" }, { clienteId: "d2", nombre: "Dup Dos", dni: "11111111h" }]);
    const viejo = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    const [suelto] = await db.insert(adjuntos).values({ ambito: "pendiente", tipo: "pedido", nombre: "viejo.pdf", mime: "application/pdf", tamano: 1, creadoEn: viejo }).returning();
    const [reciente] = await db.insert(adjuntos).values({ ambito: "pendiente", tipo: "pedido", nombre: "reciente.pdf", mime: "application/pdf", tamano: 1 }).returning();

    const a = await analizarBbdd(db);
    const cat = (id: string) => a.categorias.find((c) => c.id === id)!;
    expect(cat("exp_bastidor_repetido").cantidad).toBe(2);
    expect(cat("cli_dni_repetido").cantidad).toBe(2);
    expect(cat("cli_sin_expedientes").filas.map((f) => f.texto).join()).toMatch(/Sin Compras/);
    expect(cat("exp_sin_modelo").cantidad).toBe(2);
    // Lo limpiable es solo el adjunto viejo; lo «a revisar» no cuenta como limpieza
    expect(a.stats.totalAnomalies).toBe(1);
    expect(a.stats.totalARevisar).toBeGreaterThan(0);

    expect(await limpiarBbdd(db, esquemaLimpieza.parse({ cleanAdjuntos: [suelto.id, reciente.id] }))).toBe(1);
    expect((await db.select().from(adjuntos)).map((x) => x.nombre)).toEqual(["reciente.pdf"]);
    expect(await listarExpedientes(db)).toHaveLength(2);
  });
});
