import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { auditar } from "@/lib/auditoria";
import { crearSesion, ipCliente } from "@/lib/auth/sesion";
import { errorJson, leerJson, manejar } from "@/lib/http";
import { iniciarLogin, limpiarCaducadas } from "@/lib/servicios/autenticacion";

export const dynamic = "force-dynamic";

const esquema = z.object({
  email: z.string().trim().min(1, "Indica tu correo electrónico").max(255),
  password: z.string().min(1, "Indica tu contraseña").max(512),
});

let ultimaLimpieza = 0;

/** Paso 1: correo y contraseña. Crea una sesión parcial; el segundo factor la completa. */
export const POST = manejar(async (req: Request) => {
  const { email, password } = await leerJson(req, esquema);
  const ip = await ipCliente();
  const r = await iniciarLogin(db, { email, password, ip });

  if (r.estado === "bloqueado") {
    await auditar({ accion: "login_bloqueado", detalle: { email: email.toLowerCase() } });
    const respuesta = errorJson(429, "Demasiados intentos. Inténtalo de nuevo más tarde.");
    respuesta.headers.set("Retry-After", String(Math.max(1, Math.ceil((r.hasta.getTime() - Date.now()) / 1000))));
    return respuesta;
  }
  if (r.estado === "credenciales") {
    await auditar({ accion: "login_fallido", detalle: { email: email.toLowerCase() } });
    return errorJson(401, "Credenciales no válidas");
  }
  if (r.estado === "suspendida") {
    await auditar({ accion: "login_suspendida", detalle: { email: email.toLowerCase() } });
    return NextResponse.json(
      { message: "Tu acceso al sistema ha sido suspendido por un administrador. Si crees que esto es un error, por favor contacta con la dirección.", suspendida: true },
      { status: 403 },
    );
  }

  await crearSesion(r.idUsuario, false);
  await db.update(usuarios).set({ ultimoAcceso: new Date() }).where(eq(usuarios.idUsuario, r.idUsuario));
  await auditar({ idUsuario: r.idUsuario, accion: "login_password_ok" });

  // Sin planificador todavía: la limpieza diaria se hace de forma oportunista (como mucho cada 6 h).
  if (Date.now() - ultimaLimpieza > 6 * 60 * 60 * 1000) {
    ultimaLimpieza = Date.now();
    void limpiarCaducadas(db).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, requiere: r.requiere });
});
