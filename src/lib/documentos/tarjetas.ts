import sharp from "sharp";

/**
 * Localización de tarjetas (DNI) dentro de una página escaneada o una foto: una hoja A4 con la tarjeta pequeña y girada,
 * o una hoja con anverso y reverso uno encima del otro. Se separa cada tarjeta del fondo por diferencia de color y se
 * recorta a resolución original, sin librerías de visión: máscara en baja resolución + componentes conexas.
 */

export interface Tarjeta {
  /** Recorte de la tarjeta (sin enderezar). */
  imagen: Buffer;
  ancho: number;
  alto: number;
}

const ANCHO_ANALISIS = 360;

interface Caja {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
}

/** Componentes conexas (8 vecinos) de una máscara binaria. */
function componentes(mascara: Uint8Array, w: number, h: number): Caja[] {
  const visitado = new Uint8Array(w * h);
  const cajas: Caja[] = [];
  const pila = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!mascara[i] || visitado[i]) continue;
    let tope = 0;
    pila[tope++] = i;
    visitado[i] = 1;
    const c: Caja = { x0: w, y0: h, x1: 0, y1: 0, area: 0 };
    while (tope > 0) {
      const p = pila[--tope];
      const x = p % w;
      const y = (p - x) / w;
      c.area++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mascara[q] && !visitado[q]) {
            visitado[q] = 1;
            pila[tope++] = q;
          }
        }
      }
    }
    cajas.push(c);
  }
  return cajas;
}

/** Dilatación 3×3 repetida `veces` veces (une el contorno y los rellenos claros de una tarjeta). */
function dilatar(m: Uint8Array, w: number, h: number, veces: number): Uint8Array {
  let actual = m;
  for (let v = 0; v < veces; v++) {
    const sig = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!actual[y * w + x]) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h) sig[ny * w + nx] = 1;
          }
        }
      }
    }
    actual = sig;
  }
  return actual;
}

/** Rellena huecos: cierra la máscara (dilatar y erosionar) para que una tarjeta clara sea un único bloque. */
function erosionar(m: Uint8Array, w: number, h: number, veces: number): Uint8Array {
  let actual = m;
  for (let v = 0; v < veces; v++) {
    const sig = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let todos = 1;
        for (let dy = -1; dy <= 1 && todos; dy++) for (let dx = -1; dx <= 1; dx++) if (!actual[(y + dy) * w + x + dx]) todos = 0;
        sig[y * w + x] = todos;
      }
    }
    actual = sig;
  }
  return actual;
}

/**
 * Una caja con proporción que no es la de una tarjeta (≈1,586) puede ser dos tarjetas pegadas o apiladas: se busca el
 * valle (hueco) del perfil de filas o de columnas y se parte por ahí.
 */
