import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const metodo = req.method;

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
  matcher: ["/dashboard/:path*", "/cuenta/:path*", "/api/:path*"],
};
