import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { incidencias, incidenciasCapturas } from "@/db/schema";
import { reiniciarBd } from "../../../tests/ayudas";
import { crearIncidenciaManual, leerCaptura } from "./incidencias";
import { estadoReenvio, generarClaveRecepcion, guardarDestino, recibirReporteRemoto, reenviarPendientes } from "./incidencias-remotas";

beforeEach(reiniciarBd);
afterEach(() => vi.unstubAllGlobals());

const reporte = { equipo: "Mac de Alfonso", idRemoto: 7, titulo: "No se ve el cliente", detalle: null, ruta: "/dashboard/clientes", contexto: { pasos: ["abre"] }, version: "1.19.0", creadaEn: "2026-10-22T10:00:00.000Z" };

describe("reportes de fallo desde otros equipos", () => {
  it("el principal solo acepta con su clave, y un mismo reporte no se duplica", async () => {
    await expect(recibirReporteRemoto(db, "x", reporte)).rejects.toMatchObject({ status: 404 });
    const clave = await generarClaveRecepcion(db);
    await expect(recibirReporteRemoto(db, "otra", reporte)).rejects.toMatchObject({ status: 401 });
    const a = await recibirReporteRemoto(db, clave, { ...reporte, captura: { mime: "image/png", base64: Buffer.from("pngfalso").toString("base64") } });
    expect(a.repetido).toBe(false);
    const b = await recibirReporteRemoto(db, clave, reporte);
    expect(b).toMatchObject({ id: a.id, repetido: true });
    const filas = await db.select().from(incidencias);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ origen: "manual", equipo: "Mac de Alfonso", titulo: "No se ve el cliente" });
    const caps = await db.select().from(incidenciasCapturas);
    expect(caps).toHaveLength(1);
    expect((await leerCaptura(db, caps[0].id))?.datos.toString()).toBe("pngfalso");
  });

  it("un equipo secundario reenvía sus reportes (con captura) y, si no hay conexión, los deja en cola y reintenta", async () => {
    // Se simula el servidor principal con la misma base de datos: lo que se "manda" lo recibe recibirReporteRemoto
    const clave = await generarClaveRecepcion(db);
    await guardarDestino(db, { url: "https://principal.example", clave, nombreEquipo: "Mac de prueba" });
    await crearIncidenciaManual(db, { texto: "Falla algo", ruta: "/x", contexto: {}, idUsuario: null, version: "1.0.0", captura: { mime: "image/png", datos: Buffer.from("imagen") } });
    expect((await estadoReenvio(db)).pendientes).toBe(1);

    // Sin conexión: queda en cola
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin red")));
    const sinRed = await reenviarPendientes(db);
    expect(sinRed).toMatchObject({ enviados: 0, pendientes: 1 });
    expect((await estadoReenvio(db)).ultimoError).toMatch(/sin red/);

    // Con conexión: llega, y no se vuelve a mandar
    const llamadas: { url: string; cuerpo: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
        const cuerpo = JSON.parse(init.body) as Record<string, unknown>;
        llamadas.push({ url, cuerpo });
        await recibirReporteRemoto(db, init.headers.Authorization.replace("Bearer ", ""), cuerpo as never);
        return new Response(JSON.stringify({ success: true }), { status: 201 });
      }),
    );
    // El "principal" y el "secundario" comparten aquí la tabla: el reenviado se anota con otro equipo, así que se cuenta por su huella
    const r = await reenviarPendientes(db);
    expect(r.enviados).toBe(1);
    expect(llamadas[0].url).toBe("https://principal.example/api/incidencias/remota");
    expect(llamadas[0].cuerpo).toMatchObject({ equipo: "Mac de prueba", titulo: "Falla algo", captura: { mime: "image/png" } });
    expect((await estadoReenvio(db)).pendientes).toBe(0);
    expect((await reenviarPendientes(db)).enviados).toBe(0);
  });

  it("lo que ya existía antes de configurar el reenvío no se manda", async () => {
    await crearIncidenciaManual(db, { texto: "Antiguo", ruta: null, contexto: {}, idUsuario: null, version: null });
    await new Promise((r) => setTimeout(r, 20));
    const clave = await generarClaveRecepcion(db);
    await guardarDestino(db, { url: "https://principal.example", clave });
    expect((await estadoReenvio(db)).pendientes).toBe(0);
  });
});