function dividir(mascara: Uint8Array, w: number, c: Caja, nivel: number): Caja[] {
  const cw = c.x1 - c.x0 + 1;
  const ch = c.y1 - c.y0 + 1;
  const proporcion = Math.max(cw, ch) / Math.min(cw, ch);
  if (nivel >= 2) return [c];
  // Con proporción de tarjeta solo se parte si el hueco es casi total (dos tarjetas apiladas dan una caja de proporción parecida)
  const umbral = proporcion >= 1.3 && proporcion <= 1.95 ? 0.06 : 0.25;

  const perfil = (horizontal: boolean): number[] => {
    const n = horizontal ? ch : cw;
    const p = new Array<number>(n).fill(0);
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (mascara[y * w + x]) p[horizontal ? y - c.y0 : x - c.x0]++;
    return p;
  };
  for (const horizontal of [true, false]) {
    const p = perfil(horizontal);
    const n = p.length;
    const maximo = Math.max(...p);
    let mejor = -1;
    let valor = Infinity;
    for (let i = Math.floor(n * 0.25); i <= Math.floor(n * 0.75); i++) {
      const v = (p[i - 1] + p[i] + p[Math.min(n - 1, i + 1)]) / 3;
      if (v < valor) {
        valor = v;
        mejor = i;
      }
    }
    if (mejor > 0 && valor < maximo * umbral) {
      const a: Caja = horizontal ? { ...c, y1: c.y0 + mejor - 1 } : { ...c, x1: c.x0 + mejor - 1 };
      const b: Caja = horizontal ? { ...c, y0: c.y0 + mejor + 1 } : { ...c, x0: c.x0 + mejor + 1 };
      const ajustar = (k: Caja): Caja => {
        let x0 = k.x1;
        let x1 = k.x0;
        let y0 = k.y1;
        let y1 = k.y0;
        let area = 0;
        for (let y = k.y0; y <= k.y1; y++) {
          for (let x = k.x0; x <= k.x1; x++) {
            if (!mascara[y * w + x]) continue;
            area++;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
        return { x0, y0, x1, y1, area };
      };
      return [ajustar(a), ajustar(b)].filter((k) => k.area > 0).flatMap((k) => dividir(mascara, w, k, nivel + 1));
    }
  }
  return [c];
}

/** Separa del fondo cada tarjeta de la imagen. Si no encuentra ninguna, devuelve la imagen entera como única tarjeta. */
export async function detectarTarjetas(imagen: Buffer): Promise<Tarjeta[]> {
  const orientada = await sharp(imagen, { failOn: "none", limitInputPixels: 150_000_000 }).rotate().toBuffer();
  return detectarEn(orientada, 0);
}

async function detectarEn(orientada: Buffer, nivel: number): Promise<Tarjeta[]> {
  const meta = await sharp(orientada).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) return [];
  const entera: Tarjeta[] = [{ imagen: orientada, ancho: W, alto: H }];

  const w = ANCHO_ANALISIS;
  const h = Math.max(1, Math.round((H * w) / W));
  const { data } = await sharp(orientada).removeAlpha().resize(w, h, { fit: "fill" }).blur(1.2).raw().toBuffer({ resolveWithObject: true });

  // Color del fondo: mediana del borde de la imagen
  const borde: number[][] = [[], [], []];
  const tomar = (x: number, y: number) => {
    for (let c = 0; c < 3; c++) borde[c].push(data[(y * w + x) * 3 + c]);
  };
  for (let x = 0; x < w; x++) {
    tomar(x, 1);
    tomar(x, h - 2);
  }
  for (let y = 0; y < h; y++) {
    tomar(1, y);
    tomar(w - 2, y);
  }
  const fondo = borde.map((v) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]);

  let mascara: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const d = Math.abs(data[i * 3] - fondo[0]) + Math.abs(data[i * 3 + 1] - fondo[1]) + Math.abs(data[i * 3 + 2] - fondo[2]);
    mascara[i] = d > 34 ? 1 : 0;
  }
  // Las franjas oscuras que deja el escáner en el borde de la hoja no son tarjetas
  const mx = Math.ceil(w * 0.015);
  const my = Math.ceil(h * 0.015);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < mx || x >= w - mx || y < my || y >= h - my) mascara[y * w + x] = 0;
  mascara = erosionar(dilatar(mascara, w, h, 2), w, h, 2);

  const minimo = w * h * 0.03;
  const cajas = componentes(mascara, w, h)
    .filter((c) => c.area >= minimo)
    .flatMap((c) => dividir(mascara, w, c, 0))
    .filter((c) => {
    const cw = c.x1 - c.x0 + 1;
    const ch = c.y1 - c.y0 + 1;
    return cw >= w * 0.12 && ch >= h * 0.06 && Math.min(cw, ch) / Math.max(cw, ch) > 0.3;
  });
  if (cajas.length === 0) return entera;

  const ex = W / w;
  const ey = H / h;
  const tarjetas: Tarjeta[] = [];
  // De arriba abajo y de izquierda a derecha
  for (const c of cajas.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    const margen = 3;
    const x0 = Math.max(0, Math.round((c.x0 - margen) * ex));
    const y0 = Math.max(0, Math.round((c.y0 - margen) * ey));
    const x1 = Math.min(W, Math.round((c.x1 + 1 + margen) * ex));
    const y1 = Math.min(H, Math.round((c.y1 + 1 + margen) * ey));
    const recorte = await sharp(orientada).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).toBuffer();
    // Un bloque enorme (fotografía o escaneo a color con varias tarjetas dentro) se vuelve a analizar con su propio fondo
    if (nivel === 0 && c.area > w * h * 0.3) {
      const dentro = await detectarEn(recorte, 1);
      if (dentro.length >= 2) {
        tarjetas.push(...dentro);
        continue;
      }
    }
    tarjetas.push({ imagen: recorte, ancho: x1 - x0, alto: y1 - y0 });
  }
  return tarjetas.slice(0, 4);
}

export interface RegionFoto {
  /** Fracciones (0-1) del ancho y alto de la tarjeta. */
  x: number;
  y: number;
  ancho: number;
  alto: number;
  /** Fracción del área de la región ocupada por píxeles de «foto» (gris, ni blanco ni de color). */
  densidad: number;
}

