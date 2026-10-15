import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import {
  actualizarUsuario,
  crearUsuario,
  eliminarUsuario,
  esquemaActualizarUsuario,
  esquemaCrearUsuario,
} from "@/lib/servicios/usuarios";

export const dynamic = "force-dynamic";

export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const entrada = await leerJson(req, esquemaCrearUsuario);
  const { usuario, passwordTemporal } = await crearUsuario(db, entrada);
  await auditar({ idUsuario: admin.idUsuario, accion: "usuario_creado", entidad: "usuarios", entidadId: usuario.id_usuario });
  // La contraseña temporal se muestra una sola vez al administrador.
  return NextResponse.json({ success: true, data: usuario, passwordTemporal }, { status: 201 });
});

export const PUT = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const entrada = await leerJson(req, esquemaActualizarUsuario);
  await actualizarUsuario(db, admin, entrada);
  await auditar({
    idUsuario: admin.idUsuario,
    accion: entrada.bloqueado === undefined ? "usuario_editado" : entrada.bloqueado ? "usuario_suspendido" : "usuario_reactivado",
    entidad: "usuarios",
    entidadId: entrada.id_usuario,
  });
  return NextResponse.json({ success: true, message: "Usuario actualizado correctamente" });
});

export const DELETE = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const { id_usuario } = await leerJson(req, z.object({ id_usuario: z.coerce.number().int().positive("Falta id_usuario") }));
  await eliminarUsuario(db, admin, id_usuario);
  await auditar({ idUsuario: admin.idUsuario, accion: "usuario_eliminado", entidad: "usuarios", entidadId: id_usuario });
  return NextResponse.json({ success: true, message: "Usuario eliminado correctamente" });
});
