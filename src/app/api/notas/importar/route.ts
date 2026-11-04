import { NextResponse } from "next/server";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { importarNotas } from "@/lib/servicios/notas";

export const dynamic = "force-dynamic";

/** Importa un archivo exportado antes: crea notas y flujos nuevos (nunca pisa nada). */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  let crudo: unknown;
  try {
    crudo = JSON.parse(await req.text());
  } catch {
    throw new HttpError(400, "El archivo no es un JSON válido");
  }
  return NextResponse.json({ success: true, data: await importarNotas(db, u, crudo) });
});
