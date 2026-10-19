import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const vision = vi.fn();
const rapido = vi.fn();
vi.mock("./ocr-vision", () => ({ ocrImagenesVision: (...a: unknown[]) => vision(...a), esMacOs: () => true, visionDisponible: async () => ({ ok: true }) }));
vi.mock("./ocr-rapido", () => ({ ocrImagenesRapido: (...a: unknown[]) => rapido(...a), probarRapido: async () => ({ ok: true, usado: "cpu" }) }));

import { cadenaDeMotores, ocrImagenes } from "./ocr";
import { olvidarAjustesOcr } from "./ocr-ajustes";

function motorElegido(m: "tesseract" | "rapido-cpu" | "rapido-gpu" | "vision") {
  // Los ajustes ya leídos viven en globalThis: se fijan directamente, sin pasar por la base de datos
  (globalThis as unknown as { __ajustesOcr?: { valor: { motor: string; simultaneas: number }; leidoEn: number } }).__ajustesOcr = { valor: { motor: m, simultaneas: 0 }, leidoEn: Date.now() };
}

beforeEach(() => {
  vision.mockReset();
  rapido.mockReset();
  olvidarAjustesOcr();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("cadena de motores de OCR", () => {
  it("Apple Vision tiene a RapidOCR de respaldo; los demás van solos y Tesseract es el último recurso", () => {
    expect(cadenaDeMotores("vision")).toEqual(["vision", "rapido-cpu"]);
    expect(cadenaDeMotores("rapido-cpu")).toEqual(["rapido-cpu"]);
    expect(cadenaDeMotores("rapido-gpu")).toEqual(["rapido-gpu"]);
    expect(cadenaDeMotores("tesseract")).toEqual([]);
  });

  it("con Apple Vision elegido, usa Apple Vision y no toca RapidOCR si funciona", async () => {
    motorElegido("vision");
    vision.mockResolvedValue([{ texto: "desde vision", confianza: 99 }]);
    const r = await ocrImagenes([Buffer.from("x")], { motorElegido: true, columnas: true });
    expect(r).toEqual([{ texto: "desde vision", confianza: 99 }]);
    expect(rapido).not.toHaveBeenCalled();
    expect(vision).toHaveBeenCalledWith([expect.any(Buffer)], { columnas: true, confianzaMinima: undefined });
  });

  it("si Apple Vision falla, sigue con RapidOCR en CPU", async () => {
    motorElegido("vision");
    vision.mockRejectedValue(new Error("No se pudo compilar el lector de Apple Vision"));
    rapido.mockResolvedValue([{ texto: "desde rapidocr", confianza: 95 }]);
    const r = await ocrImagenes([Buffer.from("x")], { motorElegido: true });
    expect(r).toEqual([{ texto: "desde rapidocr", confianza: 95 }]);
    expect(rapido).toHaveBeenCalledWith([expect.any(Buffer)], expect.objectContaining({ proveedor: "cpu" }));
  });

  it("sin motorElegido (la rejilla de comisiones) no se usa ninguno de los dos", async () => {
    motorElegido("vision");
    // Una imagen en blanco real: Tesseract la lee sin problema y no devuelve texto
    const blanca = await sharp({ create: { width: 80, height: 40, channels: 3, background: "#ffffff" } }).png().toBuffer();
    expect(await ocrImagenes([blanca], {})).toEqual([]);
    expect(vision).not.toHaveBeenCalled();
    expect(rapido).not.toHaveBeenCalled();
  }, 30_000);
});
