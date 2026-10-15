import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaVerificarExcel, verificarFilasExcel } from "@/lib/servicios/importaciones";

export const dynamic = "force-dynamic";

export const POST = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const { rows } = await leerJson(req, esquemaVerificarExcel);
  return NextResponse.json({ success: true, results: await verificarFilasExcel(db, rows) });
});
