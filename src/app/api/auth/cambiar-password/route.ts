import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { getSesionActual, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { cambiarPassword } from "@/lib/servicios/autenticacion";

export const dynamic = "force-dynamic";

const esquema = z.object({
  actual: z.string().min(1, "Indica tu contraseña actual").max(512),
  nueva: z.string().min(1, "Indica la nueva contraseña").max(512),
});

/** Cambia la contraseña propia; el resto de sesiones del usuario se cierran. */
export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession();
  const { actual, nueva } = await leerJson(req, esquema);
  const sesion = await getSesionActual();
  await cambiarPassword(db, usuario.idUsuario, actual, nueva, sesion?.sesionId ?? null);
  await auditar({ idUsuario: usuario.idUsuario, accion: "password_cambiada" });
  return NextResponse.json({ ok: true, message: "Contraseña actualizada correctamente." });
});
