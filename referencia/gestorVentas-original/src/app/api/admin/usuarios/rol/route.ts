import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    // Validar que el usuario actual es administrador en la BD local
    const localAdmin = await db.query.usuarios.findFirst({
      where: eq(usuarios.clerk_id, userId),
    });

    if (!localAdmin || localAdmin.rol !== "administrador") {
      return NextResponse.json({ message: "Prohibido: Se requieren permisos de Administrador" }, { status: 403 });
    }

    // Obtener los datos del body
    const body = await req.json();
    const { id_usuario, rol } = body;

    if (!id_usuario || !rol) {
      return NextResponse.json({ message: "Faltan datos requeridos (id_usuario, rol)" }, { status: 400 });
    }

    // Validar el rol enviado
    const rolesValidos = ["administrador", "director", "jefe_zona", "jefe_tienda", "vendedor", "invitado"];
    if (!rolesValidos.includes(rol.toLowerCase())) {
      return NextResponse.json({ message: "Rol no válido" }, { status: 400 });
    }

    // Actualizar el rol en la base de datos
    await db.update(usuarios)
      .set({ rol: rol.toLowerCase() })
      .where(eq(usuarios.id_usuario, id_usuario));

    return NextResponse.json({ success: true, message: "Rol de usuario actualizado con éxito" });
  } catch (error: any) {
    console.error("Error al actualizar rol de usuario:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
