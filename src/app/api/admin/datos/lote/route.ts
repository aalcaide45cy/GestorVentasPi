import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJsonCrudo, manejar } from "@/lib/http";
import { asegurarCopiaReciente } from "@/lib/servicios/copias";
import { crearCopiaInterna } from "@/lib/servicios/copias-seccion";
import { SECCIONES, type Seccion } from "@/lib/servicios/intercambio";
import { SECCIONES_DE_TODO, exportarLote, importarLote, leerLote, resumenLote } from "@/lib/servicios/intercambio-lote";
import { versionDeLaApp } from "@/lib/version";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/** Descarga todo en un solo JSON: `?secciones=clientes_expedientes,planes` (sin parámetro, todas las secciones de «todo»). */
export const GET = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const pedidas = (new URL(req.url).searchParams.get("secciones") ?? "").split(",").filter((s): s is Seccion => (SECCIONES as readonly string[]).includes(s));
  const lote = await exportarLote(db, pedidas.length > 0 ? pedidas : SECCIONES_DE_TODO, versionDeLaApp());
  const registros = lote.secciones.reduce((a, p) => a + p.datos.length, 0);
  await auditar({ idUsuario: admin.idUsuario, accion: "datos_exportados", entidad: "lote", detalle: { secciones: lote.secciones.map((p) => p.seccion), registros } });
  const nombre = `gv_todo_${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(lote, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${nombre}"`, "X-Registros": String(registros), "Cache-Control": "no-store" },
  });
});

const esquema = z.object({
  /** «leer»: qué trae el archivo. «cotejar»: vista previa exacta de lo elegido. «aplicar»: importa lo elegido. */
  accion: z.enum(["leer", "cotejar", "aplicar"]),
  paquete: z.unknown(),
  elecciones: z.array(z.object({ seccion: z.enum(SECCIONES), modo: z.enum(["anadir", "actualizar", "sustituir"]) })).default([]),
  /** Para aplicar: «IMPORTAR», o «SUSTITUIR» si alguna sección se sustituye. */
  confirmacion: z.string().optional(),
});

/**
 * Importación en lote. El cotejo aplica todo en una transacción que se deshace, así que enseña lo que de verdad pasaría (también lo
 * que dependa de secciones anteriores del mismo archivo). Al aplicar se hace antes una copia de seguridad nueva y una copia interna de
 * cada sección elegida, y si algo falla no queda nada a medias.
 */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const e = esquema.parse(await leerJsonCrudo(req));
  const lote = leerLote(e.paquete);
  if (e.accion === "leer") return NextResponse.json({ success: true, resumen: resumenLote(lote) });
  if (e.accion === "cotejar") return NextResponse.json({ success: true, resultado: await importarLote(db, admin.idUsuario, lote, e.elecciones, false) });

  const esperada = e.elecciones.some((x) => x.modo === "sustituir") ? "SUSTITUIR" : "IMPORTAR";
  if ((e.confirmacion ?? "").trim() !== esperada) throw new HttpError(400, `Escribe ${esperada} para confirmar.`);
  let copia: { nombre: string } | null = null;
  try {
    // Siempre una copia nueva: la importación en lote toca varias secciones a la vez
    const c = await asegurarCopiaReciente(db, admin.idUsuario, 0, "Antes de importar varias secciones desde un archivo (importación en lote).");
    copia = { nombre: c.nombre };
    for (const x of e.elecciones) await crearCopiaInterna(db, x.seccion, admin.idUsuario, "Estado anterior a una importación en lote", "automatica");
  } catch (err) {
    throw new HttpError(409, `No se ha importado nada porque no se pudo hacer la copia de seguridad previa. ${err instanceof Error ? err.message : ""}`.trim());
  }
  const resultado = await importarLote(db, admin.idUsuario, lote, e.elecciones, true);
  await auditar({
    idUsuario: admin.idUsuario,
    accion: "datos_importados",
    entidad: "lote",
    detalle: { secciones: resultado.informes.map((i) => ({ seccion: i.seccion, modo: i.modo, nuevos: i.nuevos, actualizados: i.actualizados, eliminados: i.eliminados, omitidos: i.omitidos })) },
  });
  return NextResponse.json({ success: true, resultado, copia });
});
