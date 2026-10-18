import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { guardarRejilla } from "@/lib/servicios/rejillas";
import { cambiarMesRejilla, detalleRejilla, listarRejillas, resumenLiquidacionMes } from "@/lib/servicios/rejillas-visor";

beforeEach(reiniciarBd);

describe("visor de rejillas", () => {
  it("lista, abre y cambia de mes una rejilla guardada", async () => {
    const v = await crearUsuarioPrueba("vendedor");
    const id = await guardarRejilla(db, v.idUsuario, v.idUsuario, { mes: "2026-06", origen: "manual", nombreArchivo: "a.csv", totalHoja: 10000, filas: [{ matricula: "1234ABC", cliente: "Ana", financiacion: null, concepto: "Comisión", importe: 10000, textoOriginal: null, confianza: null }] });
    const lista = await listarRejillas(db, v.idUsuario);
    expect(lista).toHaveLength(1);
    expect(lista[0].filas).toBe(1);
    expect((await detalleRejilla(db, id)).filas[0].matricula).toBe("1234ABC");
    await cambiarMesRejilla(db, { id, mes: "2026-07" });
    expect((await listarRejillas(db, null))[0].mes).toBe("2026-07");
    const otra = await guardarRejilla(db, v.idUsuario, v.idUsuario, { mes: "2026-06", origen: "manual", filas: [{ matricula: "9999ZZZ", importe: 100 }] } as never);
    await expect(cambiarMesRejilla(db, { id: otra, mes: "2026-07" })).rejects.toThrow();
  });
  it("el resumen sin plan no inventa cifras", async () => {
    const v = await crearUsuarioPrueba("vendedor");
    const r = await resumenLiquidacionMes(db, v.idUsuario, "2026-06");
    expect(r.hayPlan).toBe(false);
    expect(r.porCoche).toEqual([]);
  });
});
