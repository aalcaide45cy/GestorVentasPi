import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { detectarTarjetas, localizarFoto } from "./tarjetas";

/** Hoja A4 blanca con tarjetas de color (como un escaneo) y, opcionalmente, una «foto» gris a la izquierda de cada una. */
function hoja(tarjetas: { x: number; y: number; ancho: number; alto: number; color: string; foto?: boolean }[]): Buffer {
  const l = createCanvas(1240, 1754);
  const ctx = l.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1240, 1754);
  for (const t of tarjetas) {
    ctx.fillStyle = t.color;
    ctx.fillRect(t.x, t.y, t.ancho, t.alto);
    if (t.foto) {
      ctx.fillStyle = "#808080";
      ctx.fillRect(t.x + t.ancho * 0.06, t.y + t.alto * 0.3, t.ancho * 0.3, t.alto * 0.58);
    }
  }
  return l.toBuffer("image/png");
}

describe("tarjetas de DNI en una página", () => {
  it("separa dos tarjetas apiladas y una tarjeta pequeña en una esquina", async () => {
    const dos = await detectarTarjetas(
      hoja([
        { x: 300, y: 150, ancho: 640, alto: 404, color: "#f1e2a8", foto: true },
        { x: 300, y: 640, ancho: 640, alto: 404, color: "#dce8f4" },
      ]),
    );
    expect(dos).toHaveLength(2);
    expect(Math.abs(dos[0].ancho - 646)).toBeLessThan(30);
    const una = await detectarTarjetas(hoja([{ x: 60, y: 60, ancho: 640, alto: 404, color: "#f1e2a8" }]));
    expect(una).toHaveLength(1);
    expect(una[0].ancho).toBeLessThan(700);
  });

  it("si la página no tiene nada que separar, devuelve la imagen entera", async () => {
    const t = await detectarTarjetas(hoja([]));
    expect(t).toHaveLength(1);
    expect(t[0].ancho).toBe(1240);
  });

  it("localiza la foto a la izquierda y no la ve en un reverso sin foto", async () => {
    const [frente] = await detectarTarjetas(hoja([{ x: 300, y: 300, ancho: 640, alto: 404, color: "#f1e2a8", foto: true }]));
    const f = await localizarFoto(frente.imagen);
    expect(f).not.toBeNull();
    expect((f?.x ?? 1) + (f?.ancho ?? 0) / 2).toBeLessThan(0.5);
    const [reverso] = await detectarTarjetas(hoja([{ x: 300, y: 300, ancho: 640, alto: 404, color: "#dce8f4" }]));
    expect(await localizarFoto(reverso.imagen)).toBeNull();
    // una tarjeta girada 180° tiene la foto a la derecha: no cuenta como «a la izquierda»
    const girada = await sharp(frente.imagen).rotate(180).png().toBuffer();
    const g = await localizarFoto(girada);
    expect(g === null || g.x + g.ancho / 2 >= 0.5 || g.x > 0.3).toBe(true);
  });
});
