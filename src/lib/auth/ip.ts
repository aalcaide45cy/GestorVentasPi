/**
 * IP de quien llama, leída de las cabeceras que pone el proxy de confianza (solo se usa con `TRUST_PROXY=true`).
 * - `cf-connecting-ip`: la pone Cloudflare (túnel) con la IP real; quien entra por el túnel no puede falsificarla.
 * - `x-forwarded-for`: vale el ÚLTIMO elemento, que es el que añade nuestro proxy; los anteriores los puede escribir quien llama.
 * Sin cabeceras (acceso directo por la red local) devuelve null y el límite de intentos usa la clave «local».
 */
export function ipDeCabeceras(
  leer: (nombre: string) => string | null,
): string | null {
  const cf = leer("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = (leer("x-forwarded-for") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (xff.length > 0) return xff[xff.length - 1];
  return leer("x-real-ip")?.trim() || null;
}
