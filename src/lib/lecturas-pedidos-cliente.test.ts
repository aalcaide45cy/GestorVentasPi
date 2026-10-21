import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Llamada {
  url: string;
  metodo: string;
  cuerpo: string | null;
}

let llamadas: Llamada[] = [];
let siguienteId = 100;

/** Servidor falso: acepta las subidas (con un id cada una), responde la lista y anota todo lo demás. */
function servidorFalso() {
  llamadas = [];
  siguienteId = 100;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      llamadas.push({ url, metodo, cuerpo: typeof init?.body === "string" ? init.body : null });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });
      if (metodo === "POST" && url.startsWith("/api/documentos/lecturas")) return json({ id: siguienteId++, estado: "subiendo" }, 201);
      if (metodo === "GET") return json({ resumen: { subiendo: 0, pendientes: 0, leyendo: 0, pedidos: 0, descartados: 0, repetidos: 0, errores: 0, lectores: 2, maximo: 2, manual: true }, lecturas: [], enMarcha: [] });
      return json({ afectadas: 0 });
    }),
  );
}

const pdf = (nombre: string) => new File([new Uint8Array([37, 80, 68, 70])], nombre, { type: "application/pdf" });
const patches = () => llamadas.filter((l) => l.metodo === "PATCH").map((l) => JSON.parse(l.cuerpo ?? "{}") as { accion: string; ids?: number[]; automatico?: boolean });

beforeEach(() => {
  vi.resetModules();
  servidorFalso();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cancelar una subida de pedidos", () => {
  it("«Eliminar todo lo subido» cancela en el servidor solo los pedidos de esa tanda", async () => {
    const c = await import("./lecturas-pedidos-cliente");
    await c.subirPedidos([pdf("a.pdf"), pdf("b.pdf")], {});
    const subidas = llamadas.filter((l) => l.metodo === "POST");
    expect(subidas).toHaveLength(2);
    // Al terminar de subir, el navegador pide «iniciar» marcándolo como automático (el servidor lo ignora en lectura manual)
    expect(patches()).toContainEqual({ accion: "iniciar", automatico: true });

    await c.cancelarLecturas({ eliminar: true });
    const cancelar = patches().find((p) => p.accion === "cancelar");
    expect(cancelar?.ids?.sort()).toEqual([100, 101]);
  });

  it("«Dejarlo subido» solo para la subida: no cancela nada en el servidor", async () => {
    const c = await import("./lecturas-pedidos-cliente");
    await c.subirPedidos([pdf("a.pdf")], {});
    llamadas.length = 0;
    await c.cancelarLecturas({ eliminar: false });
    expect(patches().filter((p) => p.accion === "cancelar")).toHaveLength(0);
  });

  it("sin nada subido en la tanda, «cancelar» cancela todo lo que esté en marcha (sin ids)", async () => {
    const c = await import("./lecturas-pedidos-cliente");
    await c.cancelarLecturas({ eliminar: true });
    expect(patches().find((p) => p.accion === "cancelar")).toEqual({ accion: "cancelar" });
  });

  it("cancelar un pedido suelto manda solo su id, e «Iniciar lectura» manda «iniciar» sin marcarlo como automático", async () => {
    const c = await import("./lecturas-pedidos-cliente");
    await c.cancelarPedidos([7]);
    expect(patches()).toContainEqual({ accion: "cancelar", ids: [7] });
    await c.iniciarLectura();
    expect(patches()).toContainEqual({ accion: "iniciar" });
  });

  it("el diálogo de cancelación se abre y se cierra desde cualquier botón", async () => {
    const c = await import("./lecturas-pedidos-cliente");
    expect(c.leerDialogoCancelar()).toBe(false);
    c.solicitarCancelacion();
    expect(c.leerDialogoCancelar()).toBe(true);
    c.cerrarDialogoCancelar();
    expect(c.leerDialogoCancelar()).toBe(false);
    c.solicitarCancelacion();
    await c.cancelarLecturas({ eliminar: false });
    expect(c.leerDialogoCancelar()).toBe(false);
  });
});

