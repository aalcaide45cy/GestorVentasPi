import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { clientes, commissionFinanceRates, commissionPlans, emailsClientes, expedientes, historialCambios, marcas, tiendas, usuariosTiendas } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { conContextoHistorial, fijarUsuarioHistorial } from "@/lib/historial/contexto";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { actualizarCliente, crearCliente, eliminarClientes, esquemaCliente } from "./clientes";
import { esquemaActualizarExpediente, esquemaCrearExpediente } from "./expedientes";
import { actualizarExpedientes, crearExpediente, eliminarExpedientes } from "./expedientes-escritura";
import { aplicarHistorial, leerHistorial } from "./historial";
import { eliminarPlan, guardarPlan, leerPlan } from "./planes";

beforeEach(reiniciarBd);

/** Ejecuta `fn` como lo haría una petición de ese usuario: con su grupo y su usuario fijados. */
const comoPeticion = <T>(idUsuario: number, accion: string, fn: () => Promise<T>): Promise<T> =>
  conContextoHistorial(accion, async () => {
    fijarUsuarioHistorial(idUsuario);
    return fn();
  });

async function preparar() {
  const vendedor = await crearUsuarioPrueba("vendedor");
  const [tienda] = await db.insert(tiendas).values({ nombre: "Madrid Norte" }).returning();
  await db.insert(usuariosTiendas).values({ idUsuario: vendedor.idUsuario, idTienda: tienda.idTienda });
  return { vendedor };
}

