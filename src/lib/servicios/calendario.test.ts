import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { esquemaEvento } from "@/lib/calendario";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { misAlertas, posponerAlerta, resolverAlerta, eliminarAlerta } from "./alertas";
import { actualizarEvento, crearEvento, eliminarEvento, generarAvisosCalendario, leerCalendario } from "./calendario";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";

beforeEach(reiniciarBd);

const nota = (extra: Record<string, unknown> = {}) => esquemaEvento.parse({ titulo: "Llamar al banco", fecha: "2026-10-30", ...extra });
const fechaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("calendario", () => {
  it("cada uno ve sus notas y las compartidas de otros; solo el dueño o el administrador las cambia", async () => {
    const admin = await crearUsuarioPrueba("administrador", "Admin");
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const otra = await crearUsuarioPrueba("vendedor", "Otra");
    const privada = await crearEvento(db, ana, nota({ titulo: "Privada" }));
    const compartida = await crearEvento(db, ana, nota({ titulo: "Para todos", compartido: true }));
    const verAna = (await leerCalendario(db, ana, "2026-10-01", "2026-10-31", false)).eventos;
    expect(verAna.map((e) => e.titulo).sort()).toEqual(["Para todos", "Privada"]);
    const verOtra = (await leerCalendario(db, otra, "2026-10-01", "2026-10-31", false)).eventos;
    expect(verOtra.map((e) => [e.titulo, e.mio, e.autor])).toEqual([["Para todos", false, "Ana"]]);
    await expect(actualizarEvento(db, otra, compartida.id, nota({ titulo: "Mía ahora" }))).rejects.toThrow(/Solo quien creó/);
    await expect(eliminarEvento(db, otra, privada.id)).rejects.toThrow(/Solo quien creó/);
    await actualizarEvento(db, admin, privada.id, nota({ titulo: "Cambiada por el admin" }));
    await eliminarEvento(db, ana, compartida.id);
    expect((await leerCalendario(db, ana, "2026-10-01", "2026-10-31", false)).eventos.map((e) => e.titulo)).toEqual(["Cambiada por el admin"]);
  });

  it("las notas que se repiten salen en cada día que toca, dentro del rango", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    await crearEvento(db, ana, nota({ titulo: "Revisión semanal", fecha: "2026-10-05", repeticion: "semanal" }));
    const r = (await leerCalendario(db, ana, "2026-10-01", "2026-10-31", false)).eventos;
    expect(r.map((e) => e.dia)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    await expect(crearEvento(db, ana, nota({ repeticion: "diaria", repetir_hasta: "2026-10-01" }))).rejects.toThrow(/Repetir hasta/);
    await expect(crearEvento(db, ana, nota({ id_expediente: 9999 }))).rejects.toThrow(/No existe el expediente/);
  });

  it("la capa de expedientes enseña las fechas de mis expedientes, y el administrador las de todos", async () => {
    const admin = await crearUsuarioPrueba("administrador", "Admin");
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const otra = await crearUsuarioPrueba("vendedor", "Otra");
    const e = await crearExpediente(db, ana, esquemaCrearExpediente.parse({ cliente: { nombre: "Cliente Uno", dni: "33333333P" }, expediente: { fecha_entrega: "2026-10-20", matricula: "1234ABC" } }));
    const dias = (await leerCalendario(db, ana, "2026-10-01", "2026-10-31", true)).fechasExpedientes;
    expect(dias).toMatchObject([{ dia: "2026-10-20", tipo: "entrega", id_expediente: e.id_expediente, cliente: "Cliente Uno", matricula: "1234ABC" }]);
    expect((await leerCalendario(db, ana, "2026-10-01", "2026-10-31", false)).fechasExpedientes).toEqual([]);
    expect((await leerCalendario(db, otra, "2026-10-01", "2026-10-31", true)).fechasExpedientes).toEqual([]);
    expect((await leerCalendario(db, admin, "2026-10-01", "2026-10-31", true)).fechasExpedientes).toHaveLength(1);
  });

  it("los recordatorios llegan como alertas, una sola vez aunque se eliminen, y no si la nota está hecha", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const hoy = fechaLocal(new Date());
    const hace = new Date(Date.now() - 10 * 60_000);
    const hora = `${String(hace.getHours()).padStart(2, "0")}:${String(hace.getMinutes()).padStart(2, "0")}`;
    const ev = await crearEvento(db, ana, nota({ titulo: "Llamar al cliente", fecha: hoy, hora, recordatorios: [0] }));
    // Un recordatorio que aún no ha llegado (dentro de una hora) no avisa
    const futuro = new Date(Date.now() + 3_600_000);
    await crearEvento(db, ana, nota({ titulo: "Más tarde", fecha: fechaLocal(futuro), hora: `${String(futuro.getHours()).padStart(2, "0")}:${String(futuro.getMinutes()).padStart(2, "0")}`, recordatorios: [0] }));
    const r = await misAlertas(db, ana);
    expect(r.pendientes).toHaveLength(1);
    expect(r.pendientes[0]).toMatchObject({ id_expediente: null, id_evento: ev.id, regla: "📅 Calendario", mensaje: `Llamar al cliente · ${hora}` });
    // No se duplica al volver a mirar
    expect(await generarAvisosCalendario(db, ana)).toBe(0);
    // Hecho y eliminada: no vuelve a salir
    await resolverAlerta(db, ana, r.pendientes[0].id);
    await eliminarAlerta(db, ana, r.pendientes[0].id);
    const otra = await misAlertas(db, ana);
    expect(otra.pendientes).toHaveLength(0);
    expect(otra.resueltas).toHaveLength(0);
    // Una nota marcada como hecha resuelve sus avisos abiertos
    const ev2 = await crearEvento(db, ana, nota({ titulo: "Otra", fecha: hoy, hora, recordatorios: [0, 5] }));
    expect((await misAlertas(db, ana)).pendientes.length).toBeGreaterThan(0);
    await actualizarEvento(db, ana, ev2.id, nota({ titulo: "Otra", fecha: hoy, hora, recordatorios: [0, 5], hecho: true }));
    expect((await misAlertas(db, ana)).pendientes).toHaveLength(0);
  });

  it("la capa de alertas enseña las pendientes en hoy y las pospuestas el día y la hora en que vuelven", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const hoy = fechaLocal(new Date());
    const hace = new Date(Date.now() - 10 * 60_000);
    const hora = `${String(hace.getHours()).padStart(2, "0")}:${String(hace.getMinutes()).padStart(2, "0")}`;
    await crearEvento(db, ana, nota({ titulo: "Aviso uno", fecha: hoy, hora, recordatorios: [0] }));
    await crearEvento(db, ana, nota({ titulo: "Aviso dos", fecha: hoy, hora, recordatorios: [5] }));
    const [uno, dos] = (await misAlertas(db, ana)).pendientes;
    const manana = new Date(Date.now() + 26 * 3_600_000);
    await posponerAlerta(db, ana, uno.id, manana);
    const r = await leerCalendario(db, ana, fechaLocal(new Date(Date.now() - 86_400_000)), fechaLocal(new Date(Date.now() + 3 * 86_400_000)), false, true);
    expect(r.alertas.map((a) => [a.estado, a.dia, a.id])).toEqual([["pendiente", hoy, dos.id], ["pospuesta", fechaLocal(manana), uno.id]]);
    expect(r.alertas.find((a) => a.estado === "pospuesta")?.hora).toMatch(/^\d\d:\d\d$/);
    expect((await leerCalendario(db, ana, "2026-01-01", "2026-01-31", false, true)).alertas).toEqual([]);
    expect((await leerCalendario(db, ana, hoy, hoy, false, false)).alertas).toEqual([]);
  });

  it("un recordatorio con «1 día antes» avisa un día antes de la nota", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const manana = new Date(Date.now() + 24 * 3_600_000);
    const hora = `${String(new Date(Date.now() - 60_000).getHours()).padStart(2, "0")}:${String(new Date(Date.now() - 60_000).getMinutes()).padStart(2, "0")}`;
    await crearEvento(db, ana, nota({ titulo: "Cita", fecha: fechaLocal(manana), hora, recordatorios: [1440] }));
    const r = await misAlertas(db, ana);
    expect(r.pendientes).toHaveLength(1);
    expect(r.pendientes[0].mensaje).toContain("Cita");
  });
});
