import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { esquemaReglaAlerta } from "@/lib/alertas";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { fijarEstadoSemaforo, listarApuntes } from "./apuntes";
import { actualizarReglaAlerta, crearReglaAlerta, evaluarAlertas, misAlertas, posponerAlerta, reabrirAlerta, reevaluarTodas, resolverAlerta } from "./alertas";
import { esquemaActualizarExpediente, esquemaCrearExpediente } from "./expedientes";
import { actualizarExpedientes, crearExpediente } from "./expedientes-escritura";

beforeEach(reiniciarBd);

async function escenario() {
  const admin = await crearUsuarioPrueba("administrador", "Admin");
  const ana = await crearUsuarioPrueba("vendedor", "Ana");
  const otra = await crearUsuarioPrueba("vendedor", "Otra");
  const exp = await crearExpediente(db, ana, esquemaCrearExpediente.parse({ cliente: { nombre: "Cliente Uno", dni: "33333333P" }, expediente: {} }));
  return { admin, ana, otra, id: exp.id_expediente };
}
const guardar = (u: Awaited<ReturnType<typeof crearUsuarioPrueba>>, id: number, expediente: Record<string, unknown>) => actualizarExpedientes(db, u, esquemaActualizarExpediente.parse({ modo: "uno", id_expediente: id, expediente }));
const reglaSeguro = esquemaReglaAlerta.parse({
  nombre: "Contratar el seguro",
  mensaje: "Contrata el seguro de {cliente} ({matricula})",
  definicion: { combinar: "todas", condiciones: [{ campo: "matricula", operador: "no_vacio", valor: "" }, { campo: "estado_semaforo", operador: "es", valor: "Seguro: Seguro aún no solicitado" }] },
});

describe("alertas", () => {
  it("salta cuando el expediente pasa a cumplir la condición, no se repite y se resuelve sola al dejar de cumplirla", async () => {
    const { admin, ana, otra, id } = await escenario();
    await crearReglaAlerta(db, admin, reglaSeguro);
    expect((await misAlertas(db, ana)).pendientes).toHaveLength(0);
    // Pone la matrícula con el Seguro en rojo: salta, con los datos del expediente, solo para su vendedor
    await guardar(ana, id, { matricula: "1234ABC" });
    const { pendientes } = await misAlertas(db, ana);
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]).toMatchObject({ mensaje: "Contrata el seguro de Cliente Uno (1234ABC)", cliente: "Cliente Uno", id_expediente: id, regla: "Contratar el seguro" });
    expect((await misAlertas(db, otra)).pendientes).toHaveLength(0);
    // Guardar otra vez no la duplica
    await guardar(ana, id, { comentarios: "x" });
    expect((await misAlertas(db, ana)).pendientes).toHaveLength(1);
    // Contrata el seguro (pasa a amarillo): la alerta se resuelve sola
    const [seguro] = await listarApuntes(db, id);
    await fijarEstadoSemaforo(db, ana, seguro.id, 1);
    const despues = await misAlertas(db, ana);
    expect(despues.pendientes).toHaveLength(0);
    expect(despues.resueltas[0]).toMatchObject({ motivo: "automatica" });
    // Si vuelve a rojo, vuelve a saltar
    await fijarEstadoSemaforo(db, ana, seguro.id, 0);
    expect((await misAlertas(db, ana)).pendientes).toHaveLength(1);
  });

  it("«Hecho» y «Posponer»: lo hecho no vuelve a saltar, lo pospuesto vuelve cuando llega su hora", async () => {
    const { admin, ana, id } = await escenario();
    await crearReglaAlerta(db, admin, reglaSeguro);
    await guardar(ana, id, { matricula: "1234ABC" });
    const [a] = (await misAlertas(db, ana)).pendientes;
    await posponerAlerta(db, ana, a.id, new Date(Date.now() + 3_600_000));
    let r = await misAlertas(db, ana);
    expect(r.pendientes).toHaveLength(0);
    expect(r.pospuestas).toHaveLength(1);
    await expect(posponerAlerta(db, ana, a.id, new Date(Date.now() - 1000))).rejects.toThrow(/no válida/);
    // Llega su hora
    await db.execute(sql`update alertas set pospuesta_hasta = now() - interval '1 minute'`);
    r = await misAlertas(db, ana);
    expect(r.pendientes).toHaveLength(1);
    await resolverAlerta(db, ana, a.id);
    await guardar(ana, id, { comentarios: "otra vez" });
    r = await misAlertas(db, ana);
    expect(r.pendientes).toHaveLength(0);
    expect(r.resueltas[0]).toMatchObject({ motivo: "hecho" });
    await reabrirAlerta(db, ana, a.id);
    expect((await misAlertas(db, ana)).pendientes).toHaveLength(1);
  });

  it("puede avisar también al administrador, solo el administrador cambia las reglas y se puede revisar todo", async () => {
    const { admin, ana, otra, id } = await escenario();
    await expect(crearReglaAlerta(db, ana, reglaSeguro)).rejects.toThrow(/administrador/);
    const regla = await crearReglaAlerta(db, admin, { ...reglaSeguro, avisar_admin: true });
    await guardar(ana, id, { matricula: "1234ABC" });
    expect((await misAlertas(db, admin)).pendientes).toHaveLength(1);
    await expect(resolverAlerta(db, otra, (await misAlertas(db, ana)).pendientes[0].id)).rejects.toThrow(/no encontrada/);
    // Apagar la regla resuelve lo abierto
    await actualizarReglaAlerta(db, admin, regla.id, { ...reglaSeguro, activa: false, avisar_admin: true });
    await evaluarAlertas(db, [id]);
    expect((await misAlertas(db, ana)).pendientes).toHaveLength(0);
    // «Revisar ahora» crea las que falten en los expedientes que ya existen
    await actualizarReglaAlerta(db, admin, regla.id, { ...reglaSeguro, activa: true, avisar_admin: false });
    expect(await reevaluarTodas(db, admin)).toBe(1);
    expect((await misAlertas(db, ana)).pendientes).toHaveLength(1);
  });
});
