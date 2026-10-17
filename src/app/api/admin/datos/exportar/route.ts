import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession, HttpError } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { SECCIONES, exportarSeccion, type Seccion } from "@/lib/servicios/intercambio";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Descarga una sección en JSON: `?seccion=clientes` (y `&ids=1,2,3` para elegir planes concretos). */
export const GET = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const q = new URL(req.url).searchParams;
  const seccion = q.get("seccion") as Seccion | null;
  if (!seccion || !SECCIONES.includes(seccion)) throw new HttpError(400, "Sección no válida");
  const ids = (q.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const paquete = await exportarSeccion(db, seccion, { ids });
  await auditar({ idUsuario: admin.idUsuario, accion: "datos_exportados", entidad: seccion, detalle: { registros: paquete.registros } });
  const nombre = `gv_${seccion}_${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(paquete, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${nombre}"`, "X-Registros": String(paquete.registros), "Cache-Control": "no-store" },
  });
});
