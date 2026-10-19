import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { crearSesion, ipCliente } from "@/lib/auth/sesion";
import { errorJson, leerJson, manejar } from "@/lib/http";
import { crearPrimerAdministrador } from "@/lib/servicios/primer-arranque";

export const dynamic = "force-dynamic";

const esquema = z.object({
  nombre: z.string().trim().min(1, "Escribe tu nombre").max(255),
  email: z.string().trim().min(1, "Escribe tu correo electrónico").max(255),
  password: z.string().min(1, "Escribe una contraseña").max(512),
  codigo: z.string().trim().min(1, "Escribe el código de primer arranque").max(32),
});

/**
 * Crea el primer administrador de una instalación nueva (solo mientras no exista ningún usuario). Deja una sesión parcial: el doble
 * factor se activa a continuación, como en cualquier alta.
 */
export const POST = manejar(async (req: Request) => {
  const entrada = await leerJson(req, esquema);
  const ip = await ipCliente();
  const r = await crearPrimerAdministrador(db, { ...entrada, ip });
  if (r.estado === "bloqueado") {
    const respuesta = errorJson(429, "Demasiados intentos. Inténtalo de nuevo más tarde.");
    respuesta.headers.set("Retry-After", String(Math.max(1, Math.ceil((r.hasta.getTime() - Date.now()) / 1000))));
    return respuesta;
  }
  if (r.estado === "codigo") {
    await auditar({ accion: "primer_arranque_codigo_incorrecto" });
    return errorJson(401, "El código de primer arranque no es correcto. Mira el registro del servidor o el archivo .primer-arranque.txt de la carpeta de copias.");
  }
  await crearSesion(r.idUsuario, false);
  await auditar({ idUsuario: r.idUsuario, accion: "primer_administrador_creado", detalle: { email: entrada.email.trim().toLowerCase() } });
  return NextResponse.json({ ok: true, requiere: "activar_2fa" }, { status: 201 });
});
