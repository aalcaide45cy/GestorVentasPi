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
    expect(campos).toContain("fecha_primera_matriculacion");
    expect(campos).toContain("fecha_entrega");
  });

  it("encuentra al cliente por NIF aunque uno traiga ceros delante y otro no, y limpia la matrícula del listado", async () => {
    const { admin, exp, cli } = await escenario();
    await db.update(clientes).set({ dni: "03217951K" }).where(eq(clientes.id, cli.id));
    await db.update(expedientes).set({ vin: null, matricula: null }).where(eq(expedientes.idExpediente, exp.idExpediente));
    const r = await previsualizarCompletado(db, admin, [fila({ nif: "3217951K", matricula: "E1234ABC(28-11-2017)" })]);
    expect(r.filas[0].idExpediente).toBe(exp.idExpediente);
    expect(r.filas[0].coincide).toBe("nif");
    const campos = Object.fromEntries(r.filas[0].propuestas.map((p) => [p.campo, p]));
    expect(campos.matricula.nuevo).toBe("1234ABC");
    // 03217951K y 3217951K son el mismo documento: no se propone corregirlo
    expect(campos.dni).toBeUndefined();
  });

  it("si el documento no coincide pero es muy parecido, lo sugiere para elegir a mano y se puede asignar el expediente", async () => {
    const { admin, exp, cli } = await escenario();
    await db.update(clientes).set({ dni: "51701814E" }).where(eq(clientes.id, cli.id));
    const dudosa = fila({ nif: "51701814F", fEntrega: "2026-10-15" });
    const r = await previsualizarCompletado(db, admin, [dudosa]);
    expect(r.filas[0].estado).toBe("sin_coincidencia");
    expect(r.filas[0].candidatos.map((c) => c.id)).toEqual([exp.idExpediente]);
    const manual = await previsualizarCompletado(db, admin, [dudosa], undefined, { "2": exp.idExpediente });
    expect(manual.filas[0].idExpediente).toBe(exp.idExpediente);
    expect(manual.filas[0].coincide).toBe("manual");
    expect(manual.filas[0].propuestas.map((p) => p.campo)).toContain("fecha_entrega");
  });

  it("con varios pedidos del mismo cliente elige por bastidor o por modelo, y si no puede, avisa de la duda con los candidatos", async () => {
    const { admin, exp, cli } = await escenario();
    await db.update(clientes).set({ dni: "51701814E" }).where(eq(clientes.id, cli.id));
    await db.update(expedientes).set({ vin: null, matricula: null }).where(eq(expedientes.idExpediente, exp.idExpediente));
    const [otro] = await db.insert(expedientes).values({ idUsuario: admin.idUsuario, idCliente: cli.id, fechaExpediente: "2026-09-03" }).returning();
    const duda = await previsualizarCompletado(db, admin, [fila({ nif: "51701814E" })]);
    expect(duda.filas[0].estado).toBe("ambiguo");
    expect(duda.filas[0].candidatos.map((c) => c.id).sort()).toEqual([exp.idExpediente, otro.idExpediente].sort());
    await db.update(expedientes).set({ vin: "UU1DJF00477657076" }).where(eq(expedientes.idExpediente, otro.idExpediente));
    const porBastidor = await previsualizarCompletado(db, admin, [fila({ nif: "51701814E", bastidor: "UU1DJF00477657076" })]);
    expect(porBastidor.filas[0].idExpediente).toBe(otro.idExpediente);
  });

  it("un anulado en el listado se revisa a mano: se ve su expediente y sus cambios, y se puede deshabilitar y deshacer", async () => {
    const { admin, exp } = await escenario();
    const r = await previsualizarCompletado(db, admin, [fila({ bastidor: "UU1DJF00477657076", estado: "Anulado", fEntrega: "2026-10-15" })]);
    expect(r.filas[0].estado).toBe("anulado");
    expect(r.filas[0].idExpediente).toBe(exp.idExpediente);
    expect(r.filas[0].propuestas.map((p) => p.campo)).toContain("fecha_entrega");
    expect(r.filas[0].motivo).toContain("Anulado en el listado");
    expect(r.resumen.anuladas).toBe(1);
    const a = await aplicarCompletado(db, admin, { archivo: "a.xlsx", deshabilitar: [exp.idExpediente], cambios: [] });
    expect(a.expedientesCambiados).toBe(1);
    expect((await db.select().from(expedientes).where(eq(expedientes.idExpediente, exp.idExpediente)))[0].deshabilitado).toBe(true);
    const [bloque] = await db.select().from(importacionesBloques);
    await deshacerBloque(db, admin, bloque.id);
    expect((await db.select().from(expedientes).where(eq(expedientes.idExpediente, exp.idExpediente)))[0].deshabilitado).toBe(false);
  });

  it("guarda el estado de la intranet (Archivado, Anulado…) para poder filtrar y revisar a mano, y se deshace", async () => {
    const { admin, exp } = await escenario();
    const r = await previsualizarCompletado(db, admin, [fila({ bastidor: "UU1DJF00477657076", estado: "Archivado" })]);
    expect(r.filas[0].propuestas.find((p) => p.campo === "estado_intranet")).toMatchObject({ nuevo: "Archivado", tipo: "rellenar" });
    expect(r.resumen.archivadas).toBe(1);
    await aplicarCompletado(db, admin, { archivo: "a.xlsx", cambios: [{ id_expediente: exp.idExpediente, campos: [{ campo: "estado_intranet", valor: "Archivado" }] }] });
    expect((await db.select().from(expedientes).where(eq(expedientes.idExpediente, exp.idExpediente)))[0].estadoIntranet).toBe("Archivado");
    // Con el mismo estado ya no se propone
    expect((await previsualizarCompletado(db, admin, [fila({ bastidor: "UU1DJF00477657076", estado: "archivado" })])).filas[0].propuestas).toHaveLength(0);
    const [bloque] = await db.select().from(importacionesBloques);
    await deshacerBloque(db, admin, bloque.id);
    expect((await db.select().from(expedientes).where(eq(expedientes.idExpediente, exp.idExpediente)))[0].estadoIntranet).toBeNull();
  });

  it("rechaza una fecha escrita mal en lugar de guardarla", async () => {
    const { admin, exp } = await escenario();
    const r = await aplicarCompletado(db, admin, { archivo: "a", cambios: [{ id_expediente: exp.idExpediente, campos: [{ campo: "fecha_entrega", valor: "15/10/2026" }] }] });
    expect(r.camposCambiados).toBe(0);
    expect(r.omitidos[0]).toContain("no es una fecha válida");
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
