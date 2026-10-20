import { beforeEach, describe, expect, it } from "vitest";
import { TareaCancelada, cancelarTarea, descartarTarea, encolar, listarTareas, obtenerTarea, reiniciarTareas } from "./tareas";

beforeEach(reiniciarTareas);

const esperarA = async (id: string, estados: string[]) => {
  for (let i = 0; i < 200; i++) {
    const t = obtenerTarea(id);
    if (t && estados.includes(t.estado)) return t;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("la tarea no llegó al estado esperado");
};

describe("cola de tareas en segundo plano", () => {
  it("ejecuta la tarea, guarda su progreso y su resultado", async () => {
    const t = encolar({ tipo: "prueba", titulo: "Contar", idUsuario: 1 }, async (ctx) => {
      for (let i = 1; i <= 3; i++) ctx.avance(i, 3, `Paso ${i}`);
      return { suma: 6 };
    });
    const fin = await esperarA(t.id, ["terminada"]);
    expect(fin).toMatchObject({ estado: "terminada", hecho: 3, total: 3, resultado: { suma: 6 } });
  });

  it("las tareas se ejecutan de una en una, en el orden en que se piden", async () => {
    const orden: string[] = [];
    const a = encolar({ tipo: "prueba", titulo: "A", idUsuario: 1 }, async () => {
      await new Promise((r) => setTimeout(r, 30));
      orden.push("A");
    });
    const b = encolar({ tipo: "prueba", titulo: "B", idUsuario: 1 }, async () => {
      orden.push("B");
    });
    expect(obtenerTarea(b.id)?.estado).toBe("en_cola");
    await esperarA(b.id, ["terminada"]);
    expect(orden).toEqual(["A", "B"]);
    expect(obtenerTarea(a.id)?.estado).toBe("terminada");
  });

  it("un fallo deja la tarea en error con su mensaje y no frena a las siguientes", async () => {
    const mala = encolar({ tipo: "prueba", titulo: "Mala", idUsuario: 1 }, async () => {
      throw new Error("se ha roto");
    });
    const buena = encolar({ tipo: "prueba", titulo: "Buena", idUsuario: 1 }, async () => "ok");
    expect(await esperarA(mala.id, ["error"])).toMatchObject({ estado: "error", error: "se ha roto" });
    expect(await esperarA(buena.id, ["terminada"])).toMatchObject({ resultado: "ok" });
  });

  it("cancelar una en cola evita que empiece y cancelar una en marcha la para en su siguiente paso", async () => {
    const larga = encolar({ tipo: "prueba", titulo: "Larga", idUsuario: 1 }, async (ctx) => {
      for (let i = 0; i < 100; i++) {
        if (ctx.cancelada()) throw new TareaCancelada("Parada a mitad");
        ctx.avance(i, 100);
        await new Promise((r) => setTimeout(r, 5));
      }
    });
    const espera = encolar({ tipo: "prueba", titulo: "Espera", idUsuario: 1 }, async () => "no debería correr");
    expect(cancelarTarea(espera.id)?.estado).toBe("cancelada");
    await new Promise((r) => setTimeout(r, 30));
    cancelarTarea(larga.id);
    expect(await esperarA(larga.id, ["cancelada"])).toMatchObject({ texto: "Parada a mitad" });
    expect(obtenerTarea(espera.id)?.resultado).toBeUndefined();
  });

  it("cada persona ve las suyas, el administrador todas, y se pueden quitar las terminadas", async () => {
    const a = encolar({ tipo: "prueba", titulo: "De 1", idUsuario: 1 }, async () => 1);
    const b = encolar({ tipo: "prueba", titulo: "De 2", idUsuario: 2 }, async () => 2);
    await esperarA(b.id, ["terminada"]);
    expect(listarTareas(1, false).map((t) => t.titulo)).toEqual(["De 1"]);
    expect(listarTareas(1, true)).toHaveLength(2);
    descartarTarea(a.id);
    expect(listarTareas(1, true)).toHaveLength(1);
  });
});
