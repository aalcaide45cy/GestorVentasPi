import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { borrarCredenciales, guardarCredenciales } from "@/lib/servicios/drive";

export const dynamic = "force-dynamic";

const esquema = z.object({ clientId: z.string().min(10).max(300), clientSecret: z.string().min(10).max(300) });

/** Guarda las credenciales de Google (ID y secreto de cliente) dentro de la aplicación, con el secreto cifrado. */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const e = await leerJson(req, esquema);
  await guardarCredenciales(db, e.clientId, e.clientSecret);
  await auditar({ idUsuario: admin.idUsuario, accion: "drive_credenciales_guardadas", entidad: "ajustes" });
  return NextResponse.json({ success: true });
});

export const DELETE = manejar(async () => {
  const admin = await requireSession("administrador");
  await borrarCredenciales(db);
  await auditar({ idUsuario: admin.idUsuario, accion: "drive_credenciales_borradas", entidad: "ajustes" });
  return NextResponse.json({ success: true });
});
