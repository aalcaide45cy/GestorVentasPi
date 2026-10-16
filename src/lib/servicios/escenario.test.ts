import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { commissionPlans, estadoVehiculo, expedientes, marcas, modelos } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { calcularEscenario } from "./escenario";
import { guardarPlan, leerPlan } from "./planes";

beforeEach(reiniciarBd);

const importes = (v: number) => Object.fromEntries([-4, -3, -2, -1, 0, 1, 2, 3].map((t) => [String(t), v]));

async function montar() {
  const vend = await crearUsuarioPrueba("vendedor", "Vendedor");
  const [marca] = await db.insert(marcas).values({ nombre: "Renault" }).returning();
  const [modelo] = await db.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: "Clio" }).returning();
  const [vn] = await db.select().from(estadoVehiculo).where(eq(estadoVehiculo.clase, "VN")).limit(1);
  const { plan } = await guardarPlan(db, null, {
    nombre: "Julio",
    fechaInicio: "2026-07-01",
    fechaFin: "2026-07-31",
    estado: "activo",
    penalizacionImporte: 0,
    vendedores: [{ idUsuario: vend.idUsuario, objetivoBase: 200 }],
    tarifasVN: [true, false].map((tasaCumplida) => ({ idModelo: modelo.idModelo, tasaCumplida, importes: importes(10000) })),
  });
  for (let i = 0; i < 3; i++) await db.insert(expedientes).values({ idUsuario: vend.idUsuario, idModelo: modelo.idModelo, idEstadoVehiculo: vn.idEstadoVehiculo, fechaMatriculacion: "2026-07-10" });
  return { vend, modelo, plan };
}

describe("laboratorio de comisiones (escenario)", () => {
  it("sin cambios el escenario es idéntico al real y expone los valores editables", async () => {
    const { vend, modelo } = await montar();
    const r = await calcularEscenario(db, vend.idUsuario, "2026-07", {});
    expect(r.hayPlan).toBe(true);
    expect(r.escenario).toEqual(r.base);
    expect(r.cambios).toBe(0);
    expect(r.plan?.objetivoBase).toBe(200);
    expect(r.plan?.tarifas.map((t) => [t.idModelo, t.tasaCumplida])).toEqual([[modelo.idModelo, true], [modelo.idModelo, false]]);
    // 3 coches × 1,00 = 3,00 puntos frente a X = 2,00 → X+1; tasa 0/3 no cumplida → 3 × 100 €
    expect(r.base).toMatchObject({ puntosMes: 300, tramo: 1, bruto: 30000 });
  });

  it("mover el objetivo X cambia el tramo y las tarifas; el real no se toca", async () => {
    const { vend, plan } = await montar();
    const r = await calcularEscenario(db, vend.idUsuario, "2026-07", { objetivoBase: 100 });
    expect(r.escenario?.tramo).toBe(2);
    expect(r.base?.tramo).toBe(1);
    expect(r.cambios).toBe(1);
    expect((await leerPlan(db, plan.idPlan))?.vendedores[0].objetivoBase).toBe(200);
    const tras = await db.select().from(commissionPlans).where(eq(commissionPlans.idPlan, plan.idPlan));
    expect(tras).toHaveLength(1);
  });

  it("cambiar una tarifa en el tramo actual mueve el neto en la diferencia exacta", async () => {
    const { vend, modelo } = await montar();
    const r = await calcularEscenario(db, vend.idUsuario, "2026-07", { tarifas: [{ idModelo: modelo.idModelo, tasaCumplida: false, tramo: 1, importe: 25000 }] });
    expect(r.escenario!.neto - r.base!.neto).toBe(3 * 15000);
  });

  it("rechaza un vendedor que no existe y avisa si no hay plan", async () => {
    const { vend } = await montar();
    await expect(calcularEscenario(db, 99999, "2026-07", {})).rejects.toMatchObject({ status: 404 });
    const sinPlan = await calcularEscenario(db, vend.idUsuario, "2027-01", {});
    expect(sinPlan.hayPlan).toBe(false);
  });
});
