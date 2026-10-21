import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { ajustes, clientes, estadoVehiculo, expedientes, marcas, modelos, tiendas, usuariosTiendas } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { actualizarCliente, crearCliente, eliminarClientes, esquemaCliente, listarClientes } from "./clientes";
import { esquemaActualizarExpediente, esquemaCrearExpediente } from "./expedientes";
import { actualizarExpedientes, crearExpediente, eliminarExpedientes } from "./expedientes-escritura";
import { generarInforme } from "./informes";
import { listarExpedientes, obtenerExpediente, resumenPanel } from "./expedientes-lectura";

beforeEach(reiniciarBd);

async function esperarError(promesa: Promise<unknown>): Promise<HttpError> {
  try {
    await promesa;
  } catch (e) {
    if (e instanceof HttpError) return e;
    throw e;
  }
  throw new Error("Se esperaba un HttpError");
}

describe("crear expediente (10.1)", () => {
  it("crea cliente, contactos y expediente con valores por defecto", async () => {
    const vendedor = await crearUsuarioPrueba("vendedor");
    const [tienda] = await db.insert(tiendas).values({ nombre: "Madrid Norte" }).returning();
    await db.insert(usuariosTiendas).values({ idUsuario: vendedor.idUsuario, idTienda: tienda.idTienda });

    const entrada = esquemaCrearExpediente.parse({
      cliente: {
        nombre: "Juan Pérez",
        dni: "12345678Z",
        emails: [{ email: "juan@correo.com" }],
        telefonos: [{ telefono: "600123456" }],
      },
      expediente: { matricula: "1234ABC" },
    });
    const exp = await crearExpediente(db, vendedor, entrada);

    expect(exp.cliente?.nombre).toBe("Juan Pérez");
    expect(exp.cliente?.emails[0]).toMatchObject({ email: "juan@correo.com", tipo_email: "Principal" });
    expect(exp.cliente?.telefonos[0]).toMatchObject({ telefono: "600123456", tipo_telefono: "Principal" });
    expect(exp.id_tienda).toBe(tienda.idTienda); // única tienda del usuario
    expect(exp.id_usuario).toBe(vendedor.idUsuario);
    expect(exp.fecha_expediente).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(exp.estadoVehiculo?.nombre_estado_vehiculo).toBe("Nuevo"); // predeterminado
  });

  it("reutiliza el cliente existente con el mismo DNI", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const e1 = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ cliente: { nombre: "Ana", dni: "X1" }, expediente: {} }));
    const e2 = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ cliente: { nombre: "Ana Dos", dni: "X1" }, expediente: {} }));
    expect(e2.id_cliente).toBe(e1.id_cliente);
    expect(await db.select().from(clientes)).toHaveLength(1);
  });

  it("con estado_nombre 'usado' usa el estado Usado", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const exp = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { estado_nombre: "usado" } }));
    expect(exp.estadoVehiculo?.nombre_estado_vehiculo).toBe("Usado");
  });

  it("ningún campo del expediente es obligatorio", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const exp = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: {} }));
    expect(exp.id_expediente).toBeGreaterThan(0);
    expect(exp.cliente).toBeNull();
  });

  it("rechaza fechas que no existen en el calendario", () => {
    expect(() => esquemaCrearExpediente.parse({ expediente: { fecha_afectacion: "2026-02-31" } })).toThrow();
  });

  it("director, jefe_zona e invitado no pueden crear expedientes", async () => {
    for (const rol of ["director", "jefe_zona", "invitado"] as const) {
      const u = await crearUsuarioPrueba(rol);
      const err = await esperarError(crearExpediente(db, u, esquemaCrearExpediente.parse({ expediente: {} })));
      expect(err.status).toBe(403);
    }
  });

  it("la transacción no deja cliente huérfano si falla el expediente", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const entrada = esquemaCrearExpediente.parse({
      cliente: { nombre: "Fantasma" },
      expediente: { id_modelo: 999999 }, // modelo inexistente: viola la clave foránea
    });
    await expect(crearExpediente(db, admin, entrada)).rejects.toThrow();
    expect(await db.select().from(clientes)).toHaveLength(0);
  });
});

