import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { marcas, modelos, plantillasTarifasVn } from "@/db/schema";
import { NOMBRE_PLANTILLA_GENERICA } from "@/lib/plantillas-tarifas/generica";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { exportarSeccion, importarSeccion } from "./intercambio";
import { actualizarPlantilla, borrarPlantilla, crearCatalogoFaltante, crearPlantilla, duplicarPlantilla, leerPlantilla, listarPlantillas } from "./plantillas-tarifas";

beforeEach(reiniciarBd);

const datos = (marca = "Seat", modelo = "Ibiza", cumplida = 15050) => ({
  marcas: [{ nombre: marca, sistemaComisiones: true, accesoRapido: false }],
  tarifas: [
    { marca, modelo, tasaCumplida: true, importes: { "-1": 10000, "0": cumplida, "1": 20000 }, activo: true, orden: 0 },
    { marca, modelo, tasaCumplida: false, importes: { "0": 5000 }, activo: true, orden: 0 },
  ],
});

describe("plantillas de tarifas VN", () => {
  it("viene sembrada la genérica de Renault y Dacia (con decimales en céntimos), y no se puede tocar", async () => {
    const lista = await listarPlantillas(db);
    const g = lista.find((p) => p.nombre === NOMBRE_PLANTILLA_GENERICA)!;
    expect(g).toMatchObject({ sistema: true, marcas: ["Renault", "Dacia"] });
    expect(g.modelos).toBe(20);
    expect(lista[0].sistema).toBe(true); // las incluidas, primero
    await expect(actualizarPlantilla(db, g.id, { nombre: "Otra", datos: datos() })).rejects.toMatchObject({ status: 403 });
    await expect(borrarPlantilla(db, g.id)).rejects.toMatchObject({ status: 403 });
    // La semilla es idempotente: sembrar de nuevo no duplica
    const { sembrar } = await import("@/db/semilla");
    await sembrar(db);
    expect((await db.select().from(plantillasTarifasVn)).length).toBe(1);
  });

  it("crear, leer, renombrar, duplicar y borrar; nombres repetidos se rechazan sin distinguir mayúsculas", async () => {
    const p = await crearPlantilla(db, { nombre: "Mi plantilla", descripcion: "  prueba  ", datos: datos() });
    expect(p).toMatchObject({ nombre: "Mi plantilla", descripcion: "prueba", sistema: false, marcas: ["Seat"], modelos: 1, tarifas: 2 });
    await expect(crearPlantilla(db, { nombre: "MI PLANTILLA", datos: datos() })).rejects.toMatchObject({ status: 409 });
    await expect(crearPlantilla(db, { nombre: "Vacía", datos: { marcas: [], tarifas: [] } })).rejects.toMatchObject({ status: 400 });
    await expect(crearPlantilla(db, { nombre: "Mala", datos: { marcas: [], tarifas: [{ marca: "A", modelo: "B", tasaCumplida: true, importes: { "0": 1.5 }, activo: true, orden: 0 }] } })).rejects.toThrow();

    const leida = await leerPlantilla(db, p.id);
    expect(leida.datos.tarifas[0].importes["0"]).toBe(15050);

    const act = await actualizarPlantilla(db, p.id, { nombre: "Renombrada", datos: datos("Seat", "Ibiza", 17525) });
    expect(act.nombre).toBe("Renombrada");
    expect((await leerPlantilla(db, p.id)).datos.tarifas[0].importes["0"]).toBe(17525);

    const copia = await duplicarPlantilla(db, p.id);
    expect(copia.nombre).toBe("Copia de Renombrada");
    expect((await duplicarPlantilla(db, p.id)).nombre).toBe("Copia 2 de Renombrada");
    const copiaDeSistema = await duplicarPlantilla(db, (await listarPlantillas(db)).find((x) => x.sistema)!.id);
    expect(copiaDeSistema).toMatchObject({ sistema: false, modelos: 20 });

    await borrarPlantilla(db, p.id);
    await expect(leerPlantilla(db, p.id)).rejects.toMatchObject({ status: 404 });
  });

  it("crearCatalogoFaltante crea marcas y modelos por nombre una sola vez, sin duplicar y activando «Sist. Comisiones»", async () => {
    const [existente] = await db.insert(marcas).values({ nombre: "Dacia", activo: true, sistemaComisiones: false }).returning();
    await db.insert(modelos).values({ marcaId: existente.idMarca, nombreModelo: "Sandero" });

    const r = await crearCatalogoFaltante(db, { marcas: [{ nombre: "dacía", sistemaComisiones: false, accesoRapido: false, modelos: ["SANDERO", "Jogger"] }, { nombre: "Seat", sistemaComisiones: true, accesoRapido: true, modelos: ["Ibiza", "Leon", "ibiza"] }] });
    expect(r).toMatchObject({ marcasCreadas: 1, marcasActivadas: 1, modelosCreados: 3 });

    const marcasBd = await db.select().from(marcas).where(isNull(marcas.eliminadoEn));
    expect(marcasBd.filter((m) => m.nombre.toLowerCase().startsWith("dacia")).length).toBe(1);
    expect(marcasBd.find((m) => m.nombre === "Dacia")!.sistemaComisiones).toBe(true);
    const seat = marcasBd.find((m) => m.nombre === "Seat")!;
    expect(seat).toMatchObject({ sistemaComisiones: true, accesoRapido: true });
    const modelosSeat = await db.select().from(modelos).where(and(eq(modelos.marcaId, seat.idMarca), isNull(modelos.eliminadoEn)));
    expect(modelosSeat.map((m) => m.nombreModelo).sort()).toEqual(["Ibiza", "Leon"]);

    // Repetirlo no crea nada más
    expect(await crearCatalogoFaltante(db, { marcas: [{ nombre: "Seat", modelos: ["Ibiza", "Leon"] }] })).toMatchObject({ marcasCreadas: 0, marcasActivadas: 0, modelosCreados: 0 });
    await expect(crearCatalogoFaltante(db, { marcas: [] })).rejects.toThrow();
  });

  it("se exportan e importan en la sección «plantillas_tarifas»: nuevas, actualizar y la de sistema no se modifica", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const propia = await crearPlantilla(db, { nombre: "Propia", datos: datos() });
    const paquete = await exportarSeccion(db, "plantillas_tarifas");
    expect(paquete.registros).toBe(2);
    expect(JSON.stringify(paquete)).toContain("Propia");

    await borrarPlantilla(db, propia.id);
    // Importar en otra instalación (sin «Propia»): se crea; la de sistema ya existe y se omite
    const previa = await importarSeccion(db, admin.idUsuario, paquete, "anadir", false);
    expect(previa).toMatchObject({ aplicado: false, nuevos: 1, omitidos: 1 });
    expect((await listarPlantillas(db)).length).toBe(1);
    const hecho = await importarSeccion(db, admin.idUsuario, paquete, "anadir", true);
    expect(hecho).toMatchObject({ aplicado: true, nuevos: 1 });
    expect((await listarPlantillas(db)).map((p) => p.nombre).sort()).toEqual([NOMBRE_PLANTILLA_GENERICA, "Propia"].sort());

    // Actualizar: cambia una tarifa en el archivo
    const modificado = JSON.parse(JSON.stringify(paquete)) as typeof paquete;
    (modificado.datos as { nombre: string; datos: ReturnType<typeof datos> }[]).find((d) => d.nombre === "Propia")!.datos.tarifas[0].importes["0"] = 99999;
    expect(await importarSeccion(db, admin.idUsuario, modificado, "anadir", true)).toMatchObject({ nuevos: 0, actualizados: 0 });
    expect(await importarSeccion(db, admin.idUsuario, modificado, "actualizar", true)).toMatchObject({ actualizados: 1 });
    const id = (await listarPlantillas(db)).find((p) => p.nombre === "Propia")!.id;
    expect((await leerPlantilla(db, id)).datos.tarifas[0].importes["0"]).toBe(99999);
  });
});
