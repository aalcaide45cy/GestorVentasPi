import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerJson, manejar } from "@/lib/http";
import { esquemaPerfil, guardarPerfil, obtenerUsuario } from "@/lib/servicios/usuarios";

export const dynamic = "force-dynamic";

export const GET = manejar(async () => {
  const usuario = await requireSession();
  const perfil = await obtenerUsuario(db, usuario.idUsuario);
  if (!perfil) return errorJson(404, "Usuario no encontrado");
  return NextResponse.json(perfil);
});

export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession();
  const entrada = await leerJson(req, esquemaPerfil);
  await guardarPerfil(db, usuario.idUsuario, entrada);
  return NextResponse.json({ success: true, message: "Perfil actualizado correctamente" });
});
