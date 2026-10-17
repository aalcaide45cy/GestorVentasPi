import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { iniciarDispositivo, sondearDispositivo } from "@/lib/servicios/drive";

export const dynamic = "force-dynamic";

/** Empieza la conexión con código: devuelve el código corto y la página de Google donde escribirlo. */
export const POST = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: await iniciarDispositivo(db) });
});

/** Pregunta si ya se ha dado permiso; cuando se da, la conexión queda guardada. */
export const PUT = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const e = await leerJson(req, z.object({ codigoDispositivo: z.string().min(10).max(500) }));
  const r = await sondearDispositivo(db, e.codigoDispositivo);
  if (r.estado === "conectado") await auditar({ idUsuario: admin.idUsuario, accion: "drive_conectado", entidad: "conexion_drive" });
  return NextResponse.json({ success: true, data: r });
});
