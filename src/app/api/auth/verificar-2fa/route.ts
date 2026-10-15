import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { ipCliente, requireSesionParcial, rotarSesion } from "@/lib/auth/sesion";
import { errorJson, leerJson, manejar } from "@/lib/http";
import { verificarSegundoFactor } from "@/lib/servicios/autenticacion";

export const dynamic = "force-dynamic";

const esquema = z.object({ codigo: z.string().trim().min(1, "Introduce el código").max(32) });

/** Paso 2: código de 6 dígitos o código de recuperación. Completa la sesión y rota su identificador. */
export const POST = manejar(async (req: Request) => {
  const sesion = await requireSesionParcial();
  const { codigo } = await leerJson(req, esquema);
  if (sesion.mfaVerificado) return NextResponse.json({ ok: true, debeCambiarPassword: sesion.usuario.debeCambiarPassword });

  const r = await verificarSegundoFactor(db, sesion.usuario.idUsuario, codigo, await ipCliente());
  if (r.estado === "bloqueado") {
    const respuesta = errorJson(429, "Demasiados intentos. Inténtalo de nuevo más tarde.");
    respuesta.headers.set("Retry-After", String(Math.max(1, Math.ceil((r.hasta.getTime() - Date.now()) / 1000))));
    return respuesta;
  }
  if (r.estado === "incorrecto") {
    await auditar({ idUsuario: sesion.usuario.idUsuario, accion: "login_2fa_fallido" });
    return errorJson(401, "Código no válido");
  }

  await rotarSesion(sesion.sesionId, true);
  await auditar({ idUsuario: sesion.usuario.idUsuario, accion: r.conRecuperacion ? "login_ok_recuperacion" : "login_ok" });
  return NextResponse.json({
    ok: true,
    debeCambiarPassword: sesion.usuario.debeCambiarPassword,
    ...(r.conRecuperacion ? { quedanCodigos: r.quedanCodigos } : {}),
  });
});
