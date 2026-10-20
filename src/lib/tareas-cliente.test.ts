import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TareaDto } from "@/lib/servicios/tareas";
import { alTerminarTarea, esperarTarea, lanzarTarea, leerTareas, refrescarTareas } from "./tareas-cliente";

const ficha = (o: Partial<TareaDto>): TareaDto => ({ id: "t1", tipo: "papelera", titulo: "Purgar", estado: "en_marcha", hecho: 0, total: 10, texto: "", creadaEn: "2026-10-20T00:00:00Z", idUsuario: 1, cancelable: true, ...o });

describe("seguimiento de tareas en el navegador", () => {
  let respuestas: TareaDto[][] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    respuestas = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string }) => {
        if (init?.method === "POST") return { ok: true, status: 202, json: async () => ({ tarea: "t1" }) };
        const datos = respuestas.length > 1 ? respuestas.shift() : respuestas[0];
        return { ok: true, status: 200, json: async () => ({ data: datos ?? [] }) };
      }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("avisa una sola vez cuando una tarea que estaba en marcha termina, y sigue consultando solo mientras haya algo en marcha", async () => {
    respuestas = [[ficha({ estado: "en_marcha", hecho: 3 })], [ficha({ estado: "en_marcha", hecho: 7 })], [ficha({ estado: "terminada", hecho: 10, resultado: { purgados: 10 } })]];
    const avisadas: TareaDto[] = [];
    const dejar = alTerminarTarea((t) => avisadas.push(t));
    const t = await lanzarTarea("/api/admin/papelera", { categoria: "documentos" });
    expect(t.estado).toBe("en_marcha");
    await vi.advanceTimersByTimeAsync(1600);
    expect(leerTareas()[0].hecho).toBe(7);
    expect(avisadas).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1600);
    expect(avisadas).toHaveLength(1);
    expect(avisadas[0]).toMatchObject({ estado: "terminada", resultado: { purgados: 10 } });
    // Ya no queda nada en marcha: no sigue consultando
    const llamadas = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(llamadas);
    dejar();
  });

  it("esperarTarea devuelve el resultado o lanza el motivo del fallo", async () => {
    respuestas = [[ficha({ id: "t2", estado: "en_marcha" })], [ficha({ id: "t2", estado: "terminada", resultado: { ok: 1 } })]];
    const espera = esperarTarea<{ ok: number }>("t2");
    await vi.advanceTimersByTimeAsync(1600);
    await expect(espera).resolves.toEqual({ ok: 1 });
    respuestas = [[ficha({ id: "t3", estado: "en_marcha" })], [ficha({ id: "t3", estado: "error", error: "se ha roto" })]];
    const mala = esperarTarea("t3");
    const comprobacion = expect(mala).rejects.toThrow("se ha roto");
    await vi.advanceTimersByTimeAsync(1600);
    await comprobacion;
    await refrescarTareas();
  });
});
