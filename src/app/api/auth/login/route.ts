import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { auditar } from "@/lib/auditoria";
import { hashPassword, verificarPassword } from "@/lib/auth/password";
import { crearSesion } from "@/lib/auth/sesion";
import { errorJson, leerJson, manejar } from "@/lib/http";

const esquema = z.object({
  email: z.string().trim().min(1, "Indica tu correo electrónico").max(255),
  password: z.string().min(1, "Indica tu contraseña").max(512),
});

/** Hash de relleno para igualar el tiempo de respuesta cuando el usuario no existe. */
let hashFalso: Promise<string> | null = null;

export const POST = manejar(async (req: Request) => {
  const { email, password } = await leerJson(req, esquema);
  const login = email.toLowerCase();

  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.loginEmail, login));
  const hashComparar = usuario?.passwordHash ?? (await (hashFalso ??= hashPassword("relleno-no-valido-123")));
  const correcta = await verificarPassword(hashComparar, password);

  if (!usuario || !correcta) {
    await auditar({ idUsuario: usuario?.idUsuario ?? null, accion: "login_fallido", detalle: { email: login } });
    return errorJson(401, "Credenciales no válidas");
  }

  await crearSesion(usuario.idUsuario);
  await db.update(usuarios).set({ ultimoAcceso: new Date() }).where(eq(usuarios.idUsuario, usuario.idUsuario));
  await auditar({ idUsuario: usuario.idUsuario, accion: "login_ok" });
  return NextResponse.json({ ok: true });
});
