import { describe, expect, it } from "vitest";
import { ayudaPara, normalizarTexto } from "./ayudas";

describe("ayudas emergentes", () => {
  it("normaliza iconos, acentos y asteriscos", () => {
    expect(normalizarTexto("✏️ Editar")).toBe("editar");
    expect(normalizarTexto("Matrícula (Opcional) *")).toBe("matricula opcional");
    expect(normalizarTexto("Sist. Comisiones")).toBe("sist comisiones");
  });

  it("da ayuda a las opciones habituales y a «Sist. Comisiones»", () => {
    expect(ayudaPara("🗑️ Eliminar")).toMatch(/archiva/);
    expect(ayudaPara("Sist. Comisiones")).toMatch(/Resto de Marcas/);
    expect(ayudaPara("Matrícula (Opcional)")).toMatch(/rejilla/);
    expect(ayudaPara("📦 Exportar todo (CSV)")).toMatch(/Descarga/);
    expect(ayudaPara("🔍 Analizar Base de Datos")).toMatch(/sin cambiar/);
    expect(ayudaPara("F. Afect.")).toMatch(/afectación/);
  });

  it("no inventa ayudas para textos desconocidos", () => {
    expect(ayudaPara("Pepito Pérez")).toBeNull();
    expect(ayudaPara("x")).toBeNull();
  });
});
