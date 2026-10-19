import { existsSync, readdirSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { lecturasPedidos } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { adjuntos } from "@/db/schema";
import { cifrarBuffer } from "@/lib/auth/cifrado";
import { accionLecturas, ajustarLectores, encolarLectura, listarLecturas, procesar, reanudarLecturas, registroLecturas } from "./lecturas-pedidos";
import { guardarAjustesOcr, olvidarAjustesOcr } from "./ocr-ajustes";

const ficherosEnEspera = () => (existsSync(process.env.LECTURAS_DIR as string) ? readdirSync(process.env.LECTURAS_DIR as string) : []);

beforeEach(async () => {
  process.env.LECTURAS_DIR = mkdtempSync(path.join(os.tmpdir(), "gv-lecturas-"));
  process.env.LECTORES_PEDIDOS = "3";
  delete (globalThis as Record<string, unknown>).__lectoresPedidos;
  await reiniciarBd();
  // Las pruebas de siempre son con lectura automática; la manual (la de por defecto) se prueba aparte
  olvidarAjustesOcr();
  await guardarAjustesOcr(db, { lecturaManual: false });
  // «Retomar lo que quedó a medias» ocurre una vez al arrancar el servidor, no en cada consulta: aquí se hace al principio de cada prueba
  await reanudarLecturas();
});

const hoja = (lineas: string[], ruido = 0) =>
  sharp({ create: { width: 1240, height: 1754, channels: 3, background: "#fff" } })
    .composite([{ input: Buffer.from(`<svg width="1240" height="1754" xmlns="http://www.w3.org/2000/svg">${lineas.map((t, i) => `<text x="60" y="${120 + i * 70}" font-size="42" font-family="Arial">${t}</text>`).join("")}<rect x="1000" y="1600" width="${10 + ruido}" height="10"/></svg>`) }])
    .png()
    .toBuffer();

async function esperarFin(idUsuario: number) {
  for (let i = 0; i < 240; i++) {
    const { resumen, lecturas: pedidos } = await listarLecturas(db, idUsuario);
    if (resumen.pendientes === 0 && resumen.leyendo === 0 && resumen.subiendo === 0) {
      // La lista corta trae los pedidos; los ignorados, con error o cancelados van aparte
      const { lecturas: otros } = await listarLecturas(db, idUsuario, { otros: true });
      return { resumen, lecturas: [...pedidos, ...otros] };
    }
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

    // Ni del pedido (pasa a ser un adjunto) ni del ignorado queda el fichero guardado; del ignorado sí el principio de lo leído
    const filas = await db.select({ id: lecturasPedidos.id, datos: lecturasPedidos.datos }).from(lecturasPedidos);
    expect(filas.every((f) => f.datos === null)).toBe(true);
    // Los ficheros esperaban en disco (no en la base) y ya no queda ninguno
    expect(ficherosEnEspera()).toEqual([]);
    expect(por[b.id].error).toMatch(/^No es un pedido: «FICHA/);

    // Recoger el pedido lo quita de la lista
    expect(await accionLecturas(db, u.idUsuario, { accion: "recoger", ids: [a.id] })).toBe(1);
    expect(await accionLecturas(db, u.idUsuario, { accion: "limpiar" })).toBe(2);
    expect((await listarLecturas(db, u.idUsuario)).lecturas).toHaveLength(0);
    expect((await listarLecturas(db, u.idUsuario, { otros: true })).lecturas).toHaveLength(0);
  }, 120_000);

  it("en una subida por lotes no se lee nada hasta «iniciar», y un lote abandonado empieza solo pasado un rato", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const pedido = await hoja(["PEDIDO DE VEHICULO NUEVO", "RENAULT RETAIL GROUP", "CLIENTE Sr. D. Eva Ruiz   ESTABLECIMIENTO"], 9);
    const a = await encolarLectura(db, u.idUsuario, "uno.png", pedido, null, false, true);
    expect(a.estado).toBe("subiendo");
    await new Promise((r) => setTimeout(r, 1500));
    const { resumen } = await listarLecturas(db, u.idUsuario);
    expect(resumen).toMatchObject({ subiendo: 1, pendientes: 0, leyendo: 0, pedidos: 0 });
    expect(ficherosEnEspera()).toHaveLength(1);

    expect(await accionLecturas(db, u.idUsuario, { accion: "iniciar" })).toBe(1);
    const fin = await esperarFin(u.idUsuario);
    expect(fin.lecturas.find((l) => l.id === a.id)?.estado).toBe("pedido");

    // Abandonado: se retrasa su fecha y la siguiente consulta lo pone a leer
    const b = await encolarLectura(db, u.idUsuario, "dos.png", await hoja(["PEDIDO DE VEHICULO NUEVO", "RENAULT RETAIL GROUP", "CLIENTE Sr. D. Eva Ruiz   ESTABLECIMIENTO"], 21), null, false, true);
    await db.update(lecturasPedidos).set({ creadaEn: new Date(Date.now() - 5 * 60 * 1000) }).where(eq(lecturasPedidos.id, b.id));
    const fin2 = await esperarFin(u.idUsuario);
    expect(fin2.lecturas.find((l) => l.id === b.id)?.estado).toBe("pedido");

    // Cancelar también cancela lo que sigue subido sin iniciar
    const c = await encolarLectura(db, u.idUsuario, "tres.png", await hoja(["PEDIDO DE VEHICULO NUEVO", "RENAULT RETAIL GROUP", "CLIENTE Sr. D. Eva Ruiz   ESTABLECIMIENTO"], 33), null, false, true);
    expect(await accionLecturas(db, u.idUsuario, { accion: "cancelar" })).toBe(1);
    expect((await listarLecturas(db, u.idUsuario, { otros: true })).lecturas.find((l) => l.id === c.id)?.estado).toBe("cancelado");
    expect(ficherosEnEspera()).toEqual([]);
    rmSync(process.env.LECTURAS_DIR as string, { recursive: true, force: true });
  }, 120_000);

  it("retoma lo que estaba leyéndose al reiniciar y cancela lo pendiente", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const pedido = await hoja(["PEDIDO DE VEHICULO NUEVO", "RENAULT RETAIL GROUP", "CLIENTE Sr. D. Ana Lopez   ESTABLECIMIENTO"], 5);
    const { cifrarBuffer } = await import("@/lib/auth/cifrado");
    delete (globalThis as Record<string, unknown>).__lectoresPedidos; // como si el servidor acabara de arrancar
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

    // El roto llega a la cola con los datos vacíos y un aviso
    const rota = lecturas.find((l) => l.id === a.id);
    expect(rota?.estado).toBe("pedido");
    expect(rota?.resultado?.datos.avisos[0]).toMatch(/No se pudo leer automáticamente/);
    expect(rota?.resultado?.adjunto.id).toBeGreaterThan(0);
    expect(lecturas.find((l) => l.id === b.id)?.estado).toBe("descartado");

    // Del ignorado no se conserva el fichero: no se puede rescatar (hay que volver a cargarlo)
    expect(await accionLecturas(db, u.idUsuario, { accion: "rescatar", ids: [b.id] })).toBe(0);

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

const pedidoPrueba = (variante: number) => hoja(["PEDIDO DE VEHICULO NUEVO", "RENAULT RETAIL GROUP", "CLIENTE Sr. D. Eva Ruiz   ESTABLECIMIENTO"], variante);

describe("lectura manual: nada se lee hasta «Iniciar lectura»", () => {
  it("lo subido espera sin pasar a leerse, aunque pase el rato; el aviso automático del navegador no la inicia, el botón sí", async () => {
    await guardarAjustesOcr(db, { lecturaManual: true });
    const u = await crearUsuarioPrueba("vendedor");
    const a = await encolarLectura(db, u.idUsuario, "uno.png", await pedidoPrueba(41), null, false, true);
    // Pasado más de un minuto y medio: en automático ya se habría puesto a leer solo
    await db.update(lecturasPedidos).set({ creadaEn: new Date(Date.now() - 10 * 60 * 1000) }).where(eq(lecturasPedidos.id, a.id));
    await new Promise((r) => setTimeout(r, 800));
    const { resumen } = await listarLecturas(db, u.idUsuario);
    expect(resumen).toMatchObject({ manual: true, subiendo: 1, pendientes: 0, leyendo: 0 });

    // El «iniciar» que manda el navegador al terminar de subir no hace nada en lectura manual
    expect(await accionLecturas(db, u.idUsuario, { accion: "iniciar", automatico: true })).toBe(0);
    expect((await listarLecturas(db, u.idUsuario)).resumen.subiendo).toBe(1);

    // El botón «Iniciar lectura» sí empieza (y se puede iniciar solo algunos con ids)
    expect(await accionLecturas(db, u.idUsuario, { accion: "iniciar" })).toBe(1);
    const fin = await esperarFin(u.idUsuario);
    expect(fin.lecturas.find((l) => l.id === a.id)?.estado).toBe("pedido");
    expect(fin.resumen.manual).toBe(true);
  }, 120_000);
});

describe("cancelar subida y lectura sin dejar nada a medias", () => {
  it("la lista «lo que falta» trae lo subido, en espera y leyéndose, y se puede cancelar un pedido suelto", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const mk = (nombre: string, estado: string, h: string) => db.insert(lecturasPedidos).values({ idUsuario: u.idUsuario, nombre, tamano: 1, huella: h.repeat(64).slice(0, 64), estado, datos: cifrarBuffer(Buffer.from("x")) }).returning();
    const [s1] = await mk("subido.pdf", "subiendo", "a");
    // (una fila «pendiente» la cogería enseguida un lector: se prueba con «subiendo», que espera igual)
    const [p1] = await mk("espera.pdf", "subiendo", "b");
    const [l1] = await mk("leyendo.pdf", "leyendo", "c");
    const { enMarcha } = await listarLecturas(db, u.idUsuario);
    expect(enMarcha.map((x) => [x.nombre, x.estado])).toEqual([["subido.pdf", "subiendo"], ["espera.pdf", "subiendo"], ["leyendo.pdf", "leyendo"]]);

    // Solo ese pedido: los demás siguen
    expect(await accionLecturas(db, u.idUsuario, { accion: "cancelar", ids: [p1.id] })).toBe(1);
    expect((await listarLecturas(db, u.idUsuario)).enMarcha.map((x) => x.id)).toEqual([s1.id, l1.id]);
    // Sin ids: todo lo que esté en marcha, también lo que se estaba leyendo
    expect(await accionLecturas(db, u.idUsuario, { accion: "cancelar" })).toBe(2);
    const { enMarcha: vacia } = await listarLecturas(db, u.idUsuario);
    expect(vacia).toHaveLength(0);
    const filas = await db.select().from(lecturasPedidos).where(eq(lecturasPedidos.idUsuario, u.idUsuario));
    expect(filas.every((f) => f.estado === "cancelado" && f.datos === null && f.ruta === null)).toBe(true);
  });

  it("si se cancela mientras se está leyendo, se tira el resultado y no queda ningún documento guardado", async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const pedido = await pedidoPrueba(57);
    const [f] = await db.insert(lecturasPedidos).values({ idUsuario: u.idUsuario, nombre: "se cancela.png", tamano: pedido.length, huella: "z".repeat(64), datos: cifrarBuffer(pedido), estado: "leyendo" }).returning();
    const leyendo = procesar(db, { id: f.id, id_usuario: u.idUsuario, nombre: "se cancela.png", datos: cifrarBuffer(pedido), ruta: null, permitir_duplicados: false });
    // Se cancela con la lectura ya en marcha
    await new Promise((r) => setTimeout(r, 150));
    expect(await accionLecturas(db, u.idUsuario, { accion: "cancelar", ids: [f.id] })).toBe(1);
    await leyendo;
    const [despues] = await db.select().from(lecturasPedidos).where(eq(lecturasPedidos.id, f.id));
    expect(despues).toMatchObject({ estado: "cancelado", resultado: null });
    expect(await db.select().from(adjuntos)).toHaveLength(0);
  }, 120_000);
});

