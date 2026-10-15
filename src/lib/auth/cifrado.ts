import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/** Clave derivada de `APP_SECRET` (HKDF-SHA256) para un propósito concreto: nunca se usa la propia clave maestra. */
function clave(proposito: string): Buffer {
  const secreto = process.env.APP_SECRET;
  if (!secreto || secreto.length < 32) {
    throw new Error("Falta APP_SECRET (mínimo 32 caracteres aleatorios) en el entorno.");
  }
  return Buffer.from(hkdfSync("sha256", secreto, "gestorventaspi", proposito, 32));
}

/** AES-256-GCM. Formato: `v1.<iv>.<etiqueta>.<texto cifrado>` en base64url. */
export function cifrar(texto: string, proposito = "cifrado-general"): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", clave(proposito), iv);
  const datos = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()]);
  return ["v1", iv.toString("base64url"), cifrador.getAuthTag().toString("base64url"), datos.toString("base64url")].join(".");
}

export function descifrar(cifrado: string, proposito = "cifrado-general"): string {
  const [version, iv, etiqueta, datos] = cifrado.split(".");
  if (version !== "v1" || !iv || !etiqueta || !datos) throw new Error("Formato de dato cifrado no válido.");
  const descifrador = createDecipheriv("aes-256-gcm", clave(proposito), Buffer.from(iv, "base64url"));
  descifrador.setAuthTag(Buffer.from(etiqueta, "base64url"));
  return Buffer.concat([descifrador.update(Buffer.from(datos, "base64url")), descifrador.final()]).toString("utf8");
}

/** HMAC-SHA256 con clave derivada: para guardar códigos de recuperación sin poder leerlos. */
export function huella(valor: string, proposito: string): string {
  return createHmac("sha256", clave(proposito)).update(valor).digest("hex");
}
