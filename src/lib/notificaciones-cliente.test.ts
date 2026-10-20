import { beforeEach, describe, expect, it } from "vitest";
import { MAX_DIAS, MAX_NOTIFICACIONES, contarNoLeidas, depurar, leerRegistro, marcarTodasLeidas, quitarNotificacion, registrarNotificacion, suscribirRegistro, usarAlmacen, vaciarRegistro, type Almacen } from "./notificaciones-cliente";

function almacenDePrueba(): Almacen & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v) };
}

let alm: ReturnType<typeof almacenDePrueba>;
beforeEach(() => {
  alm = almacenDePrueba();
  usarAlmacen(alm);
});

describe("registro de notificaciones", () => {
  it("anota cada aviso con su fecha y detalles, y lo recuerda tras recargar la página", () => {
    registrarNotificacion({ tipo: "exito", titulo: "Copia", texto: "Hecho", detalles: ["a", "b"] }, new Date("2026-10-20T10:00:00Z"));
    registrarNotificacion({ tipo: "error", texto: "Falló" }, new Date("2026-10-20T11:00:00Z"));
    const lista = leerRegistro();
    expect(lista.map((n) => [n.tipo, n.texto, n.titulo, n.detalles])).toEqual([["exito", "Hecho", "Copia", ["a", "b"]], ["error", "Falló", null, []]]);
    expect(contarNoLeidas(lista)).toBe(2);
    // «Recarga»: la memoria se vacía y se vuelve a leer del almacén
    usarAlmacen(alm);
    expect(leerRegistro()).toHaveLength(2);
  });

  it("marcar como leídas, quitar una y vaciar avisan a quien escucha", () => {
    let avisos = 0;
    const baja = suscribirRegistro(() => avisos++);
    const a = registrarNotificacion({ tipo: "aviso", texto: "x" });
    registrarNotificacion({ tipo: "aviso", texto: "y" });
    marcarTodasLeidas();
    expect(contarNoLeidas(leerRegistro())).toBe(0);
    quitarNotificacion(a.id);
    expect(leerRegistro().map((n) => n.texto)).toEqual(["y"]);
    vaciarRegistro();
    expect(leerRegistro()).toEqual([]);
    expect(avisos).toBe(5);
    baja();
    registrarNotificacion({ tipo: "exito", texto: "z" });
    expect(avisos).toBe(5);
  });

  it("no pasa del máximo de entradas ni guarda las de hace más de dos meses, y tolera datos corruptos", () => {
    const ahora = new Date("2026-10-20T10:00:00Z");
    registrarNotificacion({ tipo: "exito", texto: "vieja" }, new Date(ahora.getTime() - (MAX_DIAS + 1) * 86_400_000));
    for (let i = 0; i < MAX_NOTIFICACIONES + 20; i++) registrarNotificacion({ tipo: "exito", texto: `n${i}` }, ahora);
    const lista = leerRegistro();
    expect(lista).toHaveLength(MAX_NOTIFICACIONES);
    expect(lista.some((n) => n.texto === "vieja")).toBe(false);
    expect(lista[lista.length - 1].texto).toBe(`n${MAX_NOTIFICACIONES + 19}`);

    alm.datos.set("gv-notificaciones", "esto no es json");
    usarAlmacen(alm);
    expect(leerRegistro()).toEqual([]);
    expect(depurar([{ id: 1 }, null, "x"])).toEqual([]);
  });

  it("sin almacenamiento disponible sigue funcionando mientras la página está abierta", () => {
    usarAlmacen({ getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } });
    registrarNotificacion({ tipo: "exito", texto: "hola" });
    expect(leerRegistro().map((n) => n.texto)).toEqual(["hola"]);
  });
});
