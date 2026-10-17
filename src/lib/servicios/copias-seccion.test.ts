import { isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { clientes, copiasSeccion } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { MAX_COPIAS_AUTOMATICAS, borrarCopiaInterna, contarCopiasInternas, crearCopiaInterna, leerCopiaInterna, listarCopiasInternas, restaurarCopiaInterna } from "./copias-seccion";
import { importarSeccion } from "./intercambio";

beforeEach(reiniciarBd);

const paquete = (datos: unknown[]) => ({ app: "GestorVentasPi", formato: "gv-seccion-1", seccion: "clientes", datos });
const activos = async () => (await db.select().from(clientes).where(isNull(clientes.eliminadoEn))).map((c) => c.nombre);

describe("copias internas por sección", () => {
  it("guarda una copia interna con su contenido, la lista con filtros y buscador y la borra", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await importarSeccion(db, admin.idUsuario, paquete([{ dni: "11111111H", nombre: "Ana" }, { dni: "22222222J", nombre: "Beto" }]), "anadir", true);
    const c1 = await crearCopiaInterna(db, "clientes", admin.idUsuario, "Antes de la feria");
    expect(c1).toMatchObject({ seccion: "clientes", registros: 2, origen: "manual", nota: "Antes de la feria" });
    expect(c1.tamano).toBeGreaterThan(50);
    await crearCopiaInterna(db, "tiendas", admin.idUsuario);
    await crearCopiaInterna(db, "clientes", null, "Tras importar", "automatica");

    expect((await listarCopiasInternas(db)).total).toBe(3);
    expect((await listarCopiasInternas(db, { seccion: "clientes" })).total).toBe(2);
    expect((await listarCopiasInternas(db, { seccion: "clientes", origen: "automatica" })).copias.map((c) => c.nota)).toEqual(["Tras importar"]);
    expect((await listarCopiasInternas(db, { texto: "feria" })).copias.map((c) => c.id)).toEqual([c1.id]);
    expect((await listarCopiasInternas(db, { texto: "%" })).total).toBe(0); // los comodines se tratan como texto
    expect(await contarCopiasInternas(db)).toEqual({ clientes: 2, tiendas: 1 });
    expect((await leerCopiaInterna(db, c1.id)).datos).toMatchObject({ seccion: "clientes", registros: 2 });

    await borrarCopiaInterna(db, c1.id);
    await expect(leerCopiaInterna(db, c1.id)).rejects.toMatchObject({ status: 404 });
  });

  it("restaurar: la vista previa no cambia nada y «sustituir» deja la sección como estaba al guardar la copia", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await importarSeccion(db, admin.idUsuario, paquete([{ dni: "11111111H", nombre: "Ana" }, { dni: "22222222J", nombre: "Beto" }]), "anadir", true);
    const copia = await crearCopiaInterna(db, "clientes", admin.idUsuario);
    // Después de la copia: se borra Beto (sustituyendo) y se añade Carla
    await importarSeccion(db, admin.idUsuario, paquete([{ dni: "11111111H", nombre: "Ana" }, { dni: "33333333P", nombre: "Carla" }]), "sustituir", true);
    expect((await activos()).sort()).toEqual(["Ana", "Carla"]);

    const previa = await restaurarCopiaInterna(db, admin.idUsuario, copia.id, "sustituir", false);
    expect(previa.informe).toMatchObject({ aplicado: false, nuevos: 1, eliminados: 1, sinCambios: 1 }); // Beto se vuelve a crear, Carla se quita y Ana sigue igual
    expect((await activos()).sort()).toEqual(["Ana", "Carla"]);

    const hecho = await restaurarCopiaInterna(db, admin.idUsuario, copia.id, "sustituir", true);
    expect(hecho.informe.aplicado).toBe(true);
    expect((await activos()).sort()).toEqual(["Ana", "Beto"]);
  });

  it("solo se conservan las últimas copias automáticas de cada sección; las manuales no se borran solas", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await crearCopiaInterna(db, "tiendas", admin.idUsuario, "manual");
    for (let i = 0; i < MAX_COPIAS_AUTOMATICAS + 3; i++) await crearCopiaInterna(db, "tiendas", null, null, "automatica");
    const lista = await listarCopiasInternas(db, { seccion: "tiendas" });
    expect(lista.copias.filter((c) => c.origen === "automatica").length).toBe(MAX_COPIAS_AUTOMATICAS);
    expect(lista.copias.filter((c) => c.origen === "manual").length).toBe(1);
    expect((await db.select().from(copiasSeccion)).length).toBe(MAX_COPIAS_AUTOMATICAS + 1);
  });
});
