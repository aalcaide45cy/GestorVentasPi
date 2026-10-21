import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, leerJson, manejar } from "@/lib/http";
import { leerArchivoPaleta, paraExportar, PALETA_POR_DEFECTO } from "@/lib/paletas-colores";
import { aplicarPaleta, aplicarPaletaPorDefecto, coloresActuales, eliminarPaleta, guardarPaleta, leerPaleta, listarPaletas, renombrarPaleta } from "@/lib/servicios/paletas";

export const dynamic = "force-dynamic";

const nombreSeguro = (n: string) => n.replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, "_");
const descarga = (cuerpo: unknown, nombre: string) =>
  new NextResponse(JSON.stringify(cuerpo, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${nombreSeguro(nombre)}.json"`, "Cache-Control": "no-store" } });

/**
 * Lista las paletas guardadas. `?exportar=1&id=N` descarga una; `?exportar=1&actuales=1` descarga los colores de ahora;
 * `?exportar=1&defecto=1` descarga la paleta por defecto.
 */
export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const q = new URL(req.url).searchParams;
  if (q.get("exportar") === "1") {
    if (q.get("actuales") === "1") return descarga(paraExportar("Colores actuales", null, await coloresActuales(db)), "paleta_colores_actuales");
    if (q.get("defecto") === "1") return descarga(paraExportar("Por defecto", "La paleta de siempre", PALETA_POR_DEFECTO), "paleta_por_defecto");
    const id = leerIdQuery(req);
    const p = id ? await leerPaleta(db, id) : null;
    if (!p) return errorJson(404, "Paleta no encontrada");
    return descarga(paraExportar(p.meta.nombre, p.meta.descripcion, p.datos), `paleta_${p.meta.nombre}`);
  }
  return NextResponse.json({ success: true, data: { paletas: await listarPaletas(db) } });
});

const esquemaPost = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("guardar_actuales"), nombre: z.string().trim().min(1).max(120), descripcion: z.string().max(500).nullish(), sustituir: z.boolean().optional() }),
  z.object({ accion: z.literal("importar"), contenido: z.string().max(5_000_000), nombre: z.string().trim().max(120).optional(), sustituir: z.boolean().optional() }),
  z.object({ accion: z.literal("aplicar"), id: z.number().int().positive().optional(), defecto: z.boolean().optional() }),
]);

export const POST = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const e = await leerJson(req, esquemaPost);
  if (e.accion === "guardar_actuales") {
    const p = await guardarPaleta(db, { nombre: e.nombre, descripcion: e.descripcion, datos: await coloresActuales(db), sustituir: e.sustituir });
    return NextResponse.json({ success: true, data: p }, { status: 201 });
  }
  if (e.accion === "importar") {
    let leida: ReturnType<typeof leerArchivoPaleta>;
    try {
      leida = leerArchivoPaleta(e.contenido);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : "No se ha podido leer la paleta.");
    }
    const p = await guardarPaleta(db, { nombre: e.nombre || leida.nombre || "Paleta importada", descripcion: leida.descripcion, datos: leida.datos, sustituir: e.sustituir });
    return NextResponse.json({ success: true, data: p, avisos: leida.avisos }, { status: 201 });
  }
  if (e.defecto) {
    const r = await aplicarPaletaPorDefecto(db);
    await auditar({ idUsuario: u.idUsuario, accion: "paleta_aplicada", entidad: "plantillas_colores", detalle: { paleta: "por defecto", ...r } });
    return NextResponse.json({ success: true, data: r });
  }
  const p = e.id ? await leerPaleta(db, e.id) : null;
  if (!p) throw new HttpError(404, "Paleta no encontrada");
  const r = await aplicarPaleta(db, p.datos);
  await auditar({ idUsuario: u.idUsuario, accion: "paleta_aplicada", entidad: "plantillas_colores", entidadId: String(p.meta.id), detalle: { paleta: p.meta.nombre, ...r } });
  return NextResponse.json({ success: true, data: r });
});

const esquemaPatch = z.object({ id: z.number().int().positive(), nombre: z.string().trim().min(1).max(120), descripcion: z.string().max(500).nullish() });

export const PATCH = manejar(async (req: Request) => {
  await requireSession("administrador");
  const { id, nombre, descripcion } = await leerJson(req, esquemaPatch);
  await renombrarPaleta(db, id, nombre, descripcion);
  return NextResponse.json({ success: true });
});

export const DELETE = manejar(async (req: Request) => {
  await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta el ID");
  await eliminarPaleta(db, id);
  return NextResponse.json({ success: true });
});
