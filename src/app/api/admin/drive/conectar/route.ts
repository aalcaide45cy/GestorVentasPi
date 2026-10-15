import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, manejar } from "@/lib/http";
import { crearState, driveConfigurado, urlAutorizacion } from "@/lib/servicios/drive";

export const dynamic = "force-dynamic";

/** Devuelve la URL de autorización de Google (el navegador redirige a ella). */
export const GET = manejar(async () => {
  const admin = await requireSession("administrador");
  if (!driveConfigurado()) return errorJson(409, "Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o PUBLIC_URL en el fichero .env (ver la guía de instalación).");
  return NextResponse.json({ success: true, data: { url: urlAutorizacion(crearState(admin.idUsuario)) } });
});
