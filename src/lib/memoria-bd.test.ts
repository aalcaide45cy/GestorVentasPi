import { describe, expect, it } from "vitest";
import { aMegas, mismoValor, recomendarMemoriaBd } from "./memoria-bd";

describe("memoria recomendada para la base de datos", () => {
  it("una Raspberry de 8 GB se queda en 1 GB y deja memoria para la aplicación", () => {
    expect(recomendarMemoriaBd(7_900, "Raspberry")).toMatchObject({ sharedBuffers: "1GB", effectiveCacheSize: "4GB", limiteContenedor: "2500m" });
  });
  it("una Raspberry pequeña usa menos y un Mac de 16 GB, un cuarto de la RAM", () => {
    expect(recomendarMemoriaBd(3_900, "Raspberry").sharedBuffers).toBe("192MB");
    expect(recomendarMemoriaBd(16_384, "Apple")).toMatchObject({ sharedBuffers: "4GB", effectiveCacheSize: "8GB", workMem: "64MB" });
  });
  it("un PC de 64 GB llega a 16 GB y una Raspberry, aunque tuviera mucha RAM, sigue siendo prudente solo si es de menos de 12 GB", () => {
    expect(recomendarMemoriaBd(65_536, "AMD")).toMatchObject({ sharedBuffers: "16GB", effectiveCacheSize: "32GB", maintenanceWorkMem: "2GB" });
    expect(recomendarMemoriaBd(8_000, "Intel").sharedBuffers).toBe("1GB");
  });
  it("entiende los tamaños de PostgreSQL y compara equivalentes", () => {
    expect(aMegas("1GB")).toBe(1024);
    expect(aMegas("8192kB")).toBe(8);
    expect(aMegas("128MB")).toBe(128);
    expect(aMegas("mucho")).toBeNull();
    expect(mismoValor("1024MB", "1GB")).toBe(true);
    expect(mismoValor("384MB", "1GB")).toBe(false);
    expect(mismoValor("raro", "1GB")).toBe(false);
  });
});