/**
 * Localiza la fotografía del titular en una tarjeta horizontal: es una zona grande en escala de grises (sin color y ni
 * blanca ni negra del todo) frente al fondo colorido y claro de la tarjeta. Devuelve null si no hay ninguna clara.
 */
export async function localizarFoto(tarjeta: Buffer): Promise<RegionFoto | null> {
  const w = 240;
  const meta = await sharp(tarjeta).metadata();
  if (!meta.width || !meta.height) return null;
  const h = Math.max(1, Math.round((meta.height * w) / meta.width));
  const { data } = await sharp(tarjeta).removeAlpha().resize(w, h, { fit: "fill" }).blur(1.5).raw().toBuffer({ resolveWithObject: true });
  // Umbrales relativos a la propia imagen: un escaneo con dominante amarilla tiñe también la foto
  const cromas: number[] = [];
  const lums: number[] = [];
  for (let i = 0; i < w * h; i += 7) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    cromas.push(Math.max(r, g, b) - Math.min(r, g, b));
    lums.push((r + g + b) / 3);
  }
  const mediana = (v: number[]) => v.sort((x, y) => x - y)[Math.floor(v.length / 2)];
  const umbralCroma = Math.max(26, mediana(cromas) * 0.7);
  const umbralLum = Math.min(185, mediana(lums) * 0.82);
  const croma0 = Math.max(4, mediana(cromas) * 0.4);
  let mascara: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    const croma = Math.max(r, g, b) - Math.min(r, g, b);
    const lum = (r + g + b) / 3;
    // Foto oscura (gris frente a un fondo claro y colorido) o foto lavada por el escáner (casi sin color, aunque clara)
    mascara[i] = (croma < umbralCroma && lum > 25 && lum < umbralLum) || (croma < croma0 && lum > 25 && lum < 232) ? 1 : 0;
  }
  // Apertura (quita el texto y las firmas, que son trazos finos) y después cierre (rellena la cara)
  mascara = dilatar(erosionar(mascara, w, h, 3), w, h, 3);
  mascara = erosionar(dilatar(mascara, w, h, 2), w, h, 2);
  // Imagen integral de la máscara para evaluar ventanas con la proporción de una foto de carnet (ancho ≈ 0,8 × alto)
  const integral = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) {
      fila += mascara[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + fila;
    }
  }
  const suma = (x0: number, y0: number, x1: number, y1: number): number => {
    const a = Math.max(0, x0);
    const b = Math.max(0, y0);
    const c = Math.min(w, x1);
    const d = Math.min(h, y1);
    if (c <= a || d <= b) return 0;
    return integral[d * (w + 1) + c] - integral[b * (w + 1) + c] - integral[d * (w + 1) + a] + integral[b * (w + 1) + a];
  };
  let mejor: { x: number; y: number; ancho: number; alto: number; puntos: number; densidad: number } | null = null;
  for (let alto = Math.round(h * 0.38); alto <= Math.round(h * 0.78); alto += 3) {
    const ancho = Math.round(alto * 0.8);
    const area = ancho * alto;
    const margen = Math.round(alto * 0.18);
    for (let y = 0; y + alto <= h; y += 3) {
      for (let x = 0; x + ancho <= w; x += 3) {
        const dentro = suma(x, y, x + ancho, y + alto);
        const densidad = dentro / area;
        // En el DNI la foto queda a la izquierda, en la mitad inferior y sin tocar el borde inferior (arriba están el título y,
        // en el reverso, las líneas de la zona legible, que no son una foto)
        if (x / w > 0.3 || (y + alto / 2) / h < 0.45 || (y + alto) / h > 0.96) continue;
        if (densidad < 0.58) continue;
        // El borde de la foto debe ser nítido: el anillo que la rodea tiene que estar mucho menos ocupado
        const anillo = suma(x - margen, y - margen, x + ancho + margen, y + alto + margen) - dentro;
        const areaAnillo = Math.max(1, (ancho + 2 * margen) * (alto + 2 * margen) - area);
        const dAnillo = anillo / areaAnillo;
        if (dAnillo > densidad * 0.7) continue;
        const puntos = dentro * (densidad - dAnillo);
        if (!mejor || puntos > mejor.puntos) mejor = { x, y, ancho, alto, puntos, densidad };
      }
    }
  }
  if (!mejor) return null;
  return { x: mejor.x / w, y: mejor.y / h, ancho: mejor.ancho / w, alto: mejor.alto / h, densidad: mejor.densidad };
}