describe("ajuste automático de lecturas simultáneas", () => {
  const sobrado = { cpu: 40, memoriaLibre: 0.6, enEspera: 50, activos: 2 };
  it("sube de una en una mientras haya trabajo y sobren CPU y memoria, sin pasar del máximo", () => {
    expect(ajustarLectores(2, sobrado, 20)).toBe(3);
    expect(ajustarLectores(3, { ...sobrado, activos: 3 }, 20)).toBe(4);
    expect(ajustarLectores(20, { ...sobrado, activos: 20 }, 20)).toBe(20);
  });
  it("no sube si no hay nada esperando, si no están todas las plazas ocupadas o si el equipo va justo", () => {
    expect(ajustarLectores(2, { ...sobrado, enEspera: 0 }, 20)).toBe(2);
    expect(ajustarLectores(5, { ...sobrado, activos: 3 }, 20)).toBe(5);
    expect(ajustarLectores(4, { ...sobrado, activos: 4, cpu: 80 }, 20)).toBe(4);
    expect(ajustarLectores(4, { ...sobrado, activos: 4, memoriaLibre: 0.15 }, 20)).toBe(4);
  });
  it("baja de una en una cuando el consumo se acerca al límite, y nunca por debajo de una", () => {
    expect(ajustarLectores(10, { ...sobrado, activos: 10, cpu: 96 }, 20)).toBe(9);
    expect(ajustarLectores(10, { ...sobrado, activos: 10, memoriaLibre: 0.05 }, 20)).toBe(9);
    expect(ajustarLectores(1, { ...sobrado, activos: 1, cpu: 99 }, 20)).toBe(1);
  });
});
