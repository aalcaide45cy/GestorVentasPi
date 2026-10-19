import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { getSesionActual, ipCliente, requireSession } from "@/lib/auth/sesion";
import { errorJson, leerJson, manejar } from "@/lib/http";
import { cambiarPassword, cambiarPasswordConCodigo } from "@/lib/servicios/autenticacion";

export const dynamic = "force-dynamic";

const esquema = z
  .object({
    actual: z.string().max(512).optional(),
    /** Código del autenticador (o de recuperación): sustituye a la contraseña actual para quien no la recuerda. */
    codigo: z.string().trim().max(32).optional(),
    nueva: z.string().min(1, "Indica la nueva contraseña").max(512),
  })
  .refine((v) => !!v.actual || !!v.codigo, { message: "Indica tu contraseña actual o el código de tu autenticador" });

/** Cambia la contraseña propia (con la actual o con el código del autenticador); el resto de sesiones del usuario se cierran. */
export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession();
  const { actual, codigo, nueva } = await leerJson(req, esquema);
  const sesion = await getSesionActual();
  if (codigo) {
    const r = await cambiarPasswordConCodigo(db, usuario.idUsuario, codigo, nueva, sesion?.sesionId ?? null, await ipCliente());
    if (r.estado === "bloqueado") {
      const respuesta = errorJson(429, "Demasiados intentos. Inténtalo de nuevo más tarde.");
      respuesta.headers.set("Retry-After", String(Math.max(1, Math.ceil((r.hasta.getTime() - Date.now()) / 1000))));
      return respuesta;
    }
    if (r.estado === "incorrecto") {
      await auditar({ idUsuario: usuario.idUsuario, accion: "password_cambio_codigo_fallido" });
      return errorJson(401, "Código no válido");
    }
    await auditar({ idUsuario: usuario.idUsuario, accion: "password_cambiada", detalle: { conCodigo: true } });
    return NextResponse.json({ ok: true, message: "Contraseña actualizada correctamente.", ...(r.quedanCodigos !== undefined ? { quedanCodigos: r.quedanCodigos } : {}) });
  }
  await cambiarPassword(db, usuario.idUsuario, actual ?? "", nueva, sesion?.sesionId ?? null);
  await auditar({ idUsuario: usuario.idUsuario, accion: "password_cambiada" });
  return NextResponse.json({ ok: true, message: "Contraseña actualizada correctamente." });
});