describe("recoger lo leído sin perder los repetidos", () => {
  it("el pedido que ya estaba en la cola no se pierde en silencio: se manda al servidor como ignorado, con su motivo", async () => {
    const dato = (numero: string, cliente: string) => ({
      resultado: { datos: { numeroPedido: numero, vin: null, matricula: null, dni: null, cliente, fechaExpediente: null, idModelo: null, avisos: [] }, similares: [], adjunto: { id: 1 }, metodo: "ocr" },
    });
    const lecturas = [
      { id: 1, nombre: "a.pdf", estado: "pedido", destino: null, ...dato("13757863", "Ana") },
      { id: 2, nombre: "a-copia.pdf", estado: "pedido", destino: null, ...dato("13757863", "Ana") },
      { id: 3, nombre: "b.pdf", estado: "pedido", destino: null, ...dato("14000000", "Luis") },
    ];
    const enviados: { accion: string; ids?: number[]; repetidos?: { id: number; motivo: string }[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const json = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
        if ((init?.method ?? "GET") === "PATCH") {
          enviados.push(JSON.parse(String(init?.body)));
          return json({ afectadas: 0 });
        }
        return json({ resumen: { subiendo: 0, pendientes: 0, leyendo: 0, pedidos: 3, descartados: 0, repetidos: 0, errores: 0, lectores: 2, maximo: 2, manual: false }, lecturas, enMarcha: [] });
      }),
    );
    const c = await import("./lecturas-pedidos-cliente");
    const cola = await import("./pedidos-cola");
    cola.vaciarCola();
    await c.recogerPendientes();
    // Entran el primero y el otro pedido; el que repetía el número 13757863 queda anotado como ignorado, no recogido
    expect(cola.leerCola().items.map((i) => i.nombre)).toEqual(["a.pdf", "b.pdf"]);
    expect(enviados.find((e) => e.accion === "recoger")?.ids).toEqual([1, 3]);
    const rep = enviados.find((e) => e.accion === "repetido");
    expect(rep?.repetidos).toEqual([{ id: 2, motivo: "Repetido: ya hay en la cola un pedido con el mismo número (13757863)" }]);
  });

  it("dos copias del mismo pedido sin número ni fecha (el OCR no los leyó) se detectan por cliente y modelo", async () => {
    const dato = (id: number, nombre: string, dni: string, idModelo: number) => ({
      id,
      nombre,
      estado: "pedido",
      destino: null,
      resultado: { datos: { numeroPedido: null, vin: null, matricula: null, dni, cliente: "Natalia", fechaExpediente: null, idModelo, avisos: [] }, similares: [], adjunto: { id }, metodo: "ocr" },
    });
    // Misma persona y modelo (copias); otra persona; y la misma persona con otro modelo (otro coche: no es repetido)
    const lecturas = [dato(1, "p1.pdf", "50877768C", 5), dato(2, "p1 (2).pdf", "50877768C", 5), dato(3, "otra.pdf", "11111111H", 5), dato(4, "otro-coche.pdf", "50877768C", 9)];
    const enviados: { accion: string; ids?: number[]; repetidos?: { id: number; motivo: string }[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const json = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
        if ((init?.method ?? "GET") === "PATCH") {
          enviados.push(JSON.parse(String(init?.body)));
          return json({ afectadas: 0 });
        }
        return json({ resumen: { subiendo: 0, pendientes: 0, leyendo: 0, pedidos: 4, descartados: 0, repetidos: 0, errores: 0, lectores: 2, maximo: 2, manual: false }, lecturas, enMarcha: [] });
      }),
    );
    const c = await import("./lecturas-pedidos-cliente");
    const cola = await import("./pedidos-cola");
    cola.vaciarCola();
    await c.recogerPendientes();
    expect(cola.leerCola().items.map((i) => i.nombre)).toEqual(["p1.pdf", "otra.pdf", "otro-coche.pdf"]);
    expect(enviados.find((e) => e.accion === "repetido")?.repetidos?.map((r) => r.id)).toEqual([2]);
  });
});
