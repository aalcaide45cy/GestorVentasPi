import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { clientes, emailsClientes, estadoVehiculo, expedientes, importacionesBloques, marcas, modelos, tipoDeVenta } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { aplicarCompletado, deshacerBloque, esquemaFilaCompletar, previsualizarCompletado } from "./completar-datos";

beforeEach(reiniciarBd);

const fila = (o: Record<string, unknown>) => esquemaFilaCompletar.parse({ fila: 2, ...o });

async function escenario(clase: "VN" | "VO" = "VN") {
  const admin = await crearUsuarioPrueba("administrador");
  const [cli] = await db.insert(clientes).values({ clienteId: "c1", nombre: "Francisco Mayor Casado" }).returning();
  const [est] = await db.insert(estadoVehiculo).values({ nombreEstadoVehiculo: clase === "VO" ? "Usado" : "Nuevo", clase }).returning();
  const [exp] = await db.insert(expedientes).values({ idUsuario: admin.idUsuario, idCliente: cli.id, idEstadoVehiculo: est.idEstadoVehiculo, vin: "UU1DJF00477657076", matricula: "5913NPZ", fechaExpediente: "2026-09-02" }).returning();
  return { admin, cli, exp };
}

describe("completar datos desde un listado", () => {
  it("encuentra el expediente por bastidor, propone rellenar y corregir, y nunca crea nada", async () => {
    const { admin, exp } = await escenario();
    const r = await previsualizarCompletado(db, admin, [
      fila({ cliente: "FRANCISCO MAYOR CASADO", nif: "51701814E", bastidor: "UU1DJF00477657076", matricula: "7226NTG", marca: "DACIA", modelo: "Nueva Sandero", fFactura: null, fMatriculacion: "2026-10-14", fEntrega: "2026-10-15", email: "f.mayor@hotmail.com", telefono: "606184618" }),
      fila({ fila: 3, cliente: "NADIE QUE EXISTA", bastidor: "ZZZ" }),
      fila({ fila: 4, cliente: "ANULADO", estado: "Anulado" }),
    ]);
    const f = r.filas[0];
    expect(f.idExpediente).toBe(exp.idExpediente);
    expect(f.coincide).toBe("bastidor");
    const campos = Object.fromEntries(f.propuestas.map((p) => [p.campo, p]));
    expect(campos.matricula).toMatchObject({ tipo: "corregir", actual: "5913NPZ", nuevo: "7226NTG" });
    expect(campos.fecha_matriculacion.tipo).toBe("rellenar");
    expect(campos.dni.tipo).toBe("rellenar");
    expect(campos.email).toBeDefined();
    expect(campos.vin).toBeUndefined();
    expect(r.filas[1].estado).toBe("sin_coincidencia");
    expect(r.filas[2].estado).toBe("anulado");
    expect(await db.select().from(expedientes)).toHaveLength(1);
  });

  it("solo localiza por las referencias que se elijan", async () => {
    const { admin, exp } = await escenario();
    const f = fila({ cliente: "Francisco Mayor Casado", bastidor: "UU1DJF00477657076" });
    expect((await previsualizarCompletado(db, admin, [f], ["matricula", "nif"])).filas[0].estado).toBe("sin_coincidencia");
    const r = await previsualizarCompletado(db, admin, [f], ["nombre"]);
    expect(r.filas[0].idExpediente).toBe(exp.idExpediente);
    expect(r.filas[0].coincide).toBe("nombre");
  });

  it("en un usado no toca la fecha de matriculación del vehículo", async () => {
    const { admin } = await escenario("VO");
    const r = await previsualizarCompletado(db, admin, [fila({ bastidor: "UU1DJF00477657076", fMatriculacion: "2017-11-28", fEntrega: "2026-10-15" })]);
    const campos = r.filas[0].propuestas.map((p) => p.campo);
    expect(campos).not.toContain("fecha_matriculacion");
    expect(campos).toContain("fecha_entrega");
  });

  it("aplica solo lo elegido, queda en el log y se puede deshacer", async () => {
    const { admin, exp, cli } = await escenario();
    const catalogosAntes = JSON.stringify([await db.select().from(marcas), await db.select().from(modelos), await db.select().from(tipoDeVenta), await db.select().from(estadoVehiculo)]);
    const r = await aplicarCompletado(db, admin, {
      archivo: "Expedientes.csv",
      cambios: [{ id_expediente: exp.idExpediente, campos: [{ campo: "matricula", valor: "7226NTG" }, { campo: "dni", valor: "51701814E" }, { campo: "email", valor: "f@x.com" }] }],
    });
    expect(r.expedientesCambiados).toBe(1);
    expect(r.camposCambiados).toBe(3);
    const [e1] = await db.select().from(expedientes).where(eq(expedientes.idExpediente, exp.idExpediente));
    expect(e1.matricula).toBe("7226NTG");
    expect(e1.fechaEntrega).toBeNull();
    expect((await db.select().from(clientes).where(eq(clientes.id, cli.id)))[0].dni).toBe("51701814E");
    const [bloque] = await db.select().from(importacionesBloques);
    expect(bloque.modificados).toBe(1);
    // Nunca se crea ni se cambia una marca, un modelo, un tipo de venta ni un estado
    expect(JSON.stringify([await db.select().from(marcas), await db.select().from(modelos), await db.select().from(tipoDeVenta), await db.select().from(estadoVehiculo)])).toBe(catalogosAntes);
    expect(e1.idModelo).toBe(exp.idModelo);

    const d = await deshacerBloque(db, admin, bloque.id);
    expect(d.revertidos).toBe(3);
    const [e2] = await db.select().from(expedientes).where(eq(expedientes.idExpediente, exp.idExpediente));
    expect(e2.matricula).toBe("5913NPZ");
    expect((await db.select().from(clientes).where(eq(clientes.id, cli.id)))[0].dni).toBeNull();
    expect(await db.select().from(emailsClientes)).toHaveLength(0);
    expect(await db.select().from(importacionesBloques)).toHaveLength(0);
  });

  it("al deshacer conserva lo que se haya cambiado después", async () => {
    const { admin, exp } = await escenario();
    await aplicarCompletado(db, admin, { archivo: "a.csv", cambios: [{ id_expediente: exp.idExpediente, campos: [{ campo: "matricula", valor: "7226NTG" }] }] });
    await db.update(expedientes).set({ matricula: "1111AAA" }).where(eq(expedientes.idExpediente, exp.idExpediente));
    const [bloque] = await db.select().from(importacionesBloques);
    const d = await deshacerBloque(db, admin, bloque.id);
    expect(d.revertidos).toBe(0);
    expect(d.conservados[0]).toContain("se cambió después");
    expect((await db.select().from(expedientes).where(eq(expedientes.idExpediente, exp.idExpediente)))[0].matricula).toBe("1111AAA");
  });
});
