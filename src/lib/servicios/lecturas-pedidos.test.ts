import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { lecturasPedidos } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { accionLecturas, encolarLectura, listarLecturas, reanudarLecturas, registroLecturas } from "./lecturas-pedidos";

beforeEach(async () => {
  process.env.LECTORES_PEDIDOS = "3";
  delete (globalThis as Record<string, unknown>).__lectoresPedidos;
  await reiniciarBd();
});

const hoja = (lineas: string[], ruido = 0) =>
  sharp({ create: { width: 1240, height: 1754, channels: 3, background: "#fff" } })
    .composite([{ input: Buffer.from(`<svg width="1240" height="1754" xmlns="http://www.w3.org/2000/svg">${lineas.map((t, i) => `<text x="60" y="${120 + i * 70}" font-size="42" font-family="Arial">${t}</text>`).join("")}<rect x="1000" y="1600" width="${10 + ruido}" height="10"/></svg>`) }])
    .png()
    .toBuffer();

async function esperarFin(idUsuario: number) {
  for (let i = 0; i < 240; i++) {
    const { resumen, lecturas } = await listarLecturas(db, idUsuario);
    if (resumen.pendientes === 0 && resumen.leyendo === 0) return { resumen, lecturas };
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Las lecturas no terminaron a tiempo");
}

describe("lecturas de pedidos en paralelo", () => {
  it("guarda al subir, lee en segundo plano y separa pedidos, descartados y repetidos sin perder ninguno", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const pedido = await hoja(["PEDIDO DE VEHICULO NUEVO", "RENAULT RETAIL GROUP", "CLIENTE Sr. D. Juan Perez Garcia   ESTABLECIMIENTO"]);
    const ajeno = await hoja(["FICHA DE MANTENIMIENTO DEL TALLER", "Nombre: Juan Perez Garcia   NIF 12345678Z", "Telefono 600123123  Observaciones varias del taller"]);

    const a = await encolarLectura(db, u.idUsuario, "pedido.png", pedido, null, false);
    const b = await encolarLectura(db, u.idUsuario, "ficha.png", ajeno, null, false);
    const c = await encolarLectura(db, u.idUsuario, "pedido-otra-vez.png", pedido, null, false);
    expect(c.estado).toBe("descartado"); // mismo archivo: ni se guarda para leer
    await expect(encolarLectura(db, u.idUsuario, "nota.txt", Buffer.from("hola"), null, false)).rejects.toMatchObject({ status: 415 });

    const { resumen, lecturas } = await esperarFin(u.idUsuario);
    const por = Object.fromEntries(lecturas.map((l) => [l.id, l]));
    expect(por[a.id].estado).toBe("pedido");
    expect(por[a.id].resultado?.datos.esPedido).toBe(true);
    expect(por[b.id].estado).toBe("descartado");
    expect(por[c.id].estado).toBe("descartado");
    expect(resumen).toMatchObject({ pedidos: 1, descartados: 2, errores: 0, lectores: 3 });

    // Del pedido no queda el fichero en la lista (pasa a ser un adjunto); del descartado se guarda una semana por si se quiere rescatar
    const filas = await db.select({ id: lecturasPedidos.id, datos: lecturasPedidos.datos }).from(lecturasPedidos);
    expect(filas.find((f) => f.id === a.id)?.datos).toBeNull();
    expect(filas.find((f) => f.id === b.id)?.datos).not.toBeNull();

    // Recoger el pedido lo quita de la lista
    expect(await accionLecturas(db, u.idUsuario, { accion: "recoger", ids: [a.id] })).toBe(1);
    expect(await accionLecturas(db, u.idUsuario, { accion: "limpiar" })).toBe(2);
    expect((await listarLecturas(db, u.idUsuario)).lecturas).toHaveLength(0);
  }, 120_000);

  it("retoma lo que estaba leyéndose al reiniciar y cancela lo pendiente", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const pedido = await hoja(["PEDIDO DE VEHICULO NUEVO", "RENAULT RETAIL GROUP", "CLIENTE Sr. D. Ana Lopez   ESTABLECIMIENTO"], 5);
    const { cifrarBuffer } = await import("@/lib/auth/cifrado");
    const [f] = await db.insert(lecturasPedidos).values({ idUsuario: u.idUsuario, nombre: "a medias.png", tamano: pedido.length, huella: "x".repeat(64), datos: cifrarBuffer(pedido), estado: "leyendo" }).returning();
    await reanudarLecturas();
    const { lecturas } = await esperarFin(u.idUsuario);
    expect(lecturas.find((l) => l.id === f.id)?.estado).toBe("pedido");

    const [g] = await db.insert(lecturasPedidos).values({ idUsuario: u.idUsuario, nombre: "luego.png", tamano: 1, huella: "y".repeat(64), datos: cifrarBuffer(pedido), estado: "error", error: "fallo" }).returning();
    expect(await accionLecturas(db, u.idUsuario, { accion: "reintentar", ids: [g.id] })).toBe(1);
    await esperarFin(u.idUsuario);
  }, 120_000);

  it("un fallo de lectura no hace desaparecer el pedido: pasa a la cola para rellenarlo a mano, y todo queda en el registro", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const roto = Buffer.from("%PDF-1.4\nesto no es un pdf de verdad");
    const ajeno = await hoja(["FICHA DE MANTENIMIENTO DEL TALLER", "Nombre: Juan Perez Garcia   NIF 12345678Z", "Telefono 600123123  Observaciones varias del taller"]);
    const a = await encolarLectura(db, u.idUsuario, "roto.pdf", roto, null, false);
    const b = await encolarLectura(db, u.idUsuario, "ficha.png", ajeno, null, false);
    const { lecturas } = await esperarFin(u.idUsuario);

    // El roto llega a la cola con los datos vacíos y un aviso; el ignorado se conserva para poder rescatarlo
    const rota = lecturas.find((l) => l.id === a.id);
    expect(rota?.estado).toBe("pedido");
    expect(rota?.resultado?.datos.avisos[0]).toMatch(/No se pudo leer automáticamente/);
    expect(rota?.resultado?.adjunto.id).toBeGreaterThan(0);
    expect(lecturas.find((l) => l.id === b.id)?.estado).toBe("descartado");

    // Rescatar el ignorado lo manda también a la cola
    expect(await accionLecturas(db, u.idUsuario, { accion: "rescatar", ids: [b.id] })).toBe(1);
    expect((await listarLecturas(db, u.idUsuario)).lecturas.find((l) => l.id === b.id)?.estado).toBe("pedido");

    // Anotar qué se hizo y verlo en el registro
    await accionLecturas(db, u.idUsuario, { accion: "recoger", ids: [a.id] });
    expect(await accionLecturas(db, u.idUsuario, { accion: "resolver", ids: [a.id], resolucion: "quitado" })).toBe(1);
    const registro = await registroLecturas(db, u.idUsuario, false);
    expect(registro).toHaveLength(2);
    const r = registro.find((x) => x.id === a.id);
    expect(r).toMatchObject({ estado: "pedido", resolucion: "quitado" });
    expect(r?.error).toBeTruthy();
  }, 120_000);
});
