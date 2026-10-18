import { describe, expect, it } from "vitest";
import { categoriaEfectiva } from "./liquidaciones";

describe("categoriaEfectiva", () => {
  it("respeta la categoría guardada cuando el nombre no dice otra cosa", () => {
    expect(categoriaEfectiva("CREDITO", "Crédito")).toBe("CREDITO");
    expect(categoriaEfectiva("CONTADO", "Contado")).toBe("CONTADO");
  });
  it("un tipo llamado Preference nunca cobra como crédito aunque tenga la categoría mal", () => {
    expect(categoriaEfectiva("CREDITO", "Preference")).toBe("PREFERENCE");
    expect(categoriaEfectiva("CONTADO", "Venta Preference")).toBe("PREFERENCE");
    expect(categoriaEfectiva(null, "Preference")).toBe("PREFERENCE");
  });
  it("lo mismo con Renting", () => {
    expect(categoriaEfectiva("CREDITO", "Renting")).toBe("RENTING");
  });
});
