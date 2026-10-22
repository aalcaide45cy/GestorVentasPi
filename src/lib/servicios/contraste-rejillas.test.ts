import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { esquemaGuardarRejillaCotejo, guardarRejillaCotejo } from "./cotejo";
import { datosContraste } from "./contraste-rejillas";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";

beforeEach(reiniciarBd);

describe("contraste de rejillas (servicio)", () => {
  it("junta las rejillas y los expedientes de cada vendedor, o de todos, y avisa de lo repetido y de lo que no figura", async () => {
    const v = await crearUsuarioPrueba("vendedor", "Vendedor Uno");
    const otro = await crearUsuarioPrueba("vendedor", "Vendedor Dos");
    const crear = (u: typeof v, nombre: string, matricula: string, fecha = "2026-03-10") =>
      crearExpediente(db, u, esquemaCrearExpediente.parse({ cliente: { nombre }, expediente: { matricula, fecha_matriculacion: fecha } }));
    await crear(v, "Ana Ruiz", "1234BCD");
    await crear(v, "Luis Gil", "5555FGH");
    await crear(otro, "Ajeno", "7777JKL");
    await guardarRejillaCotejo(db, v.idUsuario, v.idUsuario, esquemaGuardarRejillaCotejo.parse({ mes: "2026-03", matriculas: ["1234 bcd", "0001ZZZ"] }));
    await guardarRejillaCotejo(db, v.idUsuario, v.idUsuario, esquemaGuardarRejillaCotejo.parse({ mes: "2026-04", matriculas: ["1234BCD"] }));

    const mio = await datosContraste(db, v.idUsuario);
    expect(mio.resumen).toMatchObject({ rejillas: 2, matriculas: 3, repetidas: 2, sinExpediente: 1, otroMes: 1, sinPagar: 1 });
    const repetida = mio.filas.filter((f) => f.matricula === "1234BCD");
    expect(repetida.map((f) => f.mes)).toEqual(["2026-04", "2026-03"]);
    expect(repetida.every((f) => f.repetidaEn.length === 1 && f.expediente?.cliente === "Ana Ruiz")).toBe(true);
    expect(mio.sinPagar.map((s) => s.expediente.cliente)).toEqual(["Luis Gil"]);

    // El administrador, con todos: entra también el expediente del otro vendedor (sin pagar y sin rejilla de su mes)
    const todos = await datosContraste(db, null);
    expect(todos.sinPagar.map((s) => s.expediente.cliente).sort()).toEqual(["Ajeno", "Luis Gil"]);
    expect(todos.sinPagar.find((s) => s.expediente.cliente === "Ajeno")).toMatchObject({ estado: "sin_rejilla", expediente: { vendedor: "Vendedor Dos" } });
  });
});
