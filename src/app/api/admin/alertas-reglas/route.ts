import { NextResponse } from "next/server";
import { db } from "@/db";
import { esquemaReglaAlerta } from "@/lib/alertas";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerIdQuery, leerJson, manejar } from "@/lib/http";
import { actualizarReglaAlerta, crearReglaAlerta, eliminarReglaAlerta, listarReglasAlerta, reevaluarTodas } from "@/lib/servicios/alertas";

export const dynamic = "force-dynamic";

/** Las reglas de alerta (solo el administrador las ve y las cambia). */
export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: await listarReglasAlerta(db) });
});

export const POST = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  // `?revisar=1`: revisa todos los expedientes con las reglas ahora (crea las alertas que falten)
  if (new URL(req.url).searchParams.get("revisar") === "1") return NextResponse.json({ success: true, data: { nuevas: await reevaluarTodas(db, u) } });
  return NextResponse.json({ success: true, data: await crearReglaAlerta(db, u, await leerJson(req, esquemaReglaAlerta)) }, { status: 201 });
});

export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta la regla de alerta");
  return NextResponse.json({ success: true, data: await actualizarReglaAlerta(db, u, id, await leerJson(req, esquemaReglaAlerta)) });
});

export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) throw new HttpError(400, "Falta la regla de alerta");
  await eliminarReglaAlerta(db, u, id);
  return NextResponse.json({ success: true, data: { ok: true } });
});
