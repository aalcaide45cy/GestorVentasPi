import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, leerJson, manejar } from "@/lib/http";
import { borrarCopiaInterna, contarCopiasInternas, crearCopiaInterna, leerCopiaInterna, listarCopiasInternas } from "@/lib/servicios/copias-seccion";
import { SECCIONES, type Seccion } from "@/lib/servicios/intercambio";

export const dynamic = "force-dynamic";

const seccionValida = (v: string | null): Seccion | null => (v && (SECCIONES as readonly string[]).includes(v) ? (v as Seccion) : null);

/**
 * Sin parámetros especiales: lista de copias internas (`?seccion=&q=&origen=&desde=&hasta=`) y cuántas hay de cada sección.
 * Con `?id=N&descargar=1`: descarga el contenido de una copia en JSON.
 */
export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const q = new URL(req.url).searchParams;
  if (q.get("descargar") === "1") {
    const id = leerIdQuery(req);
    if (!id) throw new HttpError(400, "Falta la copia a descargar");
    const f = await leerCopiaInterna(db, id);
    const nombre = `gv_copia_interna_${f.seccion}_${f.creadaEn.toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(f.datos, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${nombre}"`, "Cache-Control": "no-store" } });
  }
  if (q.get("soloConteo") === "1") return NextResponse.json({ success: true, data: { conteo: await contarCopiasInternas(db) } });
  const origen = q.get("origen");
  const [lista, conteo] = await Promise.all([
    listarCopiasInternas(db, { seccion: seccionValida(q.get("seccion")), texto: q.get("q"), origen: origen === "manual" || origen === "automatica" ? origen : null, desde: q.get("desde"), hasta: q.get("hasta") }),
    contarCopiasInternas(db),
  ]);
  return NextResponse.json({ success: true, data: { ...lista, conteo } });
});

const esquemaCrear = z.object({ seccion: z.enum(SECCIONES), nota: z.string().trim().max(300).nullish(), ids: z.array(z.number().int().positive()).optional() });

/** «Guardar copia interna» de una sección. */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const e = await leerJson(req, esquemaCrear);
  const copia = await crearCopiaInterna(db, e.seccion, admin.idUsuario, e.nota ?? null, "manual", { ids: e.ids });
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_interna_creada", entidad: e.seccion, entidadId: String(copia.id), detalle: { registros: copia.registros } });
  return NextResponse.json({ success: true, data: copia }, { status: 201 });
});

export const DELETE = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta la copia a borrar");
  await borrarCopiaInterna(db, id);
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_interna_borrada", entidad: "copias_seccion", entidadId: String(id) });
  return NextResponse.json({ success: true });
});
