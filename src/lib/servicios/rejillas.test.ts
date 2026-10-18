import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { commissionPlanModelRates, commissionPlanVendedores, commissionPlans, estadoVehiculo, expedientes, marcas, modelos } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { recalcularMes as recalcular } from "./liquidaciones";
import { avisosRejilla, comprobarRejilla, eliminarRejilla, esquemaGuardarRejilla, guardarRejilla, sumarMeses, validarCoche } from "./rejillas";

beforeEach(reiniciarBd);

const importes = Object.fromEntries([-4, -3, -2, -1, 0, 1, 2, 3].map((t) => [String(t), 10000]));

async function escenario() {
  const v1 = await crearUsuarioPrueba("vendedor", "Vendedor 1");
  const v2 = await crearUsuarioPrueba("vendedor", "Vendedor 2");
  const admin = await crearUsuarioPrueba("administrador", "Admin");
  const [marca] = await db.insert(marcas).values({ nombre: "Renault" }).returning();
  const [modelo] = await db.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: "Clio" }).returning();
  const [plan] = await db.insert(commissionPlans).values({ nombre: "Julio", fechaInicio: "2026-07-01", fechaFin: "2026-07-31", estado: "activo" }).returning();
  await db.insert(commissionPlanVendedores).values([
    { idPlan: plan.idPlan, idUsuario: v1.idUsuario },
    { idPlan: plan.idPlan, idUsuario: v2.idUsuario },
  ]);
  for (const tasaCumplida of [true, false]) {
    await db.insert(commissionPlanModelRates).values({ idPlan: plan.idPlan, idModelo: modelo.idModelo, tasaCumplida, importes });
  }
  const [estado] = await db.select().from(estadoVehiculo).where(eq(estadoVehiculo.clase, "VN")).limit(1);
  const nuevo = async (idUsuario: number, matricula: string, fecha: string) =>
    (await db.insert(expedientes).values({ idUsuario, idModelo: modelo.idModelo, idEstadoVehiculo: estado.idEstadoVehiculo, fechaMatriculacion: fecha, matricula }).returning())[0];
  const a = await nuevo(v1.idUsuario, "1234BCD", "2026-07-10");
  const b = await nuevo(v1.idUsuario, "5678 FGH", "2026-07-11");
  const c = await nuevo(v1.idUsuario, "9999JKL", "2026-07-12");
  const agosto = await nuevo(v1.idUsuario, "1111AAA", "2026-08-03");
  const ajeno = await nuevo(v2.idUsuario, "2222BBB", "2026-07-14");
  await db.transaction((tx) => recalcular(tx, v1.idUsuario, "2026-07", "alta"));
  return { v1, v2, admin, a, b, c, agosto, ajeno };
}

const fila = (matricula: string, importe: number | null, extra: Record<string, unknown> = {}) => ({ matricula, importe, ...extra });

