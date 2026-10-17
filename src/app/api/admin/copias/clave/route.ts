import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { configurarClaveRecuperacion } from "@/lib/servicios/clave-recuperacion";

export const dynamic = "force-dynamic";

const esquema = z.object({ clave: z.string().min(10, "La clave debe tener al menos 10 caracteres").max(200) });

/** Fija o cambia la «clave de recuperación»: permite restaurar las copias en otra instalación con otro APP_SECRET. */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const { clave } = await leerJson(req, esquema);
  await configurarClaveRecuperacion(db, clave);
  await auditar({ idUsuario: admin.idUsuario, accion: "clave_recuperacion_fijada", entidad: "ajustes" });
  return NextResponse.json({ success: true });
});
