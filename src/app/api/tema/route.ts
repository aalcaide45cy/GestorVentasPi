import { scriptTema } from "@/lib/temas";

export const dynamic = "force-static";

/** Script que aplica el tema de colores guardado antes de pintar la página (se carga desde el diseño base). */
export function GET(): Response {
  return new Response(scriptTema(), { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
