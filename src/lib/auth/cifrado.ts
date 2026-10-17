import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/** Clave derivada de un secreto (HKDF-SHA256) para un propósito concreto: nunca se usa la propia clave maestra. */
function claveCon(secreto: string | undefined, proposito: string): Buffer {
  if (!secreto || secreto.length < 32) {
    throw new Error("Falta APP_SECRET (mínimo 32 caracteres aleatorios) en el entorno.");
  }
  return Buffer.from(hkdfSync("sha256", secreto, "gestorventaspi", proposito, 32));
}

/** Clave derivada de `APP_SECRET`. */
function clave(proposito: string): Buffer {
  return claveCon(process.env.APP_SECRET, proposito);
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

/** AES-256-GCM para ficheros. Formato binario: iv (12) + etiqueta (16) + datos cifrados. */
export function cifrarBuffer(datos: Buffer, proposito = "ficheros"): Buffer {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", clave(proposito), iv);
  const cifrado = Buffer.concat([cifrador.update(datos), cifrador.final()]);
  return Buffer.concat([iv, cifrador.getAuthTag(), cifrado]);
}

export function descifrarBuffer(cifrado: Buffer, proposito = "ficheros"): Buffer {
  if (cifrado.length < 29) throw new Error("Formato de fichero cifrado no válido.");
  const descifrador = createDecipheriv("aes-256-gcm", clave(proposito), cifrado.subarray(0, 12));
  descifrador.setAuthTag(cifrado.subarray(12, 28));
  return Buffer.concat([descifrador.update(cifrado.subarray(28)), descifrador.final()]);
}

/** HMAC-SHA256 con clave derivada: para guardar códigos de recuperación sin poder leerlos. */
export function huella(valor: string, proposito: string): string {
  return createHmac("sha256", clave(proposito)).update(valor).digest("hex");
}

/** Descifra con un secreto concreto (el de otra instalación) en lugar del `APP_SECRET` de esta. Solo para recifrar una copia restaurada. */
export function descifrarConSecreto(secreto: string, cifrado: string, proposito = "cifrado-general"): string {
  const [version, iv, etiqueta, datos] = cifrado.split(".");
  if (version !== "v1" || !iv || !etiqueta || !datos) throw new Error("Formato de dato cifrado no válido.");
  const descifrador = createDecipheriv("aes-256-gcm", claveCon(secreto, proposito), Buffer.from(iv, "base64url"));
  descifrador.setAuthTag(Buffer.from(etiqueta, "base64url"));
  return Buffer.concat([descifrador.update(Buffer.from(datos, "base64url")), descifrador.final()]).toString("utf8");
}

export function descifrarBufferConSecreto(secreto: string, cifrado: Buffer, proposito = "ficheros"): Buffer {
  if (cifrado.length < 29) throw new Error("Formato de fichero cifrado no válido.");
  const descifrador = createDecipheriv("aes-256-gcm", claveCon(secreto, proposito), cifrado.subarray(0, 12));
  descifrador.setAuthTag(cifrado.subarray(12, 28));
  return Buffer.concat([descifrador.update(cifrado.subarray(28)), descifrador.final()]);
}
