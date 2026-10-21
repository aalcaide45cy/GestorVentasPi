import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { estadoVehiculo, expedientes, tipoDeVenta } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { esquemaActualizarExpediente, esquemaCrearExpediente } from "./expedientes";
import { actualizarExpedientes, crearExpediente, type AvisoGuardado } from "./expedientes-escritura";

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

  it("en un VO no sigue a la matriculación: es la RCI o el fin de mes del pedido", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const e = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { fecha_matriculacion: "2026-09-10", fecha_expediente: "2026-08-05", id_estado_vehiculo: await estadoDe("Usado") } }));
    expect(e.fecha_facturacion).toBe("2026-08-31");
    const r = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { fecha_matriculacion: "2026-09-10", fecha_expediente: "2026-08-05", fecha_rci: "2026-09-02", id_estado_vehiculo: await estadoDe("Usado") } }));
    expect(r.fecha_facturacion).toBe("2026-09-02");
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
  it("avisa pero no impide guardar un crédito matriculado sin fecha RCI, ni al crear ni al editar", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const credito = await tipo("Crédito Prueba", "CREDITO", true);
    const avisosAlta: AvisoGuardado[] = [];
    const creado = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_tipo_de_venta: credito, fecha_matriculacion: "2026-09-10" } }), avisosAlta);
    expect(creado.fecha_matriculacion).toBe("2026-09-10"); // se ha guardado igualmente
    expect(avisosAlta).toHaveLength(1);
    expect(avisosAlta[0].campo).toBe("fecha_rci");

    const e = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_tipo_de_venta: credito } }));
    const r = await actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: e.id_expediente, expediente: { fecha_matriculacion: "2026-09-10" } }));
    expect(r.avisos.map((a) => a.campo)).toEqual(["fecha_rci"]);
    expect((await leer(e.id_expediente)).fechaMatriculacion).toBe("2026-09-10");

    // Con la RCI en la misma operación no hay aviso
    const ok = await actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: e.id_expediente, expediente: { fecha_matriculacion: "2026-09-11", fecha_rci: "2026-09-01" } }));
    expect(ok.avisos).toEqual([]);
    const fin = await leer(e.id_expediente);
    expect(fin.fechaMatriculacion).toBe("2026-09-11");
    expect(fin.fechaRci).toBe("2026-09-01");
  });

  it("un pago de contado (sin la marca) se matricula sin RCI y sin aviso", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const contado = await tipo("Contado Prueba", "CONTADO", false);
    const avisos: AvisoGuardado[] = [];
    const e = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_tipo_de_venta: contado, fecha_matriculacion: "2026-09-10" } }), avisos);
    expect(e.fecha_matriculacion).toBe("2026-09-10");
    expect(avisos).toEqual([]);
  });

  it("cambiar el pago a uno que lo exige se guarda y avisa de que falta la RCI", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const contado = await tipo("Contado Prueba", "CONTADO", false);
    const credito = await tipo("Crédito Prueba", "CREDITO", true);
    const e = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_tipo_de_venta: contado, fecha_matriculacion: "2026-09-10" } }));
    const r = await actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: e.id_expediente, expediente: { id_tipo_de_venta: credito } }));
    expect(r.avisos.map((a) => a.campo)).toEqual(["fecha_rci"]);
    expect((await leer(e.id_expediente)).idTipoDeVenta).toBe(credito);
  });
});
