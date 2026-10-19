import { afterEach, describe, expect, it, vi } from "vitest";
import { agruparCajas } from "./ocr-lineas";
import { ocrImagenesVision, parsearSalidaVision, visionDisponible } from "./ocr-vision";

afterEach(() => vi.restoreAllMocks());

const salida = (cajas: object[]) => JSON.stringify({ ancho: 1000, alto: 1000, cajas });

describe("Apple Vision (sin necesitar un Mac: el programa de Swift se sustituye por uno falso)", () => {
  it("lee la salida del programa: confianza de 0 a 100 y solo los textos con contenido", () => {
    const cajas = parsearSalidaVision(salida([{ texto: " PEDIDO ", confianza: 0.987, x0: 10, y0: 20, x1: 100, y1: 40 }, { texto: "   ", confianza: 1, x0: 0, y0: 0, x1: 1, y1: 1 }, { confianza: 1 }]));
    expect(cajas).toEqual([{ texto: "PEDIDO", confianza: 99, x0: 10, y0: 20, x1: 100, y1: 40 }]);
  });

  it("rechaza una salida que no es JSON o no trae cajas", () => {
    expect(() => parsearSalidaVision("no es json")).toThrow(/no se entiende/);
    expect(() => parsearSalidaVision(JSON.stringify({ ancho: 1 }))).toThrow(/cajas/);
  });

  it("une los textos en líneas, marca las columnas con dos espacios y respeta la confianza mínima", async () => {
    const llamadas: string[] = [];
    const lineas = await ocrImagenesVision(
      [Buffer.from("imagen-1"), Buffer.from("imagen-2")],
      { columnas: true, confianzaMinima: 50 },
      {
        programa: async () => "/falso/ocr-vision",
        ejecutar: async (programa, imagen) => {
          llamadas.push(`${programa} ${imagen.split(/[\\/]/).pop()}`);
          return salida([
            { texto: "CLIENTE", confianza: 0.99, x0: 10, y0: 100, x1: 110, y1: 120 },
            { texto: "ESTABLECIMIENTO", confianza: 0.99, x0: 600, y0: 101, x1: 800, y1: 121 },
            { texto: "ruido", confianza: 0.2, x0: 10, y0: 300, x1: 60, y1: 320 },
            { texto: "Sr. D. Mario Muñoz", confianza: 0.95, x0: 10, y0: 150, x1: 250, y1: 170 },
          ]);
        },
      },
    );
    expect(llamadas).toEqual(["/falso/ocr-vision pagina-0.png", "/falso/ocr-vision pagina-1.png"]);
    // Dos páginas, cada una con dos líneas (el «ruido» de poca confianza se descarta)
    expect(lineas.map((l) => l.texto)).toEqual(["CLIENTE  ESTABLECIMIENTO", "Sr. D. Mario Muñoz", "CLIENTE  ESTABLECIMIENTO", "Sr. D. Mario Muñoz"]);
  });

  it("si el programa falla, el error sube (ocr.ts pasará entonces a RapidOCR)", async () => {
    await expect(ocrImagenesVision([Buffer.from("x")], {}, { programa: async () => "/falso", ejecutar: async () => { throw new Error("Vision ha fallado"); } })).rejects.toThrow("Vision ha fallado");
  });

  it("fuera de macOS dice que no está disponible", async () => {
    if (process.platform === "darwin") return; // en un Mac sí lo estaría (si hay swiftc)
    const r = await visionDisponible();
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toMatch(/macOS/);
  });
});

describe("agrupar cajas de texto", () => {
  it("ordena por líneas y por columnas", () => {
    const l = agruparCajas(
      [
        { texto: "B", confianza: 80, x0: 200, y0: 10, x1: 220, y1: 30 },
        { texto: "A", confianza: 100, x0: 10, y0: 11, x1: 30, y1: 31 },
        { texto: "C", confianza: 90, x0: 10, y0: 100, x1: 30, y1: 120 },
      ],
      true,
    );
    expect(l).toEqual([{ texto: "A  B", confianza: 90 }, { texto: "C", confianza: 90 }]);
  });
});