describe("actualizar y borrar expedientes", () => {
  it("un '' en una fecha la borra y los campos ausentes no se tocan", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const exp = await crearExpediente(
      db,
      admin,
      esquemaCrearExpediente.parse({ expediente: { fecha_afectacion: "2026-03-10", matricula: "AAA111" } }),
    );
    await actualizarExpedientes(
      db,
      admin,
      esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: exp.id_expediente, expediente: { fecha_afectacion: "" } }),
    );
    const despues = await obtenerExpediente(db, exp.id_expediente);
    expect(despues?.fecha_afectacion).toBeNull();
    expect(despues?.matricula).toBe("AAA111");
  });

  it("la edición en lote sin datos devuelve 400", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const exp = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: {} }));
    const err = await esperarError(
      actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "lote", ids: [exp.id_expediente], expediente: { id_modelo: "" } })),
    );
    expect(err.status).toBe(400);
    expect(err.message).toBe("No se seleccionaron datos para modificar");
  });

  it("la edición en lote establece la fecha de facturación de todos los seleccionados", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const a = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: {} }));
    const b = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: {} }));
    await actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "lote", ids: [a.id_expediente, b.id_expediente], expediente: { fecha_facturacion: "2026-10-15" } }));
    expect((await obtenerExpediente(db, a.id_expediente))?.fecha_facturacion).toBe("2026-10-15");
    expect((await obtenerExpediente(db, b.id_expediente))?.fecha_facturacion).toBe("2026-10-15");
  });

  it("en un VO la facturación es la fecha RCI o, si es de contado, el último día del mes del pedido, y la sigue mientras no se fije a mano", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const exp = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { estado_nombre: "usado", fecha_expediente: "2026-04-03" } }));
    expect((await obtenerExpediente(db, exp.id_expediente))?.fecha_facturacion).toBe("2026-04-30");
    await actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: exp.id_expediente, expediente: { fecha_rci: "2026-05-12" } }));
    expect((await obtenerExpediente(db, exp.id_expediente))?.fecha_facturacion).toBe("2026-05-12");
    await actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: exp.id_expediente, expediente: { fecha_facturacion: "2026-06-01" } }));
    await actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: exp.id_expediente, expediente: { fecha_rci: "2026-05-20" } }));
    expect((await obtenerExpediente(db, exp.id_expediente))?.fecha_facturacion).toBe("2026-06-01");
  });

  it("la edición en lote cambia el tipo de venta solo de los ids indicados", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const a = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: {} }));
    const b = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: {} }));
    const r = await actualizarExpedientes(
      db,
      admin,
      esquemaActualizarExpediente.parse({ modo: "lote", ids: [a.id_expediente], expediente: { id_tipo_de_venta: 2 } }),
    );
    expect(r.actualizados).toBe(1);
    expect((await obtenerExpediente(db, a.id_expediente))?.id_tipo_de_venta).toBe(2);
    expect((await obtenerExpediente(db, b.id_expediente))?.id_tipo_de_venta).toBeNull();
  });

  it("eliminar devuelve cuántos se han borrado", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const a = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: {} }));
    const b = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: {} }));
    expect(await eliminarExpedientes(db, admin, [a.id_expediente, b.id_expediente])).toBe(2);
    expect(await listarExpedientes(db)).toHaveLength(0);
    expect(await obtenerExpediente(db, a.id_expediente)).toBeNull();
    expect((await resumenPanel(db)).total).toBe(0);
    // la fila se conserva (borrado lógico)
    expect(await db.select({ id: expedientes.idExpediente, en: expedientes.eliminadoEn }).from(expedientes)).toHaveLength(2);
  });

  it("un expediente eliminado deja de contar pero aparece en las estadísticas de eliminados", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const a = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { fecha_expediente: "2026-03-10" } }));
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { fecha_expediente: "2026-03-11" } }));
    await eliminarExpedientes(db, admin, [a.id_expediente]);
    const informe = await generarInforme(db, { desde: "2026-03", hasta: "2026-03" });
    expect(informe.totales.pedidosCartera).toBe(1);
    expect(informe.eliminados.total).toBe(1);
    // un expediente eliminado ya no se puede editar
    const err = await esperarError(actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: a.id_expediente, expediente: { matricula: "X" } })));
    expect(err.status).toBe(404);
  });

  it("con restringir_por_tienda el vendedor solo toca sus expedientes", async () => {
    const v1 = await crearUsuarioPrueba("vendedor", "Uno");
    const v2 = await crearUsuarioPrueba("vendedor", "Dos");
    const exp = await crearExpediente(db, v1, esquemaCrearExpediente.parse({ expediente: {} }));
    // Desactivado (valor por defecto): igual que el original, cualquiera puede.
    await actualizarExpedientes(db, v2, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: exp.id_expediente, expediente: { matricula: "B1" } }));
    await db.insert(ajustes).values({ clave: "restringir_por_tienda", valor: "true" });
    const err = await esperarError(
      actualizarExpedientes(db, v2, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: exp.id_expediente, expediente: { matricula: "B2" } })),
    );
    expect(err.status).toBe(403);
    await actualizarExpedientes(db, v1, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: exp.id_expediente, expediente: { matricula: "B3" } }));
  });
});

