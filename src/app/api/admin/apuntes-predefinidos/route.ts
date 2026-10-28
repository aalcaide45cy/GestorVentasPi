import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, leerJson, manejar } from "@/lib/http";
import { z } from "zod";
import { revisarReglasDe } from "@/lib/servicios/reglas-semaforo";
import { ordenarPredefinidos, actualizarPredefinido, mostrarEnTodos, crearPredefinido, eliminarPredefinido, esquemaPredefinido, listarPredefinidos } from "@/lib/servicios/apuntes";

export const dynamic = "force-dynamic";

/** Los apuntes predefinidos (los ven todos, para los botones rápidos del expediente). */
export const GET = manejar(async () => {
  await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await listarPredefinidos(db) });
});

export const POST = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  // `?id=N&mostrar=1|0`: muestra u oculta su etiqueta en la lista de todos los expedientes
  const q = new URL(req.url).searchParams;
  // `?id=N&reglas=contar|aplicar`: revisa todos los expedientes con las reglas del semáforo (contar no cambia nada)
  if (q.get("reglas") === "contar" || q.get("reglas") === "aplicar") {
    const id = leerIdQuery(req);
    if (!id) throw new HttpError(400, "Falta el apunte predefinido");
    return NextResponse.json({ success: true, data: { cambiados: await revisarReglasDe(db, u, id, q.get("reglas") === "contar") } });
  }
  if (q.get("mostrar") === "1" || q.get("mostrar") === "0") {
    const id = leerIdQuery(req);
    if (!id) throw new HttpError(400, "Falta el apunte predefinido");
    return NextResponse.json({ success: true, data: { cambiados: await mostrarEnTodos(db, u, id, q.get("mostrar") === "1") } });
  }
  return NextResponse.json({ success: true, data: await crearPredefinido(db, u, await leerJson(req, esquemaPredefinido)) }, { status: 201 });
});

export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  // `?orden=1`: fija el orden de los predefinidos (los ids, en el orden deseado)
  if (new URL(req.url).searchParams.get("orden") === "1") {
    const { ids } = await leerJson(req, z.object({ ids: z.array(z.number().int().positive()).max(100) }));
    await ordenarPredefinidos(db, u, ids);
    return NextResponse.json({ success: true, data: { ok: true } });
  }
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta el apunte predefinido");
  return NextResponse.json({ success: true, data: await actualizarPredefinido(db, u, id, await leerJson(req, esquemaPredefinido)) });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta el apunte predefinido");
  await eliminarPredefinido(db, u, id);
  return NextResponse.json({ success: true, data: { eliminado: true } });
});
