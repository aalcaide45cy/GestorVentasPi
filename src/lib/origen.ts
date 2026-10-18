/**
 * Protección contra CSRF: una petición de escritura a /api debe venir del propio sitio (su cabecera Origin coincide con el Host).
 * La usa el «proxy» (src/proxy.ts) para casi todas las rutas y las rutas que quedan fuera del proxy para poder recibir ficheros enormes
 * en flujo (la subida de copias .dump).
 */
export function hostEsperado(req: Request): string {
  if (process.env.TRUST_PROXY === "true") {
    const fwd = req.headers.get("x-forwarded-host");
    if (fwd) return fwd.split(",")[0].trim();
  }
  return req.headers.get("host") ?? "";
}

/** ¿El origen de esta petición de escritura es el propio sitio? Sin cabecera Origin (peticiones que no son de un navegador) se admite, como siempre. */
export function origenValido(req: Request): boolean {
  const origen = req.headers.get("origin");
  if (!origen) return true;
  try {
    return new URL(origen).host === hostEsperado(req);
  } catch {
    return false;
  }
}
