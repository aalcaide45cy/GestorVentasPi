import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { commissionLiquidationVersions, estadoVehiculo, expedientes, marcas, modelos } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import {
  actualizarPendiente,
  cambiarEstadoLiquidacion,
  cotejo,
  crearPendiente,
  leerLiquidacion,
  leerLibro,
  liquidar,
  listarLiquidaciones,
  listarPendientes,
  marcarCobro,
  previsionNomina,
} from "./comisiones-gestion";
import { esquemaActualizarExpediente } from "./expedientes";
import { actualizarExpedientes, crearExpediente, eliminarExpedientes } from "./expedientes-escritura";
import { esquemaCrearExpediente } from "./expedientes";
import { eliminarPlan, guardarPlan, leerPlan, listarPlanes } from "./planes";
import { generarInforme } from "./informes";
import { eliminarUsuario } from "./usuarios";

beforeEach(reiniciarBd);

const importes = Object.fromEntries([-4, -3, -2, -1, 0, 1, 2, 3].map((t) => [String(t), 10000]));

async function base() {
  const admin = await crearUsuarioPrueba("administrador", "Admin");
  const vend = await crearUsuarioPrueba("vendedor", "Vendedor");
  const [marca] = await db.insert(marcas).values({ nombre: "Renault" }).returning();
  const [modelo] = await db.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: "Clio" }).returning();
  const [vn] = await db.select().from(estadoVehiculo).where(eq(estadoVehiculo.clase, "VN")).limit(1);
  const plan = await guardarPlan(db, null, {
    nombre: "Julio 2026",
    fechaInicio: "2026-07-01",
    fechaFin: "2026-07-31",
    estado: "activo",
    penalizacionImporte: 2500,
    vendedores: [{ idUsuario: vend.idUsuario, objetivoBase: 1300 }],
    tarifasVN: [true, false].map((tasaCumplida) => ({ idModelo: modelo.idModelo, tasaCumplida, importes })),
    pendientes: [{ concepto: "Rappel de junio", importe: 5000, mesOrigen: "2026-06" }],
  });
  return { admin, vend, modelo, vn, plan: plan.plan };
}

describe("planes", () => {
  it("guarda y lee un plan completo, avisa de solapes y valida", async () => {
    const { plan } = await base();
    const leido = await leerPlan(db, plan.idPlan);
    expect(leido?.vendedores).toHaveLength(1);
    expect(leido?.tarifasVN).toHaveLength(2);
    expect(leido?.pendientes[0].importe).toBe(5000);
    await guardarPlan(db, null, { nombre: "Solape", fechaInicio: "2026-07-15", fechaFin: "2026-08-15" });
    const lista = await listarPlanes(db);
    expect(lista.find((p) => p.idPlan === plan.idPlan)?.solapadoCon).toHaveLength(1);
    await expect(guardarPlan(db, null, { nombre: "", fechaInicio: "2026-07-01", fechaFin: "2026-07-31" })).rejects.toThrow();
    await expect(guardarPlan(db, null, { nombre: "X", fechaInicio: "2026-08-01", fechaFin: "2026-07-31" })).rejects.toThrow();
  });

  it("un plan sin liquidaciones se puede borrar; con liquidaciones, no", async () => {
    const { plan, vend, modelo, vn } = await base();
    await db.insert(expedientes).values({ idUsuario: vend.idUsuario, idModelo: modelo.idModelo, idEstadoVehiculo: vn.idEstadoVehiculo, fechaMatriculacion: "2026-07-10" });
    await liquidar(db, { idPlan: plan.idPlan, mes: "2026-07" });
    await expect(eliminarPlan(db, plan.idPlan)).rejects.toMatchObject({ status: 409 });
    const otro = await guardarPlan(db, null, { nombre: "Otro", fechaInicio: "2026-09-01", fechaFin: "2026-09-30" });
    await eliminarPlan(db, otro.plan.idPlan);
    expect((await listarPlanes(db)).some((p) => p.idPlan === otro.plan.idPlan)).toBe(false);
  });
});

describe("flujo completo (Ejemplo 8 desde los servicios)", () => {
  it("al editar un expediente se recalcula solo y el mes cerrado se versiona", async () => {
    const { admin, vend, modelo, vn, plan } = await base();
    const creado = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_usuario: vend.idUsuario, id_modelo: modelo.idModelo, id_estado_vehiculo: vn.idEstadoVehiculo, fecha_matriculacion: "2026-07-10" } }));
    // El alta ya generó la liquidación de julio
    let liqs = await listarLiquidaciones(db, { idPlan: plan.idPlan });
    expect(liqs).toHaveLength(1);
    expect(liqs[0]).toMatchObject({ neto: 7500, puntosMes: 100, mesPago: "2026-08" }); // 100,00 € − penalización 25,00 €
    await cambiarEstadoLiquidacion(db, liqs[0].idLiquidation, "cerrada");

    const r = await actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: creado.id_expediente, expediente: { comision_coche_manual: 20000 } }));
    expect(r.impactos).toEqual([{ idVendedor: vend.idUsuario, mes: "2026-07", netoAnterior: 7500, netoNuevo: 17500, diferencia: 10000 }]);
    const detalle = await leerLiquidacion(db, liqs[0].idLiquidation);
    expect(detalle?.liquidacion).toMatchObject({ estado: "cerrada", version: 2, neto: 17500 });
    expect(detalle?.versiones).toHaveLength(1);
    expect(detalle?.versiones[0].diferencia).toBe(10000);
    expect(await db.select().from(commissionLiquidationVersions)).toHaveLength(1);

    // Mover la matriculación a agosto vacía julio (con versión) y los puntos del libro quedan en 0 + 0
    await actualizarExpedientes(db, admin, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: creado.id_expediente, expediente: { fecha_matriculacion: "2026-08-03" } }));
    liqs = await listarLiquidaciones(db, { idPlan: plan.idPlan });
    expect(liqs[0].neto).toBe(0);
    const libro = await leerLibro(db, vend.idUsuario, "2026-07");
    expect(libro.reduce((s, a) => s + a.puntos, 0)).toBe(0);
    expect(libro.length).toBeGreaterThanOrEqual(2);

    await eliminarExpedientes(db, admin, [creado.id_expediente]);
    expect((await listarLiquidaciones(db, { idPlan: plan.idPlan }))[0].neto).toBe(0);
  });

  it("cambiar las tarifas del plan recalcula sus liquidaciones", async () => {
    const { admin, vend, modelo, vn, plan } = await base();
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_usuario: vend.idUsuario, id_modelo: modelo.idModelo, id_estado_vehiculo: vn.idEstadoVehiculo, fecha_matriculacion: "2026-07-10" } }));
    const editable = (await leerPlan(db, plan.idPlan))!;
    const nuevas = editable.tarifasVN.map((t) => ({ ...t, importes: Object.fromEntries(Object.keys(t.importes).map((k) => [k, 30000])) }));
    await guardarPlan(db, plan.idPlan, { ...editable, tarifasVN: nuevas });
    expect((await listarLiquidaciones(db, { idPlan: plan.idPlan }))[0].neto).toBe(27500);
  });
});

