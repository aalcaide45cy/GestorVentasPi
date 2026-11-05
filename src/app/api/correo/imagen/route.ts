import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { descargarImagen } from "@/lib/servicios/imagen-remota";

export const dynamic = "force-dynamic";

/** Descarga imágenes de internet (las de una firma pegada de Gmail) para guardarlas dentro del texto. Devuelve `{url: dato}` con las que se han podido bajar. */
export const POST = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const { urls } = await leerJson(
    req,
    z.object({ urls: z.array(z.string().max(2000)).min(1).max(20) }),
  );
  const res: Record<string, string> = {};
  for (const u of [...new Set(urls)]) {
    const d = await descargarImagen(u);
    if (d) res[u] = d;
  }
  return NextResponse.json({ success: true, data: res });
});
