import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { pendientesCobro, rejillaFilas, rejillas } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { crearPendiente, eliminarPendiente } from "./comisiones-gestion";
import { filasPapelera, resumenPapelera, restaurar } from "./papelera";
import { eliminarRejilla, esquemaGuardarRejilla, guardarRejilla } from "./rejillas";

beforeEach(reiniciarBd);

const hoja = (mes: string, matriculas: string[]) => esquemaGuardarRejilla.parse({ mes, origen: "excel", filas: matriculas.map((m) => ({ matricula: m, importe: 5000, concepto: "Coche" })) });

describe("papelera de elementos sueltos", () => {
  it("una rejilla eliminada se guarda con sus filas y se restaura igual", async () => {
    const u = await crearUsuarioPrueba("vendedor", "Ana");
    await guardarRejilla(db, u.idUsuario, u.idUsuario, hoja("2026-07", ["1234BCD", "5678FGH"]));
    await eliminarRejilla(db, u.idUsuario, "2026-07");
    expect(await db.select().from(rejillas)).toHaveLength(0);
    const resumen = (await resumenPapelera(db)).find((c) => c.categoria === "elementos");
    expect(resumen).toMatchObject({ cantidad: 1, restaurable: true, porSubtipo: { rejilla: 1 } });
    const fila = (await filasPapelera(db, "elementos")).filas[0];
    expect(fila).toMatchObject({ subtipo: "rejilla", texto: expect.stringContaining("2026-07") });
    const r = await restaurar(db, { accion: "restaurar", categoria: "elementos", ids: [fila.id] });
    expect(r).toMatchObject({ restaurados: 1, bloqueados: 0 });
    const [cab] = await db.select().from(rejillas);
    expect(cab).toMatchObject({ mes: "2026-07", idUsuario: u.idUsuario });
    expect((await db.select().from(rejillaFilas).where(eq(rejillaFilas.idRejilla, cab.id))).map((f) => f.matricula).sort()).toEqual(["1234BCD", "5678FGH"]);
    expect((await filasPapelera(db, "elementos")).total).toBe(0);
  });

  it("al guardar otra rejilla del mismo mes, la anterior queda en la Papelera y no se restaura mientras haya otra", async () => {
    const u = await crearUsuarioPrueba("vendedor", "Ana");
    await guardarRejilla(db, u.idUsuario, u.idUsuario, hoja("2026-07", ["1111AAA"]));
    await guardarRejilla(db, u.idUsuario, u.idUsuario, hoja("2026-07", ["2222BBB"]));
    const fila = (await filasPapelera(db, "elementos")).filas[0];
    expect(fila.detalle).toMatch(/Sustituida/);
    const r = await restaurar(db, { accion: "restaurar", categoria: "elementos", ids: [fila.id] });
    expect(r.restaurados).toBe(0);
    expect(r.bloqueados).toBe(1);
    expect(r.detalle.join(" ")).toMatch(/ya hay otro igual/);
    // Sigue en la Papelera para poder restaurarla cuando se quite la otra
    expect((await filasPapelera(db, "elementos")).total).toBe(1);
  });

  it("un pendiente de cobro eliminado se restaura", async () => {
    const u = await crearUsuarioPrueba("vendedor", "Ana");
    const p = await crearPendiente(db, u.idUsuario, { concepto: "Bonus extra", importe: 12000 });
    await eliminarPendiente(db, u.idUsuario, p.id);
    expect(await db.select().from(pendientesCobro)).toHaveLength(0);
    const fila = (await filasPapelera(db, "elementos")).filas[0];
    expect(fila.subtipo).toBe("pendiente_cobro");
    await restaurar(db, { accion: "restaurar", categoria: "elementos", ids: [fila.id] });
    expect((await db.select().from(pendientesCobro))[0]).toMatchObject({ concepto: "Bonus extra", importe: 12000 });
  });
});