describe("clientes", () => {
  it("rechaza un DNI duplicado (409) al crear y al editar", async () => {
    await crearCliente(db, esquemaCliente.parse({ nombre: "Uno", dni: "D1" }), null);
    const dos = await crearCliente(db, esquemaCliente.parse({ nombre: "Dos", dni: "D2" }), null);
    expect((await esperarError(crearCliente(db, esquemaCliente.parse({ nombre: "Otro", dni: "D1" }), null))).status).toBe(409);
    expect((await esperarError(actualizarCliente(db, dos.id, esquemaCliente.parse({ nombre: "Dos", dni: "D1" })))).status).toBe(409);
  });

  it("solo el nombre es obligatorio", () => {
    expect(esquemaCliente.safeParse({ nombre: "" }).success).toBe(false);
    expect(esquemaCliente.safeParse({ nombre: "Sin más datos" }).success).toBe(true);
  });

  it("editar sustituye correos y teléfonos", async () => {
    const c = await crearCliente(db, esquemaCliente.parse({ nombre: "C", emails: [{ email: "a@a.es" }], telefonos: [{ telefono: "1" }] }), null);
    await actualizarCliente(db, c.id, esquemaCliente.parse({ nombre: "C", emails: [{ email: "b@b.es", tipo: "Trabajo" }] }));
    const cli = await db.query.clientes.findFirst({ where: eq(clientes.id, c.id), with: { emails: true, telefonos: true } });
    expect(cli?.emails.map((e) => [e.email, e.tipoEmail])).toEqual([["b@b.es", "Trabajo"]]);
    expect(cli?.telefonos).toHaveLength(0);
  });

  it("al borrar un cliente (borrado lógico) sus expedientes conservan el cliente y siguen en estadísticas", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const exp = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ cliente: { nombre: "Borrar" }, expediente: {} }));
    expect(await eliminarClientes(db, [exp.id_cliente as number])).toBe(1);
    expect((await obtenerExpediente(db, exp.id_expediente))?.cliente?.nombre).toBe("Borrar");
    expect(await listarClientes(db)).toHaveLength(0);
    expect((await resumenPanel(db)).total).toBe(1);
  });
});

describe("panel", () => {
  it("cuenta expedientes del mes, totales, clientes y cada tipo de venta (aunque sea 0)", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ cliente: { nombre: "A" }, expediente: { id_tipo_de_venta: 1 } }));
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { fecha_expediente: "2020-01-15" } }));
    const r = await resumenPanel(db);
    expect(r.total).toBe(2);
    expect(r.mesActual).toBe(1);
    expect(r.clientes).toBe(1);
    expect(r.porTipoVenta).toHaveLength(3);
    expect(r.porTipoVenta.find((t) => t.nombre === "Contado")?.cantidad).toBe(1);
    expect(r.porTipoVenta.find((t) => t.nombre === "Preference")?.cantidad).toBe(0);
  });
});

describe("integridad de datos de prueba", () => {
  it("la semilla es idempotente", async () => {
    const { sembrar } = await import("@/db/semilla");
    await sembrar(db);
    expect(await db.select().from(estadoVehiculo)).toHaveLength(5);
    expect(await db.select().from(marcas)).toHaveLength(0);
    expect(await db.select().from(modelos)).toHaveLength(0);
    expect(await db.select().from(expedientes)).toHaveLength(0);
  });
});

describe("bonus manuales del expediente", () => {
  it("guarda las claves de los bonus manuales elegidos y las devuelve", async () => {
    const vendedor = await crearUsuarioPrueba("vendedor");
    const exp = await crearExpediente(db, vendedor, esquemaCrearExpediente.parse({ cliente: { nombre: "Ana Gil" }, expediente: { matricula: "5555XYZ" } }));
    expect(exp.bonus_manuales).toEqual([]);
    await actualizarExpedientes(db, vendedor, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: exp.id_expediente, expediente: { bonus_manuales: ["k-uno", "k-dos"] } }));
    const [fila] = await db.select().from(expedientes).where(eq(expedientes.idExpediente, exp.id_expediente));
    expect(fila.bonusManuales).toEqual(["k-uno", "k-dos"]);
    expect((await obtenerExpediente(db, exp.id_expediente))?.bonus_manuales).toEqual(["k-uno", "k-dos"]);
  });
});
