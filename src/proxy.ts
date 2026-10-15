import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { enMantenimiento } from "@/lib/mantenimiento";

/**
 * Proxy (antes «middleware»): sin lógica de base de datos.
 * - Redirige a /login las páginas privadas si no hay cookie de sesión.
 * - Rechaza peticiones de escritura a /api cuyo Origin no coincida con el Host (CSRF).
 * La validez real de la sesión se comprueba en el servidor en cada ruta y página.
 */
const COOKIES_SESION = ["__Host-gv_session", "gv_session"];

function hostEsperado(req: NextRequest): string {
  if (process.env.TRUST_PROXY === "true") {
    const fwd = req.headers.get("x-forwarded-host");
    if (fwd) return fwd.split(",")[0].trim();
  }
  return req.headers.get("host") ?? "";
}

const PAGINA_MANTENIMIENTO = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="10"><title>Restaurando…</title><body style="font-family:system-ui,sans-serif;background:#0f1117;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center"><div><h1>Restaurando copia de seguridad…</h1><p>La aplicación volverá a estar disponible en unos instantes. Esta página se actualiza sola.</p></div></body></html>`;

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const metodo = req.method;

  // Modo mantenimiento (restauración en curso): 503 salvo la comprobación de salud
  if (pathname !== "/api/salud" && enMantenimiento()) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ message: "Restauración en curso. Inténtalo en unos minutos." }, { status: 503, headers: { "Retry-After": "30" } });
    return new NextResponse(PAGINA_MANTENIMIENTO, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "30" } });
  }

  if (pathname.startsWith("/api/")) {
    if (metodo !== "GET" && metodo !== "HEAD" && metodo !== "OPTIONS") {
      const origen = req.headers.get("origin");
      if (origen) {
        let hostOrigen = "";
        try {
          hostOrigen = new URL(origen).host;
        } catch {
          /* origen no válido */
        }
        if (hostOrigen !== hostEsperado(req)) {
          return NextResponse.json({ message: "Origen no permitido" }, { status: 403 });
        }
      }
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/cuenta")) {
    const tieneCookie = COOKIES_SESION.some((n) => req.cookies.has(n));
    if (!tieneCookie) return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/dashboard/:path*", "/cuenta/:path*", "/api/:path*"],
};
