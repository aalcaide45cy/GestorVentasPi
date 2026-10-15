import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { ROLES } from "@/lib/auth/permisos";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { cambiarRol } from "@/lib/servicios/usuarios";

const esquema = z.object({
  id_usuario: z.coerce.number().int().positive("Faltan datos requeridos (id_usuario, rol)"),
  rol: z.string().toLowerCase().pipe(z.enum(ROLES, { message: "Rol no válido" })),
});

export const PUT = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const { id_usuario, rol } = await leerJson(req, esquema);
  await cambiarRol(db, admin, id_usuario, rol);
  await auditar({ idUsuario: admin.idUsuario, accion: "rol_cambiado", entidad: "usuarios", entidadId: id_usuario, detalle: { rol } });
  return NextResponse.json({ success: true, message: "Rol de usuario actualizado con éxito" });
});