describe("historial de deshacer y rehacer", () => {
  it("deshace y rehace la creación, la edición y el borrado de un expediente", async () => {
    const { vendedor } = await preparar();
    const exp = await comoPeticion(vendedor.idUsuario, "Crear expediente", () =>
      crearExpediente(db, vendedor, esquemaCrearExpediente.parse({ cliente: { nombre: "Ana López", dni: "11111111H" }, expediente: { matricula: "1111AAA" } })),
    );
    const id = exp.id_expediente;
    await comoPeticion(vendedor.idUsuario, "Editar expediente", () => actualizarExpedientes(db, vendedor, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: id, expediente: { matricula: "2222BBB" } })));

    let h = await leerHistorial(db, vendedor.idUsuario);
    expect(h.puedeDeshacer?.accion).toBe("Editar expediente");
    expect(h.puedeRehacer).toBeNull();
    expect(h.pasos.map((p) => p.accion)).toEqual(["Editar expediente", "Crear expediente"]);

    // Deshacer la edición: vuelve la matrícula anterior
    await aplicarHistorial(db, vendedor.idUsuario, "deshacer");
    expect((await db.select().from(expedientes).where(eq(expedientes.idExpediente, id)))[0].matricula).toBe("1111AAA");
    h = await leerHistorial(db, vendedor.idUsuario);
    expect(h.puedeRehacer?.accion).toBe("Editar expediente");

    // Rehacer: vuelve la nueva
    await aplicarHistorial(db, vendedor.idUsuario, "rehacer");
    expect((await db.select().from(expedientes).where(eq(expedientes.idExpediente, id)))[0].matricula).toBe("2222BBB");

    // Deshacer hasta la creación: el expediente y su cliente desaparecen; rehacer los recupera
    await aplicarHistorial(db, vendedor.idUsuario, "deshacer", { grupo: (await leerHistorial(db, vendedor.idUsuario)).pasos[1].grupo });
    expect(await db.select().from(expedientes).where(eq(expedientes.idExpediente, id))).toHaveLength(0);
    expect(await db.select().from(clientes)).toHaveLength(0);
    await aplicarHistorial(db, vendedor.idUsuario, "rehacer", { grupo: (await leerHistorial(db, vendedor.idUsuario)).pasos[0].grupo });
    expect((await db.select().from(expedientes).where(eq(expedientes.idExpediente, id)))[0].matricula).toBe("2222BBB");
    expect(await db.select().from(clientes)).toHaveLength(1);
  });

  it("un cambio nuevo descarta lo que se podía rehacer", async () => {
    const { vendedor } = await preparar();
    const exp = await comoPeticion(vendedor.idUsuario, "Crear expediente", () => crearExpediente(db, vendedor, esquemaCrearExpediente.parse({ cliente: { nombre: "Luis Gil" }, expediente: { matricula: "3333CCC" } })));
    await comoPeticion(vendedor.idUsuario, "Editar expediente", () => actualizarExpedientes(db, vendedor, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: exp.id_expediente, expediente: { matricula: "4444DDD" } })));
    await aplicarHistorial(db, vendedor.idUsuario, "deshacer");
    expect((await leerHistorial(db, vendedor.idUsuario)).puedeRehacer).not.toBeNull();
    await comoPeticion(vendedor.idUsuario, "Editar expediente", () => actualizarExpedientes(db, vendedor, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: exp.id_expediente, expediente: { matricula: "5555EEE" } })));
    expect((await leerHistorial(db, vendedor.idUsuario)).puedeRehacer).toBeNull();
    await expect(aplicarHistorial(db, vendedor.idUsuario, "rehacer")).rejects.toBeInstanceOf(HttpError);
  });

  it("deshace la edición de un cliente con sus correos y el borrado de clientes", async () => {
    const { vendedor } = await preparar();
    const c = await comoPeticion(vendedor.idUsuario, "Crear cliente", () => crearCliente(db, esquemaCliente.parse({ nombre: "Marta Ruiz", dni: "22222222J", emails: [{ email: "marta@a.es" }] }), null));
    await comoPeticion(vendedor.idUsuario, "Editar cliente", () => actualizarCliente(db, c.id, esquemaCliente.parse({ nombre: "Marta R.", dni: "22222222J", emails: [{ email: "otro@a.es" }] })));
    await aplicarHistorial(db, vendedor.idUsuario, "deshacer");
    expect((await db.select().from(clientes))[0].nombre).toBe("Marta Ruiz");
    expect((await db.select().from(emailsClientes)).map((e) => e.email)).toEqual(["marta@a.es"]);
    await comoPeticion(vendedor.idUsuario, "Eliminar clientes", () => eliminarClientes(db, [c.id]));
    expect((await db.select().from(clientes))[0].eliminadoEn).not.toBeNull(); // el borrado es lógico
    await aplicarHistorial(db, vendedor.idUsuario, "deshacer");
    expect((await db.select().from(clientes))[0].eliminadoEn).toBeNull();
    expect((await db.select().from(emailsClientes)).map((e) => e.email)).toEqual(["marta@a.es"]);
  });

  it("no deshace si el registro cambió después por otra vía, salvo que se fuerce", async () => {
    const { vendedor } = await preparar();
    const exp = await comoPeticion(vendedor.idUsuario, "Crear expediente", () => crearExpediente(db, vendedor, esquemaCrearExpediente.parse({ cliente: { nombre: "Eva Mora" }, expediente: { matricula: "6666FFF" } })));
    await comoPeticion(vendedor.idUsuario, "Editar expediente", () => actualizarExpedientes(db, vendedor, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: exp.id_expediente, expediente: { matricula: "7777GGG" } })));
    // Otra vía (sin contexto de historial) cambia el mismo expediente
    await db.update(expedientes).set({ matricula: "9999ZZZ" }).where(eq(expedientes.idExpediente, exp.id_expediente));
    const e = await aplicarHistorial(db, vendedor.idUsuario, "deshacer").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).status).toBe(409);
    expect((await db.select().from(expedientes).where(eq(expedientes.idExpediente, exp.id_expediente)))[0].matricula).toBe("9999ZZZ");
    await aplicarHistorial(db, vendedor.idUsuario, "deshacer", { forzar: true });
    expect((await db.select().from(expedientes).where(eq(expedientes.idExpediente, exp.id_expediente)))[0].matricula).toBe("6666FFF");
  });

  it("cada usuario solo ve y deshace lo suyo, y lo que se hace sin petición no se anota", async () => {
    const { vendedor } = await preparar();
    const otro = await crearUsuarioPrueba("vendedor");
    await db.insert(marcas).values({ nombre: "Sin historial" }); // sin contexto: no se anota
    expect(await db.select().from(historialCambios)).toHaveLength(0);
    const exp = await comoPeticion(vendedor.idUsuario, "Crear expediente", () => crearExpediente(db, vendedor, esquemaCrearExpediente.parse({ cliente: { nombre: "Pepe" }, expediente: { matricula: "1212ABC" } })));
    expect((await leerHistorial(db, otro.idUsuario)).pasos).toHaveLength(0);
    await expect(aplicarHistorial(db, otro.idUsuario, "deshacer")).rejects.toBeInstanceOf(HttpError);
    await comoPeticion(vendedor.idUsuario, "Eliminar expedientes", () => eliminarExpedientes(db, vendedor, [exp.id_expediente]));
    await aplicarHistorial(db, vendedor.idUsuario, "deshacer");
    expect((await db.select().from(expedientes).where(eq(expedientes.idExpediente, exp.id_expediente)))[0].eliminadoEn).toBeNull();
  });

  it("deshace guardar y borrar un plan de comisionamiento entero, con sus tablas hijas", async () => {
    const { vendedor } = await preparar();
    const [marca] = await db.insert(marcas).values({ nombre: "Dacia" }).returning();
    const datos = { nombre: "Octubre 2026", fechaInicio: "2026-10-01", fechaFin: "2026-10-31" };
    const fila = { idMarca: marca.idMarca, tipoFinanciacion: "CREDITO" as const, aplicaA: "VN", importe: 5000 };
    const g = await comoPeticion(vendedor.idUsuario, "Crear plan", () => guardarPlan(db, null, { ...datos, financiacion: [fila] }));
    const id = g.plan.idPlan;
    await comoPeticion(vendedor.idUsuario, "Guardar plan", () => guardarPlan(db, id, { ...datos, financiacion: [{ ...fila, importe: 9000 }, { ...fila, tipoFinanciacion: "PREFERENCE" as const, importe: 12500 }] }));
    expect((await leerPlan(db, id))?.financiacion).toHaveLength(2);
    await aplicarHistorial(db, vendedor.idUsuario, "deshacer");
    expect((await leerPlan(db, id))?.financiacion.map((f) => f.importe)).toEqual([5000]);
    await aplicarHistorial(db, vendedor.idUsuario, "rehacer");
    expect((await leerPlan(db, id))?.financiacion).toHaveLength(2);
    await comoPeticion(vendedor.idUsuario, "Eliminar plan", () => eliminarPlan(db, id));
    expect(await db.select().from(commissionPlans)).toHaveLength(0);
    expect(await db.select().from(commissionFinanceRates)).toHaveLength(0);
    await aplicarHistorial(db, vendedor.idUsuario, "deshacer");
    expect(await db.select().from(commissionPlans)).toHaveLength(1);
    expect((await leerPlan(db, id))?.financiacion.map((f) => f.importe).sort((a, b) => a - b)).toEqual([9000, 12500]);
  });

  it("también anota las escrituras sueltas (sin transacción propia) hechas durante una petición", async () => {
    const { vendedor } = await preparar();
    const [marca] = await comoPeticion(vendedor.idUsuario, "Crear en catálogos", () => db.insert(marcas).values({ nombre: "Renault" }).returning());
    await comoPeticion(vendedor.idUsuario, "Editar catálogos", () => db.update(marcas).set({ nombre: "Renault SA" }).where(eq(marcas.idMarca, marca.idMarca)));
    expect((await leerHistorial(db, vendedor.idUsuario)).pasos.map((p) => p.accion)).toEqual(["Editar catálogos", "Crear en catálogos"]);
    await aplicarHistorial(db, vendedor.idUsuario, "deshacer");
    expect((await db.select().from(marcas).where(eq(marcas.idMarca, marca.idMarca)))[0].nombre).toBe("Renault");
    await aplicarHistorial(db, vendedor.idUsuario, "deshacer");
    expect(await db.select().from(marcas).where(eq(marcas.idMarca, marca.idMarca))).toHaveLength(0);
  });
});