describe("validación de comisiones con la rejilla", () => {
  it("detecta coches que cuadran, con importe distinto, que faltan, que sobran y de otro mes", async () => {
    const e = await escenario();
    await guardarRejilla(
      db,
      e.v1.idUsuario,
      e.v1.idUsuario,
      esquemaGuardarRejilla.parse({
        mes: "2026-07",
        origen: "manual",
        filas: [fila("1234-bcd", 10000), fila("5678FGH", 9000, { cliente: "Ana" }), fila("1111 AAA", 10000), fila("2222BBB", 10000), fila("0000XXX", 5000)],
      }),
    );
    const r = await comprobarRejilla(db, e.v1.idUsuario, "2026-07");
    const por = (m: string) => r.filas.find((f) => f.matricula === m);
    expect(r.hayLiquidacion).toBe(true);
    expect(por("1234BCD")).toMatchObject({ estado: "ok", importeApp: 10000, importeHoja: 10000, validacion: "pagado" });
    expect(por("5678 FGH")).toMatchObject({ estado: "distinto", diferencia: -1000, validacion: "pendiente" });
    expect(por("9999JKL")).toMatchObject({ estado: "falta_en_hoja", importeHoja: null, diferencia: -10000 });
    expect(por("1111 AAA")).toMatchObject({ estado: "otro_mes", idExpediente: e.agosto.idExpediente });
    expect(por("2222BBB")?.estado).toBe("no_en_app");
    expect(por("2222BBB")?.nota).toContain("otro vendedor");
    expect(por("0000XXX")?.estado).toBe("no_en_app");
    expect(r.resumen).toMatchObject({ cuadran: 1, distintos: 1, faltan: 1, sobran: 2, otroMes: 1, importeApp: 30000, importeHoja: 44000 });
    // los problemas salen primero
    expect(r.filas[r.filas.length - 1].estado).toBe("ok");
  });

  it("suma varias filas de la hoja del mismo coche (coche + financiación)", async () => {
    const e = await escenario();
    await guardarRejilla(db, e.v1.idUsuario, e.v1.idUsuario, esquemaGuardarRejilla.parse({ mes: "2026-07", origen: "excel", filas: [fila("1234BCD", 6000, { concepto: "Coche" }), fila("1234 BCD", 4000, { concepto: "Financiación" })] }));
    const r = await comprobarRejilla(db, e.v1.idUsuario, "2026-07");
    expect(r.filas.find((f) => f.matricula === "1234BCD")).toMatchObject({ estado: "ok", conceptosHoja: ["Coche", "Financiación"] });
  });

  it("marca como posible duplicado un coche que sale en la hoja de otro mes o repetido en la misma hoja", async () => {
    const e = await escenario();
    await guardarRejilla(db, e.v1.idUsuario, e.v1.idUsuario, esquemaGuardarRejilla.parse({ mes: "2026-06", origen: "excel", filas: [fila("1234BCD", 10000, { concepto: "Coche" })] }));
    await guardarRejilla(db, e.v1.idUsuario, e.v1.idUsuario, esquemaGuardarRejilla.parse({ mes: "2026-07", origen: "excel", filas: [fila("1234 BCD", 10000, { concepto: "Coche" }), fila("9999ZZZ", 500, { concepto: "Bono" }), fila("9999 ZZZ", 500, { concepto: "Bono" })] }));
    const r = await comprobarRejilla(db, e.v1.idUsuario, "2026-07");
    expect(r.filas.find((f) => f.matricula === "1234BCD")).toMatchObject({ duplicadaEn: ["2026-06"], repetidaEnHoja: false });
    expect(r.filas.find((f) => f.matricula.replace(/\s/g, "") === "9999ZZZ")).toMatchObject({ duplicadaEn: [], repetidaEnHoja: true });
    expect(r.resumen.duplicados).toBe(2);
    // Sin la hoja de junio no hay duplicado entre meses
    await eliminarRejilla(db, e.v1.idUsuario, "2026-06");
    expect((await comprobarRejilla(db, e.v1.idUsuario, "2026-07")).resumen.duplicados).toBe(1);
  });

  it("una fila sin importe legible queda como «sin importe»", async () => {
    const e = await escenario();
    await guardarRejilla(db, e.v1.idUsuario, e.v1.idUsuario, esquemaGuardarRejilla.parse({ mes: "2026-07", origen: "pdf", filas: [fila("1234BCD", null)] }));
    const r = await comprobarRejilla(db, e.v1.idUsuario, "2026-07");
    expect(r.filas.find((f) => f.matricula === "1234BCD")?.estado).toBe("sin_importe");
  });

  it("guardar de nuevo sustituye la rejilla del mes y se puede eliminar", async () => {
    const e = await escenario();
    await guardarRejilla(db, e.v1.idUsuario, e.v1.idUsuario, esquemaGuardarRejilla.parse({ mes: "2026-07", origen: "manual", filas: [fila("1234BCD", 1)] }));
    await guardarRejilla(db, e.v1.idUsuario, e.v1.idUsuario, esquemaGuardarRejilla.parse({ mes: "2026-07", origen: "manual", filas: [fila("5678FGH", 10000), fila("9999JKL", 10000)] }));
    const r = await comprobarRejilla(db, e.v1.idUsuario, "2026-07");
    expect(r.rejilla?.filas).toBe(2);
    await eliminarRejilla(db, e.v1.idUsuario, "2026-07");
    expect((await comprobarRejilla(db, e.v1.idUsuario, "2026-07")).rejilla).toBeNull();
    await expect(eliminarRejilla(db, e.v1.idUsuario, "2026-07")).rejects.toBeInstanceOf(HttpError);
  });

  it("el vendedor marca un coche como reclamado y deja de contar como pendiente", async () => {
    const e = await escenario();
    await guardarRejilla(db, e.v1.idUsuario, e.v1.idUsuario, esquemaGuardarRejilla.parse({ mes: "2026-07", origen: "manual", filas: [fila("1234BCD", 10000)] }));
    let r = await comprobarRejilla(db, e.v1.idUsuario, "2026-07");
    expect(r.resumen.pendientes).toBe(2); // 5678FGH y 9999JKL faltan
    await validarCoche(db, e.v1.idUsuario, { mes: "2026-07", idExpediente: e.c.idExpediente, estado: "reclamado", nota: "Reclamado a administración" });
    r = await comprobarRejilla(db, e.v1.idUsuario, "2026-07");
    expect(r.filas.find((f) => f.matricula === "9999JKL")).toMatchObject({ validacion: "reclamado", validacionManual: true, notaValidacion: "Reclamado a administración" });
    expect(r.resumen.pendientes).toBe(1);
    // no se puede validar un expediente ajeno
    await expect(validarCoche(db, e.v1.idUsuario, { mes: "2026-07", idExpediente: e.ajeno.idExpediente, estado: "pagado" })).rejects.toMatchObject({ status: 403 });
  });

  it("avisa de rejilla sin validar tras la nómina y de coches sin resolver", async () => {
    const e = await escenario();
    expect(sumarMeses("2026-12", 1)).toBe("2027-01");
    expect(sumarMeses("2026-01", -2)).toBe("2025-11");
    // Julio se paga en agosto y la hoja llega en septiembre: en agosto aún no hay aviso, en septiembre sí
    expect(await avisosRejilla(db, e.v1.idUsuario, "2026-08")).toEqual([]);
    const sin = await avisosRejilla(db, e.v1.idUsuario, "2026-09");
    expect(sin).toHaveLength(1);
    expect(sin[0]).toMatchObject({ tipo: "sin_rejilla", mes: "2026-07", idUsuario: e.v1.idUsuario });
    // con rejilla: avisa de los coches que no cuadran
    await guardarRejilla(db, e.v1.idUsuario, e.v1.idUsuario, esquemaGuardarRejilla.parse({ mes: "2026-07", origen: "manual", filas: [fila("1234BCD", 10000)] }));
    const inc = await avisosRejilla(db, e.v1.idUsuario, "2026-09");
    expect(inc[0]).toMatchObject({ tipo: "incidencias", cantidad: 2 });
    // el administrador ve los de todos; otro vendedor, ninguno
    expect((await avisosRejilla(db, null, "2026-09")).length).toBe(1);
    expect(await avisosRejilla(db, e.v2.idUsuario, "2026-09")).toEqual([]);
  });
});
