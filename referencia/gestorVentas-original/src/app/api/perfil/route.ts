import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { usuarios, emailsUsuarios, telefonosUsuarios, usuariosTiendas } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const localUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.clerk_id, userId),
      with: {
        emails: true,
        telefonos: true,
        tiendas: true
      }
    });

    if (!localUser) {
      return NextResponse.json({ message: "Usuario no encontrado" }, { status: 404 });
    }

    return NextResponse.json(localUser);
  } catch (error: any) {
    console.error("Error al obtener perfil:", error);
    return NextResponse.json({ message: error.message || "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { nombre, emails, telefonos, tiendas: tiendasIds } = body;

    if (!nombre) {
      return NextResponse.json({ message: "El nombre es obligatorio" }, { status: 400 });
    }

    // Obtener usuario local
    const localUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.clerk_id, userId),
    });

    if (!localUser) {
      return NextResponse.json({ message: "Usuario no encontrado en base de datos" }, { status: 404 });
    }

    // 3. Ejecutar secuencialmente para actualizar nombre, reinsertar emails/teléfonos y tiendas
    // 1. Actualizar nombre de usuario
    await db.update(usuarios)
      .set({ nombre })
      .where(eq(usuarios.id_usuario, localUser.id_usuario));

    // 2. Limpiar emails antiguos y reinsertar
    await db.delete(emailsUsuarios)
      .where(eq(emailsUsuarios.id_usuario, localUser.id_usuario));

    if (emails && emails.length > 0) {
      await db.insert(emailsUsuarios).values(
        emails.filter((e: any) => e.email).map((e: any) => ({
          id_usuario: localUser.id_usuario,
          email: e.email,
          tipo_email: e.tipo_email || "Principal"
        }))
      );
    }

    // 3. Limpiar teléfonos antiguos y reinsertar
    await db.delete(telefonosUsuarios)
      .where(eq(telefonosUsuarios.id_usuario, localUser.id_usuario));

    if (telefonos && telefonos.length > 0) {
      await db.insert(telefonosUsuarios).values(
        telefonos.filter((t: any) => t.telefono).map((t: any) => ({
          id_usuario: localUser.id_usuario,
          telefono: t.telefono,
          tipo_telefono: t.tipo_telefono || "Principal"
        }))
      );
    }

    // 4. Limpiar tiendas del usuario y reinsertar
    await db.delete(usuariosTiendas)
      .where(eq(usuariosTiendas.id_usuario, localUser.id_usuario));

    if (tiendasIds && tiendasIds.length > 0) {
      await db.insert(usuariosTiendas).values(
        tiendasIds.map((tiendaId: number) => ({
          id_usuario: localUser.id_usuario,
          id_tienda: tiendaId
        }))
      );
    }

    return NextResponse.json({ success: true, message: "Perfil actualizado correctamente" });
  } catch (error: any) {
    console.error("Error al actualizar perfil:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
