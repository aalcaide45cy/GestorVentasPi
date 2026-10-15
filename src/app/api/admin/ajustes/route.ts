import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaAjuste, guardarAjuste, leerAjustes } from "@/lib/servicios/catalogos";

export const dynamic = "force-dynamic";

export const GET = manejar(async () => {
  await requireSession();
  return NextResponse.json({ success: true, data: await leerAjustes(db) });
});

export const POST = manejar(async (req: Request) => {
  await requireSession("administrador");
  const { clave, valor } = await leerJson(req, esquemaAjuste);
  await guardarAjuste(db, clave, valor);
  return NextResponse.json({ success: true });
});
