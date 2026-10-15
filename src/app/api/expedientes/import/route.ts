import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaImportacionCsv, importarExpedientesCsv } from "@/lib/servicios/importaciones";

export const dynamic = "force-dynamic";

export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaImportacionCsv);
  const r = await importarExpedientesCsv(db, usuario, entrada);
  return NextResponse.json({ success: true, importedCount: r.importados, skippedCount: r.omitidos, message: r.mensaje });
});
