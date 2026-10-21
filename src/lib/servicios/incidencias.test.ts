import { inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { incidencias } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { anotarIncidencia, cambiarIncidencias, crearIncidenciaManual, depurarIncidencias, eliminarIncidencias, instalarIncidencias, leerCaptura, leerIncidencia, listarIncidencias, registrarIncidencia, resumenIncidencias, volcarIncidencias } from "./incidencias";

beforeEach(reiniciarBd);

describe("centro de incidencias", () => {
  it("junta las repeticiones, cuenta las veces y reabre una resuelta que vuelve a ocurrir", async () => {
    const a = await registrarIncidencia(db, { origen: "servidor", titulo: "Fallo con el expediente 12", ruta: "GET /api/expedientes/12" });
    const b = await registrarIncidencia(db, { origen: "servidor", titulo: "Fallo con el expediente 99", ruta: "GET /api/expedientes/99" }, 4);
    expect(b).toBe(a);
    expect(await leerIncidencia(db, a)).toMatchObject({ veces: 5, estado: "nueva" });
    await cambiarIncidencias(db, [a], { estado: "resuelta", nota: "arreglado" });
    await registrarIncidencia(db, { origen: "servidor", titulo: "Fallo con el expediente 5", ruta: "GET /api/expedientes/5" });
    expect(await leerIncidencia(db, a)).toMatchObject({ veces: 6, estado: "nueva", nota: "arreglado" });
    // Una ignorada sigue ignorada aunque se repita
    await cambiarIncidencias(db, [a], { estado: "ignorada" });
    await registrarIncidencia(db, { origen: "servidor", titulo: "Fallo con el expediente 7", ruta: "GET /api/expedientes/7" });
    expect((await leerIncidencia(db, a))?.estado).toBe("ignorada");
  });

  it("no guarda datos personales ni claves", async () => {
    const id = await registrarIncidencia(db, { origen: "navegador", titulo: "Error con ana@correo.es", detalle: "password=secreta y DNI 12345678Z" });
    const i = await leerIncidencia(db, id);
    expect(`${i?.titulo} ${i?.detalle}`).not.toMatch(/ana@correo|secreta|12345678Z/);
  });

  it("filtra, resume (los errores nuevos encienden el aviso) y elimina", async () => {
    await registrarIncidencia(db, { origen: "servidor", titulo: "Error uno" });
    await registrarIncidencia(db, { origen: "rendimiento", nivel: "aviso", titulo: "Petición lenta" });
    const c = await registrarIncidencia(db, { origen: "navegador", titulo: "Error dos" });
    expect(await resumenIncidencias(db)).toMatchObject({ nuevasErrores: 2, nuevasAvisos: 1, total: 3 });
    expect((await listarIncidencias(db, { nivel: "aviso" })).map((i) => i.titulo)).toEqual(["Petición lenta"]);
    expect((await listarIncidencias(db, { origen: "navegador" })).map((i) => i.id)).toEqual([c]);
    await cambiarIncidencias(db, [c], { estado: "revisada" });
    expect((await resumenIncidencias(db)).nuevasErrores).toBe(1);
    expect(await eliminarIncidencias(db, [c])).toBe(1);
    expect((await listarIncidencias(db)).length).toBe(2);
  });

  it("el aviso manual guarda la captura cifrada y no se junta con otros", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const a = await crearIncidenciaManual(db, { texto: "El botón no hace nada\nal pulsar guardar", ruta: "/dashboard/clientes", contexto: { pasos: ["pulsa Guardar"] }, idUsuario: u.idUsuario, version: "1.9.0", captura: { mime: "image/png", datos: png } });
    const b = await crearIncidenciaManual(db, { texto: "El botón no hace nada\nal pulsar guardar", ruta: "/dashboard/clientes", contexto: {}, idUsuario: u.idUsuario, version: "1.9.0" });
    expect(a).not.toBe(b);
    const i = await leerIncidencia(db, a);
    expect(i).toMatchObject({ origen: "manual", titulo: "El botón no hace nada", idUsuario: u.idUsuario });
    expect(i?.capturas).toHaveLength(1);
    expect((await leerCaptura(db, i!.capturas[0]))?.datos.equals(png)).toBe(true);
    await expect(crearIncidenciaManual(db, { texto: "  ", ruta: null, contexto: {}, idUsuario: null, version: null })).rejects.toMatchObject({ status: 400 });
  });

  it("agrupa en memoria los sucesos del servidor y los vuelca de una vez", async () => {
    instalarIncidencias(db, "1.9.0");
    for (let i = 0; i < 25; i++) anotarIncidencia({ origen: "servidor", titulo: `Fallo repetido número ${i}`, ruta: "POST /api/x" });
    anotarIncidencia({ origen: "equipo", nivel: "aviso", titulo: "temperatura alta" });
    expect(await volcarIncidencias(db)).toBe(2);
    const lista = await listarIncidencias(db);
    expect(lista.find((i) => i.origen === "servidor")).toMatchObject({ veces: 25 });
    expect(await volcarIncidencias(db)).toBe(0);
  });

  it("depura las cerradas antiguas y deja las abiertas", async () => {
    const vieja = await registrarIncidencia(db, { origen: "servidor", titulo: "Vieja resuelta" });
    const abierta = await registrarIncidencia(db, { origen: "servidor", titulo: "Vieja abierta" });
    const reciente = await registrarIncidencia(db, { origen: "servidor", titulo: "Reciente resuelta" });
    await cambiarIncidencias(db, [vieja, reciente], { estado: "resuelta" });
    await db.update(incidencias).set({ ultimaVez: new Date(Date.now() - 60 * 24 * 3600_000) }).where(inArray(incidencias.id, [vieja, abierta]));
    expect(await depurarIncidencias(db)).toBe(1);
    expect((await listarIncidencias(db)).map((i) => i.id).sort()).toEqual([abierta, reciente].sort());
  });
});
