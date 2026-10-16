import { describe, expect, it } from "vitest";
import { enCola } from "./ocr";

describe("enCola con tiempo máximo", () => {
  it("una tarea colgada se cancela y la siguiente se ejecuta", async () => {
    const colgada = enCola(() => new Promise<string>(() => undefined), 50);
    const siguiente = enCola(async () => "ok");
    await expect(colgada).rejects.toMatchObject({ status: 504 });
    await expect(siguiente).resolves.toBe("ok");
  });

  it("sin tiempo máximo se comporta como antes", async () => {
    const orden: number[] = [];
    await Promise.all([enCola(async () => void orden.push(1)), enCola(async () => void orden.push(2))]);
    expect(orden).toEqual([1, 2]);
  });
});
