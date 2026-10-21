import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { renombrarPorLectura } from "@/lib/servicios/biblioteca-lectura";
import { encolar } from "@/lib/servicios/tareas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const esquema = z.object({ ids: z.array(z.number().int().positive()).min(1) });

/**
 * Renombra archivos de la biblioteca leyéndolos con OCR («Pedido - Cliente - Fecha», «Pago RCI - …», «Rejilla - Mes Año»). Con `?asincrono=1` entra en la
 * cola de tareas en segundo plano (con avance y cancelable) y devuelve `{ tarea }`; sin él, espera y devuelve `{ data: resumen }`.
 */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const { ids } = await leerJson(req, esquema);
  const unicos = [...new Set(ids)];
  if (new URL(req.url).searchParams.get("asincrono") === "1") {
    const tarea = encolar({ tipo: "biblioteca", titulo: `Renombrar ${unicos.length} archivo${unicos.length === 1 ? "" : "s"} de la biblioteca leyéndolos`, idUsuario: u.idUsuario }, (ctx) => renombrarPorLectura(db, unicos, ctx));
    return NextResponse.json({ success: true, tarea: tarea.id }, { status: 202 });
  }
  return NextResponse.json({ success: true, data: await renombrarPorLectura(db, unicos) });
});
