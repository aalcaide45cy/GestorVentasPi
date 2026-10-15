import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** TOTP según RFC 6238: SHA-1, 6 dígitos, paso de 30 s. Compatible con Google/Microsoft Authenticator y Authy. */
export const PASO_SEGUNDOS = 30;
export const DIGITOS = 6;
/** Ventana de tolerancia: ±1 paso. */
export const VENTANA = 1;

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Codificar(datos: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = "";
  for (const byte of datos) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

export function base32Decodificar(texto: string): Buffer {
  const limpio = texto.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const c of limpio) {
    const i = ALFABETO.indexOf(c);
    if (i === -1) throw new Error("Secreto base32 no válido.");
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Secreto aleatorio de 160 bits en base32 (32 caracteres). */
export function generarSecreto(): string {
  return base32Codificar(randomBytes(20));
}

/** Código HOTP del contador dado (RFC 4226). */
export function codigoHotp(secreto: Buffer, contador: number, digitos = DIGITOS): string {
  const mensaje = Buffer.alloc(8);
  mensaje.writeBigUInt64BE(BigInt(contador));
  const h = createHmac("sha1", secreto).update(mensaje).digest();
  const desplazamiento = h[h.length - 1] & 0x0f;
  const binario = ((h[desplazamiento] & 0x7f) << 24) | (h[desplazamiento + 1] << 16) | (h[desplazamiento + 2] << 8) | h[desplazamiento + 3];
  return String(binario % 10 ** digitos).padStart(digitos, "0");
}

export function contadorEn(ahoraMs: number): number {
  return Math.floor(ahoraMs / 1000 / PASO_SEGUNDOS);
}

export function codigoTotp(secretoBase32: string, ahoraMs = Date.now(), digitos = DIGITOS): string {
  return codigoHotp(base32Decodificar(secretoBase32), contadorEn(ahoraMs), digitos);
}

/**
 * Comprueba un código dentro de la ventana ±1 paso. Devuelve el contador aceptado o `null`.
 * Con `ultimoContador` rechaza los contadores ya usados (anti-reutilización, 5.4).
 */
export function verificarTotp(secretoBase32: string, codigo: string, ahoraMs = Date.now(), ultimoContador: number | null = null): number | null {
  const limpio = codigo.replace(/\s/g, "");
  if (!/^\d{6}$/.test(limpio)) return null;
  const secreto = base32Decodificar(secretoBase32);
  const actual = contadorEn(ahoraMs);
  let aceptado: number | null = null;
  for (let delta = -VENTANA; delta <= VENTANA; delta++) {
    const contador = actual + delta;
    const esperado = Buffer.from(codigoHotp(secreto, contador));
    // Se recorre toda la ventana (sin salir al primer acierto) para no filtrar tiempos.
    if (timingSafeEqual(esperado, Buffer.from(limpio)) && (ultimoContador === null || contador > ultimoContador)) aceptado = contador;
  }
  return aceptado;
}

/** URL `otpauth://` que escanean las aplicaciones de autenticación. */
export function urlOtpauth(email: string, secretoBase32: string, emisor = "GestorVentasPi"): string {
  const etiqueta = encodeURIComponent(`${emisor}:${email}`);
  return `otpauth://totp/${etiqueta}?secret=${secretoBase32}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=${DIGITOS}&period=${PASO_SEGUNDOS}`;
}
