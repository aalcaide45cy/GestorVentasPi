import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaAjustesCorreo } from "@/lib/correo";
import {
  guardarAjustesCorreo,
  leerAjustesCorreo,
} from "@/lib/servicios/correo";

export const dynamic = "force-dynamic";

/** Envío automático (uno tras otro) y pausa entre correos. */
export const GET = manejar(async () => {
  await requireSession("no_invitado");
  return NextResponse.json({
    success: true,
    data: await leerAjustesCorreo(db),
  });
});
export const PUT = manejar(async (req: Request) => {
  await requireSession("administrador");
  return NextResponse.json({
    success: true,
    data: await guardarAjustesCorreo(
      db,
      await leerJson(req, esquemaAjustesCorreo),
    ),
  });
});
