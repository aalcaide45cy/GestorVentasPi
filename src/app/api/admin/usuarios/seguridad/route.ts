import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { resetear2fa, resetearPassword, revocarSesiones } from "@/lib/servicios/autenticacion";

export const dynamic = "force-dynamic";

const esquema = z.object({
  id_usuario: z.coerce.number().int().positive("Falta id_usuario"),
  accion: z.enum(["reset_2fa", "reset_password", "cerrar_sesiones"]),
});

/** Acciones de seguridad del administrador sobre un usuario: restablecer su 2FA, ponerle una contraseña temporal o cerrar todas sus sesiones. */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const { id_usuario, accion } = await leerJson(req, esquema);

  if (accion === "reset_2fa") {
    await resetear2fa(db, id_usuario);
    await auditar({ idUsuario: admin.idUsuario, accion: "2fa_reseteado", entidad: "usuarios", entidadId: id_usuario });
    return NextResponse.json({ success: true, message: "Doble factor restablecido. El usuario deberá activarlo de nuevo al entrar." });
  }
  if (accion === "reset_password") {
    const passwordTemporal = await resetearPassword(db, id_usuario);
    await auditar({ idUsuario: admin.idUsuario, accion: "password_reseteada", entidad: "usuarios", entidadId: id_usuario });
    // La contraseña temporal solo se devuelve aquí, una vez: no se guarda en ningún registro
    return NextResponse.json({ success: true, message: "Contraseña temporal creada. Díctasela al usuario: tendrá que cambiarla al entrar.", passwordTemporal }, { headers: { "Cache-Control": "no-store" } });
  }
  const cerradas = await revocarSesiones(db, id_usuario);
  await auditar({ idUsuario: admin.idUsuario, accion: "sesiones_cerradas", entidad: "usuarios", entidadId: id_usuario, detalle: { cerradas } });
  return NextResponse.json({ success: true, message: `Sesiones cerradas: ${cerradas}.` });
});
