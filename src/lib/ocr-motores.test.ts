import { describe, expect, it } from "vitest";
import { nombreCortoGpu, nombreDeMotor } from "./ocr-motores";

describe("nombres de los motores de OCR", () => {
  it("siempre dicen el motor y dónde corre", () => {
    expect(nombreDeMotor("tesseract")).toBe("Tesseract · CPU");
    expect(nombreDeMotor("rapido-cpu")).toBe("RapidOCR · CPU");
    expect(nombreDeMotor("rapido-gpu", "NVIDIA GeForce RTX 4090")).toBe("RapidOCR · GPU RTX 4090");
    expect(nombreDeMotor("rapido-gpu")).toBe("RapidOCR · GPU NVIDIA");
    expect(nombreDeMotor("vision")).toBe("Apple Vision · Neural Engine (solo Mac)");
    expect(nombreCortoGpu("NVIDIA NVIDIA GeForce RTX 3060 Laptop GPU")).toBe("RTX 3060 Laptop GPU");
  });
});
