import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { cotejarPagos } from "@/lib/cotejo-pagos";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { corregirRejillaCotejo, datosCotejo, esquemaCorregirRejilla, esquemaGuardarRejillaCotejo, guardarRejillaCotejo } from "./cotejo";
import { guardarRejilla } from "./rejillas";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";

beforeEach(reiniciarBd);

describe("cotejo de pagos (servicio)", () => {
  it("guarda una rejilla por mes y la sustituye al volver a subirla", async () => {
    const v = await crearUsuarioPrueba("vendedor");
    await guardarRejillaCotejo(db, v.idUsuario, v.idUsuario, esquemaGuardarRejillaCotejo.parse({ mes: "2026-03", matriculas: ["1234 bcd", "1234BCD", "9999XYZ"] }));
    let datos = await datosCotejo(db, v.idUsuario);
    expect(datos.rejillas).toHaveLength(1);
    expect(datos.rejillas[0].filas).toBe(2);
    await guardarRejillaCotejo(db, v.idUsuario, v.idUsuario, esquemaGuardarRejillaCotejo.parse({ mes: "2026-03", matriculas: ["1111AAA"] }));
    datos = await datosCotejo(db, v.idUsuario);
    expect(datos.pagos.map((p) => p.matricula)).toEqual(["1111AAA"]);
  });

  it("corrige a mano las matrículas de una rejilla guardada: añade y quita sin tocar las demás filas ni las rejillas de otros", async () => {
    const v = await crearUsuarioPrueba("vendedor");
    const otro = await crearUsuarioPrueba("vendedor");
    await guardarRejilla(db, v.idUsuario, v.idUsuario, { mes: "2026-03", origen: "excel", filas: [{ matricula: "1234BCD", importe: 6000, cliente: "Ana" }, { matricula: "6000GDD", importe: null }] });
    await guardarRejillaCotejo(db, otro.idUsuario, otro.idUsuario, esquemaGuardarRejillaCotejo.parse({ mes: "2026-03", matriculas: ["7777JKL"] }));
    const r = await corregirRejillaCotejo(db, v.idUsuario, esquemaCorregirRejilla.parse({ mes: "2026-03", matriculas: ["1234 bcd", "6698nsj", "6698NSJ"] }));
    expect(r).toEqual({ anadidas: 1, quitadas: 1 });
    const datos = await datosCotejo(db, v.idUsuario);
    expect(datos.pagos.map((p) => p.matricula).sort()).toEqual(["1234BCD", "6698NSJ"]);
    // La fila que se queda conserva su importe; la añadida a mano queda como revisada
    expect(datos.pagos.find((p) => p.matricula === "1234BCD")?.importe).toBe(6000);
    expect(datos.pagos.find((p) => p.matricula === "6698NSJ")?.confirmada).toBe(true);
    expect((await datosCotejo(db, otro.idUsuario)).pagos.map((p) => p.matricula)).toEqual(["7777JKL"]);
    await expect(corregirRejillaCotejo(db, v.idUsuario, { mes: "2026-05", matriculas: ["1111BBB"] })).rejects.toThrow(/No hay rejilla/);
    expect(() => esquemaCorregirRejilla.parse({ mes: "2026-03", matriculas: [] })).toThrow();
  });

  it("cruza los expedientes del vendedor con su rejilla y no mezcla vendedores", async () => {
    const v = await crearUsuarioPrueba("vendedor");
    const otro = await crearUsuarioPrueba("vendedor");
    const crear = (u: typeof v, nombre: string, matricula: string) =>
      crearExpediente(db, u, esquemaCrearExpediente.parse({ cliente: { nombre }, expediente: { matricula, fecha_matriculacion: "2026-03-10" } }));
    await crear(v, "Ana Ruiz", "1234BCD");
    await crear(v, "Luis Gil", "5555FGH");
    await crear(otro, "Ajeno", "7777JKL");
    await guardarRejillaCotejo(db, v.idUsuario, v.idUsuario, esquemaGuardarRejillaCotejo.parse({ mes: "2026-03", matriculas: ["1234BCD"] }));

    const datos = await datosCotejo(db, v.idUsuario);
    expect(datos.coches.map((c) => c.cliente).sort()).toEqual(["Ana Ruiz", "Luis Gil"]);
    const r = cotejarPagos(datos.coches, datos.pagos);
    expect(r.filas.find((f) => f.matricula === "1234BCD")?.estado).toBe("pagado");
    expect(r.filas.find((f) => f.matricula === "5555FGH")?.estado).toBe("no_pagado");
  });

  it("rechaza meses y matrículas no válidos", () => {
    expect(() => esquemaGuardarRejillaCotejo.parse({ mes: "2026-13", matriculas: ["1"] })).toThrow();
    expect(() => esquemaGuardarRejillaCotejo.parse({ mes: "2026-03", matriculas: [] })).toThrow();
  });
});
