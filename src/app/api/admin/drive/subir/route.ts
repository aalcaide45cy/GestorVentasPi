import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { subirCopiaADrive } from "@/lib/servicios/drive";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const { id } = await leerJson(req, z.object({ id: z.number().int().positive() }));
  const r = await subirCopiaADrive(db, id);
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_subida_drive", entidad: "copias_seguridad", entidadId: id });
  return NextResponse.json({ success: true, data: r });
});
