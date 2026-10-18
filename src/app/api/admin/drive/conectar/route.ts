import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, manejar } from "@/lib/http";
import { db } from "@/db";
import { crearState, leerCredenciales, origenDe, urlAutorizacion } from "@/lib/servicios/drive";

export const dynamic = "force-dynamic";

/** Devuelve la URL de autorización de Google (el navegador redirige a ella). */
export const GET = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const cred = await leerCredenciales(db);
  if (!cred) return errorJson(409, "Primero escribe las credenciales de Google (paso a paso en Configuración › Copias de seguridad › Google Drive).");
  return NextResponse.json({ success: true, data: { url: urlAutorizacion(crearState(admin.idUsuario), cred, origenDe(req)) } });
});
