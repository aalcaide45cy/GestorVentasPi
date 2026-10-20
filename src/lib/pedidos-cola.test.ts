import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultadoPedido } from "@/lib/servicios/documentos";

// La cola usa localStorage del navegador: se simula uno mínimo (contando cuántas veces se escribe)
const almacen = new Map<string, string>();
let escrituras = 0;
Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: {
      getItem: (k: string) => almacen.get(k) ?? null,
      setItem: (k: string, v: string) => {
        escrituras++;
        almacen.set(k, v);
      },
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  },
  configurable: true,
});

const pedido = { datos: {}, adjunto: { id: 1 }, metodo: "texto-pdf" } as unknown as ResultadoPedido;
const nuevo = (i: number) => ({ nombre: `p${i}.pdf`, pedido, eleccion: null, idExpediente: null });

describe("cola de pedidos", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    const { vaciarCola, guardarColaYa } = await import("./pedidos-cola");
    vaciarCola();
    guardarColaYa();
    almacen.clear();
    escrituras = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("no tiene tope: caben más de mil pedidos", async () => {
    const { anadirACola, leerCola } = await import("./pedidos-cola");
    anadirACola(Array.from({ length: 1500 }, (_, i) => nuevo(i)));
    expect(leerCola().items).toHaveLength(1500);
  });

  it("quitar un pedido lo saca de la cola", async () => {
    const { anadirACola, leerCola, quitarDeCola } = await import("./pedidos-cola");
    const [uno] = anadirACola([nuevo(1)]);
    quitarDeCola(uno.id);
    expect(leerCola().items).toHaveLength(0);
  });

  it("los cambios seguidos se guardan en el navegador de una sola vez, y al cerrar se guarda ya", async () => {
    const { anadirACola, guardarColaYa, quitarDeCola } = await import("./pedidos-cola");
    const items = anadirACola(Array.from({ length: 50 }, (_, i) => nuevo(i)));
    for (const i of items.slice(0, 40)) quitarDeCola(i.id);
    // Cuarenta y un cambios y todavía no se ha escrito nada (antes se reescribía toda la cola en cada uno)
    expect(escrituras).toBe(0);
    vi.advanceTimersByTime(700);
    expect(escrituras).toBe(1);
    expect(JSON.parse(almacen.get("gv_cola_pedidos")!)).toHaveLength(10);
    // Un cambio nuevo se guarda también si la página se cierra antes de que pase el tiempo
    quitarDeCola(items[45].id);
    guardarColaYa();
    expect(JSON.parse(almacen.get("gv_cola_pedidos")!)).toHaveLength(9);
  });
});