describe("pendientes, previsión de nómina y cotejo", () => {
  it("previsión: neto del mes anterior + pendientes del plan + pendiente de cobro previsto", async () => {
    const { admin, vend, modelo, vn, plan } = await base();
    await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_usuario: vend.idUsuario, id_modelo: modelo.idModelo, id_estado_vehiculo: vn.idEstadoVehiculo, fecha_matriculacion: "2026-07-10" } }));
    const p = await crearPendiente(db, vend.idUsuario, { concepto: "Bonus pendiente", importe: 12000, mesNominaPrevisto: "2026-08" });
    await crearPendiente(db, vend.idUsuario, { concepto: "Atrasado", importe: 1000, mesNominaPrevisto: "2026-01" });
    const prev = await previsionNomina(db, vend.idUsuario);
    const agosto = prev.find((x) => x.mesPago === "2026-08")!;
    expect(agosto).toMatchObject({ neto: 7500, pendientesPlan: 5000, pendienteCobro: 12000, total: 24500 });
    const lista = await listarPendientes(db, vend.idUsuario, "2026-10");
    expect(lista.find((x) => x.concepto === "Atrasado")?.atrasado).toBe(true);
    await actualizarPendiente(db, vend.idUsuario, p.id, { concepto: "Bonus pendiente", importe: 12000, mesNominaPrevisto: "2026-08", cobrado: true, fechaCobro: "2026-08-30" });
    expect((await previsionNomina(db, vend.idUsuario)).find((x) => x.mesPago === "2026-08")?.pendienteCobro).toBe(0);
    void plan;
  });

  it("cotejo: totales validado, cobrado, pendiente y ratio", async () => {
    const { admin, vend, modelo, vn } = await base();
    const e = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ expediente: { id_usuario: vend.idUsuario, id_modelo: modelo.idModelo, id_estado_vehiculo: vn.idEstadoVehiculo, fecha_matriculacion: "2026-07-10" } }));
    let c = await cotejo(db, vend.idUsuario, "2026-07");
    expect(c).toMatchObject({ validado: 10000, cobrado: 0, pendiente: 10000, ratio: 0 });
    await marcarCobro(db, { idExpediente: e.id_expediente, concepto: "coche", cobrado: true });
    c = await cotejo(db, vend.idUsuario, "2026-07");
    expect(c).toMatchObject({ cobrado: 10000, pendiente: 0, ratio: 100 });
  });
});

describe("auditoría: casos límite", () => {
  it("el informe funciona en meses de 28, 30 y 31 días", async () => {
    const { vend } = await base();
    void vend;
    for (const hasta of ["2026-02", "2026-04", "2026-07"]) {
      const inf = await generarInforme(db, { desde: "2026-01", hasta });
      expect(inf.meses.at(-1)).toBe(hasta);
    }
  });

  it("no se elimina un usuario con historial de comisiones (409, no 500)", async () => {
    const { admin, vend, modelo, vn } = await base();
    await db.insert(expedientes).values({ idUsuario: vend.idUsuario, idModelo: modelo.idModelo, idEstadoVehiculo: vn.idEstadoVehiculo, fechaMatriculacion: "2026-07-10" });
    await liquidar(db, { idPlan: 1, mes: "2026-07" });
    await db.update(expedientes).set({ idUsuario: admin.idUsuario });
    await expect(eliminarUsuario(db, admin, vend.idUsuario)).rejects.toMatchObject({ status: 409 });
  });

  it("recalcular el mismo mes a la vez no duplica la liquidación", async () => {
    const { admin, vend, modelo, vn, plan } = await base();
    await db.insert(expedientes).values({ idUsuario: vend.idUsuario, idModelo: modelo.idModelo, idEstadoVehiculo: vn.idEstadoVehiculo, fechaMatriculacion: "2026-07-10" });
    void admin;
    await Promise.all([1, 2, 3].map(() => liquidar(db, { idPlan: plan.idPlan, mes: "2026-07" })));
    expect(await listarLiquidaciones(db, { idPlan: plan.idPlan })).toHaveLength(1);
  });
});
