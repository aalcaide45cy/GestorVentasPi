import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { desconectar, estadoDrive, origenDe, urlRedireccion } from "@/lib/servicios/drive";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: { ...(await estadoDrive(db)), urlRedireccion: urlRedireccion(origenDe(req)) } });
});

/** Desconectar Google Drive (borra el refresh token guardado). */
export const DELETE = manejar(async () => {
  const admin = await requireSession("administrador");
  await desconectar(db);
  await auditar({ idUsuario: admin.idUsuario, accion: "drive_desconectado", entidad: "conexion_drive" });
  return NextResponse.json({ success: true });
});
