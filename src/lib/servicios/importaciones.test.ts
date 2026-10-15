import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";
import { listarExpedientes } from "./expedientes-lectura";
import {
  esquemaImportacionClientes,
  esquemaImportacionCsv,
  esquemaProcesarExcel,
  eliminarBloques,
  importarClientesCsv,
  importarExpedientesCsv,
  listarBloques,
  procesarActualizacionesExcel,
  verificarFilasExcel,
} from "./importaciones";
import { listarClientes } from "./clientes";
import { leerCatalogos } from "./catalogos";

beforeEach(reiniciarBd);

describe("importación CSV de expedientes", () => {
  it("crea expedientes con cliente, marca, modelo, tipo y estado, y omite duplicados", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const entrada = esquemaImportacionCsv.parse({
      filename: "ventas.csv",
      items: [
        {
          cliente_nombre: "Ana Ruiz",
          cliente_dni: "11111111A",
          cliente_emails: "ana@correo.com:Trabajo|ana2@correo.com",
          cliente_telefonos: "600111222",
          marca_nombre: "Renault",
          modelo_nombre: "Clio",
          tipo_venta_nombre: "Financiación Crédito",
          estado_vehiculo_nombre: "KM0",
          fecha_expediente: "2026-03-10",
          matricula: "1234ABC (baja)",
          vin: "VF1ABC",
        },
        { cliente_nombre: "Otro", vin: "VF1ABC" }, // mismo bastidor → duplicado
        { cliente_nombre: "Otro", matricula: "1234ABC" }, // misma matrícula (sin lo que sigue a «(») → duplicado
      ],
    });
    const r = await importarExpedientesCsv(db, admin, entrada);
    expect(r).toMatchObject({ importados: 1, omitidos: 2 });

    const [e] = await listarExpedientes(db);
    expect(e.cliente?.nombre).toBe("Ana Ruiz");
    expect(e.cliente?.emails.map((m) => m.tipo_email)).toEqual(["Trabajo", "Principal"]);
    expect(e.modelo?.marca?.nombre).toBe("Renault");
    expect(e.tipoDeVenta?.categoria).toBe("CREDITO");
    expect(e.estadoVehiculo).toMatchObject({ nombre_estado_vehiculo: "KM0", clase: "VO", subtipo_vo: "KM0" });
    expect(e.matricula).toBe("1234ABC");
    expect(e.fecha_expediente).toBe("2026-03-10");
  });

  it("deja un bloque en el log con sus registros y el expediente asociado", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await importarExpedientesCsv(db, admin, esquemaImportacionCsv.parse({ filename: "a.csv", items: [{ cliente_nombre: "Luis", vin: "V1" }] }));
    const bloques = await listarBloques(db);
    expect(bloques).toHaveLength(1);
    expect(bloques[0]).toMatchObject({ nombre_archivo: "a.csv", tipo_archivo: "CSV", creados: 1, omitidos: 0 });
    expect(bloques[0].registros[0]).toMatchObject({ tipo_accion: "creado", cliente_nombre: "Luis" });
    expect(bloques[0].registros[0].expediente?.vin).toBe("V1");

    expect(await eliminarBloques(db, [bloques[0].id])).toBe(1);
    expect(await listarBloques(db)).toHaveLength(0);
    expect(await listarExpedientes(db)).toHaveLength(1); // borrar el log no deshace la importación
  });

  it("reutiliza el cliente por DNI y crea los catálogos que falten", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await importarExpedientesCsv(
      db,
      admin,
      esquemaImportacionCsv.parse({
        items: [
          { cliente_nombre: "Eva", cliente_dni: "22222222B", marca_nombre: "MarcaNueva", modelo_nombre: "M1", vin: "A1" },
          { cliente_nombre: "Eva Otra", cliente_dni: "22222222B", marca_nombre: "MarcaNueva", modelo_nombre: "M1", vin: "A2" },
        ],
      }),
    );
    expect(await listarClientes(db)).toHaveLength(1);
    const cat = await leerCatalogos(db);
    expect(cat.marcas.filter((m) => m.nombre === "MarcaNueva")).toHaveLength(1);
    expect(cat.modelos.filter((m) => m.nombre_modelo === "M1")).toHaveLength(1);
  });
});

describe("importación Excel", () => {
  async function prepararCliente() {
    const admin = await crearUsuarioPrueba("administrador");
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ cliente: { nombre: "Marta Gil" }, expediente: {} }));
    return admin;
  }

  it("verifica: ok con un expediente, no_match si no existe y multiple con varios", async () => {
    const admin = await prepararCliente();
    const r1 = await verificarFilasExcel(db, [{ rowIdx: 0, cliente: "marta gil" }, { rowIdx: 1, cliente: "Nadie" }]);
    expect(r1[0].status).toBe("ok");
    expect(r1[1].status).toBe("no_match");

    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ cliente: { nombre: "Marta Gil" }, expediente: {} }));
    const r2 = await verificarFilasExcel(db, [{ rowIdx: 0, cliente: "Marta Gil" }]);
    expect(r2[0].status).toBe("multiple");
  });

  it("actualiza solo los campos con cambios y cuenta modificados y omitidos", async () => {
    const admin = await prepararCliente();
    const [v] = await verificarFilasExcel(db, [{ rowIdx: 0, cliente: "Marta Gil" }]);
    if (v.status !== "ok") throw new Error("Se esperaba ok");

    const upd = { id_cliente: v.id_cliente, id_expediente: v.id_expediente, bastidor: "BASTIDOR1", matricula: "9999ZZZ", f_afect: "2026-04-01", telefono: "611222333", email: "marta@correo.com" };
    const r1 = await procesarActualizacionesExcel(db, admin, esquemaProcesarExcel.parse({ filename: "a.xlsx", updates: [upd] }));
    expect(r1).toMatchObject({ procesados: 1, modificados: 1 });
    const [e] = await listarExpedientes(db);
    expect(e).toMatchObject({ vin: "BASTIDOR1", matricula: "9999ZZZ", fecha_afectacion: "2026-04-01" });
    expect(e.cliente?.telefonos[0].telefono).toBe("611222333");
    expect(e.cliente?.emails[0].email).toBe("marta@correo.com");

    // Segunda pasada idéntica: sin cambios → registrada como omitida
    const r2 = await procesarActualizacionesExcel(db, admin, esquemaProcesarExcel.parse({ filename: "a.xlsx", updates: [upd] }));
    expect(r2.modificados).toBe(0);
  });
});

describe("importación CSV de clientes", () => {
  it("crea clientes con tienda por nombre y contactos, y actualiza por DNI", async () => {
    const r1 = await importarClientesCsv(db, esquemaImportacionClientes.parse({ items: [{ nombre: "Pepe", dni: "33333333C", emails: "p@e.com", telefonos: "600" }] }));
    expect(r1.nuevos).toBe(1);
    const r2 = await importarClientesCsv(db, esquemaImportacionClientes.parse({ items: [{ nombre: "Pepe Actualizado", dni: "33333333C" }] }));
    expect(r2.nuevos).toBe(0);
    const lista = await listarClientes(db);
    expect(lista).toHaveLength(1);
  });
});
