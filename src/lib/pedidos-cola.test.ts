import { beforeEach, describe, expect, it } from "vitest";
import type { ResultadoPedido } from "@/lib/servicios/documentos";

// La cola usa localStorage del navegador: se simula uno mínimo
const almacen = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => void almacen.set(k, v) }, addEventListener: () => undefined, removeEventListener: () => undefined },
  configurable: true,
});

const pedido = { datos: {}, adjunto: { id: 1 }, metodo: "texto-pdf" } as unknown as ResultadoPedido;

describe("cola de pedidos", () => {
  beforeEach(async () => {
    almacen.clear();
    const { vaciarCola } = await import("./pedidos-cola");
    vaciarCola();
  });

  it("admite hasta 100 pedidos y avisa de los huecos libres", async () => {
    const { MAXIMO_COLA, anadirACola, huecosEnCola, leerCola } = await import("./pedidos-cola");
    expect(MAXIMO_COLA).toBe(100);
    expect(huecosEnCola()).toBe(100);
    anadirACola(Array.from({ length: 100 }, (_, i) => ({ nombre: `p${i}.pdf`, pedido, eleccion: null, idExpediente: null })));
    expect(leerCola().items).toHaveLength(100);
    expect(huecosEnCola()).toBe(0);
  });

  it("quitar un pedido libera un hueco", async () => {
    const { anadirACola, huecosEnCola, quitarDeCola } = await import("./pedidos-cola");
    const [uno] = anadirACola([{ nombre: "a.pdf", pedido, eleccion: null, idExpediente: null }]);
    expect(huecosEnCola()).toBe(99);
    quitarDeCola(uno.id);
    expect(huecosEnCola()).toBe(100);
  });
});
