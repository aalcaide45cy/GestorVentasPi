import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { reconocerRejilla, tipoDeFichero } from "./ocr";

const LINEAS = ["REJILLA DE COMISIONES AGOSTO", "1234 BCD   JUAN PEREZ GARCIA   Credito   450,00", "5678 FGH   ANA RUIZ LOPEZ   Contado   300,00", "9012 JKL   LUIS MARTIN SANZ   Renting   1.250,50"];

// Fuente que ya viene con Next.js: en Linux sin fuentes del sistema el lienzo no dibujaría texto
beforeAll(() => {
  GlobalFonts.registerFromPath(path.join(process.cwd(), "node_modules", "next", "dist", "compiled", "@vercel", "og", "Geist-Regular.ttf"), "Geist");
});

function imagenRejilla(): Buffer {
  const lienzo = createCanvas(1500, 420);
  const ctx = lienzo.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1500, 420);
  ctx.fillStyle = "#000000";
  ctx.font = "40px Geist";
  LINEAS.forEach((l, i) => ctx.fillText(l, 40, 70 + i * 90));
  return lienzo.toBuffer("image/png");
}

/** PDF mínimo de una página con texto (para probar la lectura sin OCR y la rasterización). */
function pdfConTexto(lineas: string[]): Buffer {
  const contenido = `BT /F1 14 Tf 40 780 Td 22 TL ${lineas.map((l) => `(${l}) Tj T*`).join(" ")} ET`;
  const objetos = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${contenido.length}>>\nstream\n${contenido}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Courier>>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<</Size ${objetos.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

describe("OCR de la rejilla", () => {
  it("distingue PDF e imágenes por su firma", () => {
    expect(tipoDeFichero(Buffer.from("%PDF-1.7 ..."))).toBe("pdf");
    expect(tipoDeFichero(imagenRejilla())).toBe("imagen");
    expect(tipoDeFichero(Buffer.from("hola mundo, esto no es nada"))).toBeNull();
  });

  it("rechaza ficheros vacíos o de formato desconocido", async () => {
    await expect(Promise.resolve().then(() => reconocerRejilla(Buffer.alloc(0)))).rejects.toMatchObject({ status: 400 });
    await expect(Promise.resolve().then(() => reconocerRejilla(Buffer.from("texto plano largo")))).rejects.toMatchObject({ status: 415 });
  });

  it("lee las matrículas, clientes, financiación e importes de una imagen", { timeout: 120_000 }, async () => {
    const r = await reconocerRejilla(imagenRejilla());
    expect(r.metodo).toBe("ocr");
    const m = r.filas.map((f) => f.matricula);
    expect(m).toEqual(["1234BCD", "5678FGH", "9012JKL"]);
    expect(r.filas.map((f) => f.importe)).toEqual([45000, 30000, 125050]);
    expect(r.filas[0].cliente).toContain("PEREZ");
    expect(r.filas[1].financiacion?.toLowerCase()).toBe("contado");
    expect(r.filas[0].confianza).toBeGreaterThan(0);
  });

  it("lee el texto de un PDF sin necesitar OCR", { timeout: 60_000 }, async () => {
    const r = await reconocerRejilla(pdfConTexto(LINEAS));
    expect(r.metodo).toBe("texto-pdf");
    expect(r.filas.map((f) => [f.matricula, f.importe])).toEqual([
      ["1234BCD", 45000],
      ["5678FGH", 30000],
      ["9012JKL", 125050],
    ]);
  });

  it("si se fuerza, rasteriza el PDF y lo reconoce con OCR", { timeout: 120_000 }, async () => {
    const r = await reconocerRejilla(pdfConTexto(LINEAS), { forzarOcr: true });
    expect(r.metodo).toBe("ocr");
    expect(r.filas.map((f) => f.matricula)).toEqual(["1234BCD", "5678FGH", "9012JKL"]);
  });

  it("lee una imagen girada (escaneada de lado o del revés)", { timeout: 180_000 }, async () => {
    for (const giro of [90, 180, 270]) {
      const girada = await sharp(imagenRejilla()).rotate(giro).png().toBuffer();
      const r = await reconocerRejilla(girada);
      expect(r.filas.map((f) => f.matricula)).toEqual(["1234BCD", "5678FGH", "9012JKL"]);
    }
  });
});
