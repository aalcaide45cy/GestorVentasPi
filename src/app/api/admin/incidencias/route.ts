import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, leerJson, manejar } from "@/lib/http";
import { ESTADOS_INCIDENCIA, informeDe, ORIGENES, type EstadoIncidencia } from "@/lib/incidencias";
import { cambiarIncidencias, eliminarIncidencias, leerCaptura, leerIncidencia, listarIncidencias, resumenIncidencias } from "@/lib/servicios/incidencias";

export const dynamic = "force-dynamic";

/**
 * `?resumen=1` da los contadores del aviso del menú. `?id=N` una incidencia (y, al abrirla, pasa de «nueva» a «revisada»). `?captura=N` la imagen.
 * `?informe=1&estados=nueva,revisada` descarga el informe en texto. Sin nada, la lista (con `estados`, `origen` y `nivel` para filtrar).
 */
export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const q = new URL(req.url).searchParams;
  if (q.get("resumen") === "1") return NextResponse.json({ success: true, data: await resumenIncidencias(db) });
  const cap = leerIdQuery(req, "captura");
  if (cap) {
    const c = await leerCaptura(db, cap);
    if (!c) return errorJson(404, "Captura no encontrada");
    return new NextResponse(new Uint8Array(c.datos), { headers: { "Content-Type": c.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  }
  const id = leerIdQuery(req);
  if (id) {
    const i = await leerIncidencia(db, id);
    if (!i) return errorJson(404, "Incidencia no encontrada");
    if (i.estado === "nueva") {
      await cambiarIncidencias(db, [id], { estado: "revisada" });
      i.estado = "revisada";
    }
    return NextResponse.json({ success: true, data: i });
  }
  const estados = (q.get("estados") ?? "").split(",").filter((e): e is EstadoIncidencia => (ESTADOS_INCIDENCIA as readonly string[]).includes(e));
  const origen = ORIGENES.find((o) => o === q.get("origen"));
  const nivel = q.get("nivel") === "error" || q.get("nivel") === "aviso" ? (q.get("nivel") as "error" | "aviso") : undefined;
  const lista = await listarIncidencias(db, { estados, origen, nivel });
  if (q.get("informe") === "1") {
    return new NextResponse(informeDe(lista.slice(0, 200)), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="incidencias_${new Date().toISOString().slice(0, 10)}.md"`, "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ success: true, data: { incidencias: lista, resumen: await resumenIncidencias(db) } });
});

const esquemaCambio = z.object({ ids: z.array(z.number().int().positive()).min(1).max(2000), estado: z.enum(ESTADOS_INCIDENCIA).optional(), nota: z.string().max(2000).nullish() });

export const PATCH = manejar(async (req: Request) => {
  await requireSession("administrador");
  const { ids, estado, nota } = await leerJson(req, esquemaCambio);
  const n = await cambiarIncidencias(db, ids, { estado, nota });
  return NextResponse.json({ success: true, modificadas: n });
});

export const DELETE = manejar(async (req: Request) => {
  await requireSession("administrador");
  const { ids } = await leerJson(req, z.object({ ids: z.array(z.number().int().positive()).min(1).max(2000) }));
  return NextResponse.json({ success: true, eliminadas: await eliminarIncidencias(db, ids) });
});
