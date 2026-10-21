import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { aGris, celdaConTinta, matriculaDeTexto, mesDeTexto, mesLegible } from "./ocr-rejilla";

describe("mesDeTexto (fecha de la rejilla, abajo a la izquierda)", () => {
  it("lee «abril-24» y sus variantes con errores típicos del OCR", () => {
    expect(mesDeTexto("abril-24")).toBe("2024-04");
    expect(mesDeTexto("Abril 2024")).toBe("2024-04");
    expect(mesDeTexto("  abr.24 ")).toBe("2024-04");
    expect(mesDeTexto("abri1-24")).toBe("2024-04"); // 1 por l
    expect(mesDeTexto("Septiembre-25")).toBe("2025-09");
    expect(mesDeTexto("sept 25")).toBe("2025-09");
    expect(mesDeTexto("04/2024")).toBe("2024-04");
    expect(mesDeTexto("abajo a la izquierda: marzo-23 y más texto")).toBe("2023-03");
  });

  it("no se inventa fechas de números sueltos ni de años imposibles", () => {
    expect(mesDeTexto("1.910,00 € total 24")).toBeNull();
    expect(mesDeTexto("abril-99")).toBeNull();
    expect(mesDeTexto("")).toBeNull();
    expect(mesLegible("2024-04")).toBe("Abril 2024");
  });
});

describe("matriculaDeTexto (lectura de un motor de OCR de una celda)", () => {
  it("saca la matrícula aunque el motor la lea con espacios, minúsculas o ruido alrededor", () => {
    expect(matriculaDeTexto("9785 NMJ")).toBe("9785NMJ");
    expect(matriculaDeTexto("  3052nmt ")).toBe("3052NMT");
    expect(matriculaDeTexto("Nº 4692-NMM .")).toBe("4692NMM");
  });

  it("corrige las confusiones típicas de cifras y letras según la posición", () => {
    expect(matriculaDeTexto("97B5NMJ")).toBe("9785NMJ");
    expect(matriculaDeTexto("6933NM0")).toBe("6933NMD");
  });

  it("devuelve null si no hay nada parecido a una matrícula", () => {
    expect(matriculaDeTexto("")).toBeNull();
    expect(matriculaDeTexto("Alfonso ALCAIDE")).toBeNull();
  });
});

describe("celdaConTinta", () => {
  const celda = { x: 0, y: 0, ancho: 200, alto: 50 };
  const imagen = (pintar: (x: number, y: number) => boolean) => {
    const datos = Buffer.alloc(200 * 50, 255);
    for (let y = 0; y < 50; y++) for (let x = 0; x < 200; x++) if (pintar(x, y)) datos[y * 200 + x] = 0;
    return sharp(datos, { raw: { width: 200, height: 50, channels: 1 } }).png().toBuffer();
  };

  it("una celda con texto en el centro cuenta; una vacía o con solo el borde de la tabla, no", async () => {
    const conTexto = await aGris(await imagen((x, y) => x > 40 && x < 160 && y > 15 && y < 35), 0);
    const vacia = await aGris(await imagen(() => false), 0);
    // La franja entre la cabecera y la primera fila solo trae la línea de arriba de la tabla
    const soloBorde = await aGris(await imagen((_, y) => y < 4), 0);
    expect(celdaConTinta(conTexto, celda)).toBe(true);
    expect(celdaConTinta(vacia, celda)).toBe(false);
    expect(celdaConTinta(soloBorde, celda)).toBe(false);
  });
});
