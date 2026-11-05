import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "@/lib/auth/sesion";

const MAX_BYTES = 2 * 1024 * 1024;

/** Direcciones que no se pueden pedir desde el servidor (red local, loopback…): evita que se use para entrar en la red interna. */
function esPrivada(ip: string): boolean {
  if (ip.includes(":"))
    return (
      ip === "::1" ||
      ip.startsWith("fc") ||
      ip.startsWith("fd") ||
      ip.startsWith("fe80") ||
      ip.startsWith("::ffff:127.") ||
      ip.startsWith("::ffff:10.") ||
      ip.startsWith("::ffff:192.168.")
    );
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** Descarga una imagen pública de internet (https, hasta 2 MB) y la devuelve como dato en línea; null si no se puede. */
export async function descargarImagen(url: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  try {
    const ips = isIP(u.hostname)
      ? [u.hostname]
      : (await lookup(u.hostname, { all: true })).map((x) => x.address);
    if (ips.length === 0 || ips.some(esPrivada))
      throw new HttpError(400, "Dirección no permitida");
    const r = await fetch(u, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (GestorVentas)",
        Accept: "image/*",
      },
    });
    if (!r.ok) return null;
    const tipo = (r.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(tipo)) return null;
    const datos = Buffer.from(await r.arrayBuffer());
    if (datos.length === 0 || datos.length > MAX_BYTES) return null;
    return `data:${tipo};base64,${datos.toString("base64")}`;
  } catch {
    return null;
  }
}
