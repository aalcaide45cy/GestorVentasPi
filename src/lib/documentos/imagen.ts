import sharp from "sharp";

/**
 * Binarización adaptativa: cada píxel se compara con la media de su vecindad (imagen integral). Recupera texto muy
 * tenue (como la zona legible por máquina del reverso del DNI, impresa en gris sobre un fondo con dibujos) donde un
 * umbral global lo pierde.
 */
export async function umbralAdaptativo(img: Buffer, ancho: number, radio: number, sesgo: number): Promise<Buffer> {
  const { data, info } = await sharp(img, { failOn: "none" }).greyscale().resize({ width: ancho }).normalise().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) {
      fila += data[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + fila;
    }
  }
  const salida = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radio);
    const y1 = Math.min(h - 1, y + radio);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radio);
      const x1 = Math.min(w - 1, x + radio);
      const suma = integral[(y1 + 1) * (w + 1) + x1 + 1] - integral[y0 * (w + 1) + x1 + 1] - integral[(y1 + 1) * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const media = suma / ((x1 - x0 + 1) * (y1 - y0 + 1));
      salida[y * w + x] = data[y * w + x] < media - sesgo ? 0 : 255;
    }
  }
  return sharp(salida, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
}

/** Fracción de píxeles «de tinta» (tras binarizar) en la franja superior e inferior de una tarjeta. */
export async function densidadFranjas(img: Buffer): Promise<{ superior: number; inferior: number }> {
  const bin = await umbralAdaptativo(img, 1000, 18, 8);
  const { data, info } = await sharp(bin).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const franja = (desde: number, hasta: number) => {
    let n = 0;
    let total = 0;
    for (let y = Math.floor(h * desde); y < Math.floor(h * hasta); y++) {
      for (let x = Math.floor(w * 0.05); x < Math.floor(w * 0.95); x++) {
        total++;
        if (data[y * w + x] === 0) n++;
      }
    }
    return total ? n / total : 0;
  };
  return { superior: franja(0.05, 0.38), inferior: franja(0.62, 0.95) };
}
