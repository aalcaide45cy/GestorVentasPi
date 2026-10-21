import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJsonCrudo, manejar } from "@/lib/http";
import { guardarObjetivoDefecto, leerObjetivoDefecto } from "@/lib/servicios/objetivo-defecto";

export const dynamic = "force-dynamic";

/** Objetivo con el que entra un vendedor nuevo en un plan (en centésimas de punto). */
export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: { objetivo: await leerObjetivoDefecto(db) } });
});

export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const objetivo = await guardarObjetivoDefecto(db, await leerJsonCrudo(req));
  await auditar({ idUsuario: u.idUsuario, accion: "plan_objetivo_defecto", entidad: "ajustes", entidadId: "plan_objetivo_defecto", detalle: { objetivo } });
  return NextResponse.json({ success: true, data: { objetivo } });
});
