import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  commissionLiquidationVersions,
  commissionLiquidations,
  commissionPlanModelRates,
  commissionPlanVendedores,
  commissionPlans,
  estadoVehiculo,
  expedientes,
  libroPuntos,
  marcas,
  modelos,
} from "@/db/schema";
import { mesesAfectados } from "@/lib/comisiones";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { cargarExpedientesMotor, recalcularAfectados, recalcularMes as recalcular } from "./liquidaciones";

const recalcularMes = (_db: typeof db, id: number, mes: string, motivo: string) => db.transaction((tx) => recalcular(tx, id, mes, motivo));

beforeEach(reiniciarBd);

const importes = Object.fromEntries([-4, -3, -2, -1, 0, 1, 2, 3].map((t) => [String(t), 10000]));

async function escenario() {
  const v1 = await crearUsuarioPrueba("vendedor", "Vendedor 1");
  const v2 = await crearUsuarioPrueba("vendedor", "Vendedor 2");
  const [marca] = await db.insert(marcas).values({ nombre: "Renault" }).returning();
  const [modelo] = await db.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: "Clio" }).returning();
  const [plan] = await db
    .insert(commissionPlans)
    .values({ nombre: "Julio", fechaInicio: "2026-07-01", fechaFin: "2026-07-31", estado: "activo" })
    .returning();
  await db.insert(commissionPlanVendedores).values([
    { idPlan: plan.idPlan, idUsuario: v1.idUsuario },
    { idPlan: plan.idPlan, idUsuario: v2.idUsuario },
  ]);
  for (const tasaCumplida of [true, false]) {
    await db.insert(commissionPlanModelRates).values({ idPlan: plan.idPlan, idModelo: modelo.idModelo, tasaCumplida, importes });
  }
  const [nuevo] = await db.select().from(estadoVehiculo).where(eq(estadoVehiculo.clase, "VN")).limit(1);
  return { v1, v2, modelo, plan, estado: nuevo };
}

async function nuevoExpediente(e: Awaited<ReturnType<typeof escenario>>, idUsuario: number, fecha: string, manual: number | null = null) {
  const [x] = await db
    .insert(expedientes)
    .values({ idUsuario, idModelo: e.modelo.idModelo, idEstadoVehiculo: e.estado.idEstadoVehiculo, fechaMatriculacion: fecha, comisionCocheManual: manual })
    .returning();
  return x;
}

describe("liquidaciones persistidas", () => {
  it("calcula, guarda y es idempotente (T24)", async () => {
    const esc = await escenario();
    await nuevoExpediente(esc, esc.v1.idUsuario, "2026-07-10");
    const a = await recalcularMes(db, esc.v1.idUsuario, "2026-07", "alta");
    expect(a.netoNuevo).toBe(10000);
    expect(a.apuntesLibro).toBe(1);
    const b = await recalcularMes(db, esc.v1.idUsuario, "2026-07", "otra vez");
    expect(b.cambio).toBe(false);
    expect(b.apuntesLibro).toBe(0);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(libroPuntos);
    expect(n).toBe(1);
  });

  it("T23 un mes cerrado se corrige guardando la versión anterior", async () => {
    const esc = await escenario();
    const x = await nuevoExpediente(esc, esc.v1.idUsuario, "2026-07-10", 160000);
    await recalcularMes(db, esc.v1.idUsuario, "2026-07", "alta");
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.recalculo', 'on', true)`);
      await tx.update(commissionLiquidations).set({ estado: "cerrada" });
    });
    await db.update(expedientes).set({ comisionCocheManual: 175000 }).where(eq(expedientes.idExpediente, x.idExpediente));
    const r = await recalcularMes(db, esc.v1.idUsuario, "2026-07", "corrección");
    expect(r.versionGuardada).toBe(true);
    expect(r.netoAnterior).toBe(160000);
    expect(r.netoNuevo).toBe(175000);
    const [liq] = await db.select().from(commissionLiquidations);
    expect(liq).toMatchObject({ estado: "cerrada", version: 2, neto: 175000 });
    const versiones = await db.select().from(commissionLiquidationVersions);
    expect(versiones).toHaveLength(1);
    expect(versiones[0]).toMatchObject({ netoAnterior: 160000, netoNuevo: 175000, motivo: "corrección", version: 1 });
  });

  it("T26 reasignar recalcula a los dos vendedores y el libro queda neto", async () => {
    const esc = await escenario();
    const x = await nuevoExpediente(esc, esc.v1.idUsuario, "2026-07-10");
    await recalcularMes(db, esc.v1.idUsuario, "2026-07", "alta");
    const antes = (await cargarExpedientesMotor(db, esc.v1.idUsuario))[0];
    await db.update(expedientes).set({ idUsuario: esc.v2.idUsuario }).where(eq(expedientes.idExpediente, x.idExpediente));
    const despues = (await cargarExpedientesMotor(db, esc.v2.idUsuario))[0];
    const afectados = mesesAfectados(antes, despues);
    expect(afectados.map((a) => a.idVendedor)).toEqual([esc.v1.idUsuario, esc.v2.idUsuario]);
    await db.transaction((tx) => recalcularAfectados(tx, afectados, "reasignación"));
    const suma = async (id: number) =>
      (await db.select({ s: sql<number>`coalesce(sum(${libroPuntos.puntos}), 0)::int` }).from(libroPuntos).where(eq(libroPuntos.idUsuario, id)))[0].s;
    expect(await suma(esc.v1.idUsuario)).toBe(0);
    expect(await suma(esc.v2.idUsuario)).toBe(100);
    const liqs = await db.select().from(commissionLiquidations);
    expect(liqs.find((l) => l.idUsuario === esc.v1.idUsuario)?.neto).toBe(0);
    expect(liqs.find((l) => l.idUsuario === esc.v2.idUsuario)?.neto).toBe(10000);
  });
});

describe("protecciones de la base de datos", () => {
  it("rechaza modificar liquidaciones fuera de un recálculo y versiones y libro siempre", async () => {
    const esc = await escenario();
    await nuevoExpediente(esc, esc.v1.idUsuario, "2026-07-10");
    await recalcularMes(db, esc.v1.idUsuario, "2026-07", "alta");
    await expect(db.update(commissionLiquidations).set({ neto: 1 })).rejects.toThrow();
    await expect(db.delete(commissionLiquidations)).rejects.toThrow();
    await expect(db.update(libroPuntos).set({ puntos: 5 })).rejects.toThrow();
    await expect(db.delete(libroPuntos)).rejects.toThrow();
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.recalculo', 'on', true)`);
        await tx.delete(libroPuntos);
      }),
    ).rejects.toThrow();
  });

  it("no deja borrar un plan con liquidaciones ni una promoción en uso", async () => {
    const esc = await escenario();
    await nuevoExpediente(esc, esc.v1.idUsuario, "2026-07-10");
    await recalcularMes(db, esc.v1.idUsuario, "2026-07", "alta");
    await expect(db.delete(commissionPlans).where(eq(commissionPlans.idPlan, esc.plan.idPlan))).rejects.toThrow();
  });
});
