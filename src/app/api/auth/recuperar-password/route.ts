import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { ipCliente } from "@/lib/auth/sesion";
import { errorJson, leerJson, manejar } from "@/lib/http";
import { recuperarPassword } from "@/lib/servicios/autenticacion";

export const dynamic = "force-dynamic";

const esquema = z.object({
  email: z.string().trim().min(1, "Indica tu correo electrónico").max(255),
  /** Código de 6 dígitos del autenticador o código de recuperación. */
  codigo: z.string().trim().min(1, "Introduce el código").max(32),
  nueva: z.string().min(1, "Indica la nueva contraseña").max(512),
});

/**
 * «He olvidado la contraseña»: correo + código del autenticador (o de recuperación) + contraseña nueva. Sin sesión. El mismo error
 * para un correo que no existe, una cuenta suspendida o un código incorrecto, y con límite de intentos.
 */
export const POST = manejar(async (req: Request) => {
  const { email, codigo, nueva } = await leerJson(req, esquema);
  const r = await recuperarPassword(db, { email, codigo, nueva, ip: await ipCliente() });
  if (r.estado === "bloqueado") {
    await auditar({ accion: "recuperar_password_bloqueado", detalle: { email: email.toLowerCase() } });
    const respuesta = errorJson(429, "Demasiados intentos. Inténtalo de nuevo más tarde.");
    respuesta.headers.set("Retry-After", String(Math.max(1, Math.ceil((r.hasta.getTime() - Date.now()) / 1000))));
    return respuesta;
  }
  if (r.estado === "incorrecto") {
    await auditar({ accion: "recuperar_password_fallido", detalle: { email: email.toLowerCase() } });
    return errorJson(401, "Correo o código no válidos. Si no tienes el autenticador, pide a un administrador que te ponga una contraseña temporal.");
  }
  await auditar({ accion: "password_recuperada", detalle: { email: email.toLowerCase(), conRecuperacion: r.quedanCodigos !== undefined } });
  return NextResponse.json({ ok: true, message: "Contraseña cambiada. Ya puedes iniciar sesión con la nueva.", ...(r.quedanCodigos !== undefined ? { quedanCodigos: r.quedanCodigos } : {}) });
});
