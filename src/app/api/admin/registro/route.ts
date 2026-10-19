import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { leerRegistro, type NivelRegistro } from "@/lib/registro-servidor";

export const dynamic = "force-dynamic";

/** Registro del servidor (solo administrador): `?lineas=500&nivel=todo|avisos|errores&q=texto` y `&descargar=1` para bajarlo como texto. */
export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const q = new URL(req.url).searchParams;
  const nivel = (["todo", "avisos", "errores"].includes(q.get("nivel") ?? "") ? q.get("nivel") : "todo") as NivelRegistro;
  const descargar = q.get("descargar") === "1";
  const { entradas, bytes } = await leerRegistro({ lineas: descargar ? 5000 : Number(q.get("lineas") ?? 500) || 500, nivel, texto: q.get("q") ?? "" });
  if (descargar) {
    return new NextResponse(entradas.join("\n") + "\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="gv_registro_${new Date().toISOString().slice(0, 10)}.log"`, "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json({ success: true, data: { entradas, bytes } }, { headers: { "Cache-Control": "no-store" } });
});
