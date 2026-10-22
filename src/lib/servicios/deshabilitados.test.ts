import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { clientes, expedientes, marcas, modelos } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { listarClientes } from "./clientes";
import { detectarDuplicados } from "./duplicados";
import { resumenPanel } from "./expedientes-lectura";
import { cargarDatosPanel } from "./panel";

beforeEach(reiniciarBd);

describe("los expedientes deshabilitados no cuentan", () => {
  async function base() {
    const u = await crearUsuarioPrueba("administrador");
    const [marca] = await db.insert(marcas).values({ nombre: "Dacia" }).returning();
    const [modelo] = await db.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: "Sandero" }).returning();
    const [ana] = await db.insert(clientes).values({ clienteId: "c-ana", nombre: "Ana Pérez" }).returning();
    const hoy = new Date().toISOString().slice(0, 10);
    await db.insert(expedientes).values([
      { idUsuario: u.idUsuario, idCliente: ana.id, idModelo: modelo.idModelo, matricula: "1234ABC", fechaExpediente: hoy },
      { idUsuario: u.idUsuario, idCliente: ana.id, idModelo: modelo.idModelo, matricula: "1234ABC", fechaExpediente: hoy, deshabilitado: true },
    ]);
  }

  it("ni en el total del panel, ni en los recientes, ni en las ventas del cliente", async () => {
    await base();
    const r = await resumenPanel(db);
    expect(r.total).toBe(1);
    expect(r.mesActual).toBe(1);
    const panel = await cargarDatosPanel(db);
    expect(panel.recientes).toHaveLength(1);
    expect((await listarClientes(db)).find((c) => c.nombre === "Ana Pérez")?.num_expedientes).toBe(1);
  });

  it("y el detector de duplicados los deja fuera salvo que se pidan", async () => {
    await base();
    const sin = await detectarDuplicados(db);
    expect(sin.revisados).toBe(1);
    expect(sin.grupos).toHaveLength(0);
    const con = await detectarDuplicados(db, { incluirDeshabilitados: true });
    expect(con.revisados).toBe(2);
    expect(con.grupos.length).toBeGreaterThan(0);
  });
});
