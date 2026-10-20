import { NextResponse } from "next/server";
import { z } from "zod";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { cancelarTarea, descartarTarea, listarTareas, obtenerTarea } from "@/lib/servicios/tareas";

export const dynamic = "force-dynamic";

/** Tareas en segundo plano de la persona (el administrador ve todas). Con `?id=` devuelve solo esa. */
export const GET = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const verTodas = esAdministrador(usuario.rol);
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const t = obtenerTarea(id);
    if (!t || (!verTodas && t.idUsuario !== usuario.idUsuario)) throw new HttpError(404, "Tarea no encontrada");
    return NextResponse.json({ success: true, data: t });
  }
  return NextResponse.json({ success: true, data: listarTareas(usuario.idUsuario, verTodas) });
});

const esquema = z.object({ accion: z.enum(["cancelar", "descartar"]), id: z.string().min(1).max(60) });

/** Cancela una tarea (en cola o en marcha) o quita de la lista una ya terminada. */
export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const e = await leerJson(req, esquema);
  const t = obtenerTarea(e.id);
  if (!t || (!esAdministrador(usuario.rol) && t.idUsuario !== usuario.idUsuario)) throw new HttpError(404, "Tarea no encontrada");
  if (e.accion === "cancelar") return NextResponse.json({ success: true, data: cancelarTarea(e.id) });
  descartarTarea(e.id);
  return NextResponse.json({ success: true });
});
