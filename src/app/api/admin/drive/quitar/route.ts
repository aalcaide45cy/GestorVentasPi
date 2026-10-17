import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { quitarDeDrive } from "@/lib/servicios/drive";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Quita una copia de Google Drive (el archivo del servidor se conserva). */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const { id } = await leerJson(req, z.object({ id: z.number().int().positive() }));
  await quitarDeDrive(db, id);
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_quitada_drive", entidad: "copias_seguridad", entidadId: id });
  return NextResponse.json({ success: true });
});
