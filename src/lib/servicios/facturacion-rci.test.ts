import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { estadoVehiculo, expedientes, tipoDeVenta } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { esquemaActualizarExpediente, esquemaCrearExpediente } from "./expedientes";
import { actualizarExpedientes, crearExpediente } from "./expedientes-escritura";

beforeEach(reiniciarBd);

async function tipo(nombre: string, categoria: string, requiere: boolean) {
  const [t] = await db.insert(tipoDeVenta).values({ nombreTipoVenta: nombre, categoria, requiereRciAlMatricular: requiere }).returning();
  return t.idTipoDeVenta;
}
const estadoDe = async (nombre: string) => (await db.select().from(estadoVehiculo).where(eq(estadoVehiculo.nombreEstadoVehiculo, nombre)))[0].idEstadoVehiculo;
const leer = async (id: number) => (await db.select().from(expedientes).where(eq(expedientes.idExpediente, id)))[0];

describe("facturación de un VN", () => {
  it("al crear un VN con matriculación, la facturación es la misma fecha", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const e = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { fecha_matriculacion: "2026-09-10", id_estado_vehiculo: await estadoDe("Nuevo") } }));
    expect(e.fecha_facturacion).toBe("2026-09-10");
  });

  it("en un VO no se rellena sola", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const e = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { fecha_matriculacion: "2026-09-10", id_estado_vehiculo: await estadoDe("Usado") } }));
    expect(e.fecha_facturacion).toBeNull();
  });

  it("al matricular después (lápiz) la facturación acompaña, y si se cambia a mano se respeta", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const e = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_estado_vehiculo: await estadoDe("Nuevo") } }));
    await actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: e.id_expediente, expediente: { fecha_matriculacion: "2026-09-10" } }));
    expect((await leer(e.id_expediente)).fechaFacturacion).toBe("2026-09-10");

    // La matriculación se mueve y la facturación la sigue mientras nadie la haya tocado
    await actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: e.id_expediente, expediente: { fecha_matriculacion: "2026-09-12" } }));
    expect((await leer(e.id_expediente)).fechaFacturacion).toBe("2026-09-12");

    // El vendedor la fija a agosto a mano: manda ella
    await actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: e.id_expediente, expediente: { fecha_facturacion: "2026-08-28" } }));
    await actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: e.id_expediente, expediente: { fecha_matriculacion: "2026-09-20" } }));
    const fin = await leer(e.id_expediente);
    expect(fin.fechaMatriculacion).toBe("2026-09-20");
    expect(fin.fechaFacturacion).toBe("2026-08-28");
  });
});

describe("«Requerido al matricular»", () => {
  it("no deja matricular un crédito sin fecha RCI, ni al crear ni al editar", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const credito = await tipo("Crédito Prueba", "CREDITO", true);
    await expect(crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_tipo_de_venta: credito, fecha_matriculacion: "2026-09-10" } }))).rejects.toMatchObject({ status: 400 });

    const e = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_tipo_de_venta: credito } }));
    await expect(actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: e.id_expediente, expediente: { fecha_matriculacion: "2026-09-10" } }))).rejects.toMatchObject({ status: 400 });
    expect((await leer(e.id_expediente)).fechaMatriculacion).toBeNull();

    // Con la RCI en la misma operación sí se puede
    await actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: e.id_expediente, expediente: { fecha_matriculacion: "2026-09-10", fecha_rci: "2026-09-01" } }));
    const fin = await leer(e.id_expediente);
    expect(fin.fechaMatriculacion).toBe("2026-09-10");
    expect(fin.fechaRci).toBe("2026-09-01");
  });

  it("un pago de contado (sin la marca) se matricula sin RCI", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const contado = await tipo("Contado Prueba", "CONTADO", false);
    const e = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_tipo_de_venta: contado, fecha_matriculacion: "2026-09-10" } }));
    expect(e.fecha_matriculacion).toBe("2026-09-10");
  });

  it("cambiar el pago a uno que lo exige tampoco permite dejar un expediente matriculado sin RCI", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const contado = await tipo("Contado Prueba", "CONTADO", false);
    const credito = await tipo("Crédito Prueba", "CREDITO", true);
    const e = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_tipo_de_venta: contado, fecha_matriculacion: "2026-09-10" } }));
    await expect(actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: e.id_expediente, expediente: { id_tipo_de_venta: credito } }))).rejects.toMatchObject({ status: 400 });
  });
});
