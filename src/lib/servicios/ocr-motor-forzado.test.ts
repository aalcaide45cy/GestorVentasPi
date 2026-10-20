import { describe, expect, it } from "vitest";
import { ajustesOcr, conMotor } from "./ocr-ajustes";

describe("motor de OCR elegido solo para una lectura", () => {
  it("dentro de conMotor se usa el motor indicado (también tras esperar) y fuera vuelve el de Configuración", async () => {
    const normal = ajustesOcr().motor;
    const forzado = normal === "tesseract" ? "rapido-cpu" : "tesseract";
    const dentro = await conMotor(forzado, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return ajustesOcr().motor;
    });
    expect(dentro).toBe(forzado);
    expect(ajustesOcr().motor).toBe(normal);
  });

  it("dos lecturas a la vez con motores distintos no se mezclan", async () => {
    const leer = (m: "tesseract" | "rapido-cpu") =>
      conMotor(m, async () => {
        await new Promise((r) => setTimeout(r, m === "tesseract" ? 10 : 1));
        return ajustesOcr().motor;
      });
    expect(await Promise.all([leer("tesseract"), leer("rapido-cpu")])).toEqual(["tesseract", "rapido-cpu"]);
  });

  it("sin motor indicado, la lectura usa el de Configuración", async () => {
    expect(await conMotor(undefined, async () => ajustesOcr().motor)).toBe(ajustesOcr().motor);
  });

  it("la lectura manual está desactivada por defecto", () => {
    expect(ajustesOcr().lecturaManual).toBe(false);
  });
});
