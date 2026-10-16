import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { cotejarPagos } from "@/lib/cotejo-pagos";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { datosCotejo, esquemaGuardarRejillaCotejo, guardarRejillaCotejo } from "./cotejo";
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
