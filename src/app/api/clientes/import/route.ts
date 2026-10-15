import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaImportacionClientes, importarClientesCsv } from "@/lib/servicios/importaciones";

export const dynamic = "force-dynamic";

export const POST = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaImportacionClientes);
  const r = await importarClientesCsv(db, entrada);
  return NextResponse.json({ success: true, message: r.mensaje });
});
