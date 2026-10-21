import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CocheCotejo } from "./cotejo-pagos";

// La cola de tareas del servidor se simula: cada tarea tarda lo que el test decida
const resolvedores = new Map<string, (r: unknown) => void>();
vi.mock("@/lib/tareas-cliente", () => ({
  refrescarTareas: async () => undefined,
  esperarTarea: (id: string, alAvance?: (t: { estado: string }) => void) =>
    new Promise((resolver) => {
      alAvance?.({ estado: "en_marcha" });
      resolvedores.set(id, resolver);
    }),
}));

const coche = (matricula: string, f_matriculacion: string): CocheCotejo => ({ origen: "app", id_expediente: 1, cliente: "Ana", tipo_pago: "Crédito", marca: "Dacia", modelo: "Sandero", matricula, f_expediente: null, f_afectacion: null, f_matriculacion, f_entrega: null, estado: "", usado: false });
const pdf = (nombre: string) => new File([new Uint8Array([37, 80, 68, 70])], nombre, { type: "application/pdf" });
const hoja = (matriculas: string[]) => ({ paginas: [{ matriculas: matriculas.map((matricula) => ({ matricula, confianza: 95, valida: true })) }] });
let llamadas: { url: string }[] = [];
let siguiente = 1;

beforeEach(() => {
  vi.resetModules();
  resolvedores.clear();
  llamadas = [];
  siguiente = 1;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      llamadas.push({ url });
      return new Response(JSON.stringify({ success: true, tarea: `t${siguiente++}` }), { status: 202 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const esperar = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe("cola de lectura de rejillas", () => {
  it("las hojas subidas entran en cola, se leen por turno y dejan un borrador con el mes que adivinan por los coches", async () => {
    const c = await import("./rejillas-lectura-cliente");
    c.usarContextoRejillas({ coches: [coche("1111ABC", "2026-04-10"), coche("2222BCD", "2026-04-20")], mes: "2026-10" });
    c.subirHojas([pdf("a.pdf"), pdf("b.pdf")], "rapido-gpu");
    await esperar();
    // Las dos están en la cola del servidor (la petición lleva el motor elegido) y a la vista con su estado
    expect(llamadas.map((l) => l.url)).toEqual([expect.stringContaining("motor=rapido-gpu"), expect.stringContaining("motor=rapido-gpu")]);
    expect(c.leerRejillas().hojas.map((h) => h.estado)).toEqual(["leyendo", "leyendo"]);

    resolvedores.get("t1")!(hoja(["1111ABC", "2222BCD"]));
    await esperar();
    const e = c.leerRejillas();
    expect(e.hojas.find((h) => h.nombre === "a.pdf")).toMatchObject({ estado: "leida", matriculas: 2 });
    // El mes se adivina por los coches (abril), no por el mes que se estaba mirando (octubre)
    expect(e.borradores).toHaveLength(1);
    expect(e.borradores[0]).toMatchObject({ nombreArchivo: "a.pdf", mes: "2026-04" });
    expect(e.borradores[0].filas.map((f) => f.matricula)).toEqual(["1111ABC", "2222BCD"]);
  });

  it("una hoja sin matrículas queda con error (se puede releer con otro motor) y releer sustituye su borrador", async () => {
    const c = await import("./rejillas-lectura-cliente");
    c.usarContextoRejillas({ coches: [], mes: "2026-05" });
    const [id] = c.subirHojas([pdf("mala.pdf")]);
    await esperar();
    resolvedores.get("t1")!({ paginas: [{ matriculas: [] }] });
    await esperar();
    expect(c.leerRejillas().hojas[0]).toMatchObject({ estado: "error" });

    c.releerHoja(id, "tesseract");
    await esperar();
    expect(llamadas[1].url).toContain("motor=tesseract");
    resolvedores.get("t2")!(hoja(["3333CDF"]));
    await esperar();
    const e = c.leerRejillas();
    expect(e.hojas[0]).toMatchObject({ estado: "leida", matriculas: 1, motor: "tesseract" });
    // Sin coches que lo indiquen, se supone el mes que se estaba mirando
    expect(e.borradores.map((b) => [b.idHoja, b.mes])).toEqual([[id, "2026-05"]]);
  });

  it("guardar o descartar el borrador saca también su hoja de la lista, y quitar una hoja que aún se lee tira su resultado", async () => {
    const c = await import("./rejillas-lectura-cliente");
    c.usarContextoRejillas({ coches: [], mes: "2026-06" });
    c.subirHojas([pdf("x.pdf"), pdf("y.pdf")]);
    await esperar();
    const [x, y] = c.leerRejillas().hojas;
    c.quitarHoja(y.id);
    resolvedores.get("t2")!(hoja(["4444DGH"]));
    resolvedores.get("t1")!(hoja(["5555FJK"]));
    await esperar();
    expect(c.leerRejillas().borradores.map((b) => b.idHoja)).toEqual([x.id]);
    c.quitarBorrador(c.leerRejillas().borradores[0].clave);
    expect(c.leerRejillas()).toMatchObject({ hojas: [], borradores: [] });
  });
});
