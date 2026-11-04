import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { TIPOS_NOTA, type TipoNota } from "@/lib/notas";
import { exportarNotas } from "@/lib/servicios/notas";

export const dynamic = "force-dynamic";

/** Descarga un archivo con mis notas y flujos (`?tipos=nota` o `?tipos=diagrama,tablero`; sin `tipos`, todo) y, salvo `&adjuntos=0`, sus adjuntos. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const q = new URL(req.url).searchParams;
  const t = (q.get("tipos") ?? "").split(",").filter((x): x is TipoNota => (TIPOS_NOTA as readonly string[]).includes(x));
  const paquete = await exportarNotas(db, u, t.length > 0 ? t : undefined, q.get("adjuntos") !== "0");
  const nombre = `notas-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(paquete), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${nombre}"`, "Cache-Control": "no-store" } });
});
