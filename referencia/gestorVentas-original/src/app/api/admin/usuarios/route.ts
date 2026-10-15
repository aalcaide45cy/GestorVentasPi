import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { usuarios, emailsUsuarios, telefonosUsuarios, expedientes } from "@/db/schema";
import { eq } from "drizzle-orm";

async function checkAdmin() {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await db.query.usuarios.findFirst({
    where: eq(usuarios.clerk_id, userId),
  });

  return user && user.rol === "administrador" ? user : null;
}

export async function POST(req: NextRequest) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ message: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const { nombre, email, telefono, rol, tipo_vendedor, patron_vo } = body;

    if (!nombre) {
      return NextResponse.json({ message: "El nombre es obligatorio" }, { status: 400 });
    }

    // Si se especifica email, verificar que no esté ya registrado
    if (email) {
      const emailExistente = await db.query.emailsUsuarios.findFirst({
        where: eq(emailsUsuarios.email, email)
      });
      if (emailExistente) {
        return NextResponse.json({ message: "Este correo electrónico ya está registrado en el sistema." }, { status: 409 });
      }
    }

    // Generar un ID temporal para Clerk
    const tempClerkId = `pending_${crypto.randomUUID()}`;

    // 1. Insertar el usuario local
    const [nuevoUsuario] = await db.insert(usuarios).values({
      clerk_id: tempClerkId,
      nombre,
      rol: rol || "invitado",
      fecha_de_registro: new Date().toISOString().split("T")[0],
      bloqueado: false,
      tipo_vendedor: tipo_vendedor || "VN",
      patron_vo: patron_vo || "Estándar VO"
    }).returning();

    // 2. Insertar email
    if (email) {
      await db.insert(emailsUsuarios).values({
        id_usuario: nuevoUsuario.id_usuario,
        email,
        tipo_email: "Principal"
      });
    }

    // 3. Insertar teléfono
    if (telefono) {
      await db.insert(telefonosUsuarios).values({
        id_usuario: nuevoUsuario.id_usuario,
        telefono,
        tipo_telefono: "Principal"
      });
    }

    return NextResponse.json({ success: true, data: nuevoUsuario }, { status: 201 });
  } catch (error: any) {
    console.error("Error al crear usuario por admin:", error);
    return NextResponse.json({ message: error.message || "Error interno" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ message: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const { id_usuario, nombre, rol, bloqueado, email, telefono, tipo_vendedor, patron_vo } = body;

    if (!id_usuario) {
      return NextResponse.json({ message: "Falta id_usuario" }, { status: 400 });
    }

    // Impedir que un admin se auto-bloquee o auto-degrade de rol
    const targetUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.id_usuario, Number(id_usuario))
    });

    if (targetUser?.clerk_id === admin.clerk_id) {
      if (bloqueado === true) {
        return NextResponse.json({ message: "No puedes bloquear tu propia cuenta." }, { status: 400 });
      }
      if (rol !== "administrador") {
        return NextResponse.json({ message: "No puedes degradar tu propio rol de Administrador." }, { status: 400 });
      }
    }

    // 1. Actualizar datos de usuario
    await db.update(usuarios)
      .set({
        nombre: nombre !== undefined ? nombre : undefined,
        rol: rol !== undefined ? rol : undefined,
        bloqueado: bloqueado !== undefined ? bloqueado : undefined,
        tipo_vendedor: tipo_vendedor !== undefined ? tipo_vendedor : undefined,
        patron_vo: patron_vo !== undefined ? patron_vo : undefined
      })
      .where(eq(usuarios.id_usuario, Number(id_usuario)));

    // 2. Actualizar email principal
    if (email !== undefined) {
      await db.delete(emailsUsuarios).where(eq(emailsUsuarios.id_usuario, Number(id_usuario)));
      if (email) {
        await db.insert(emailsUsuarios).values({
          id_usuario: Number(id_usuario),
          email,
          tipo_email: "Principal"
        });
      }
    }

    // 3. Actualizar teléfono principal
    if (telefono !== undefined) {
      await db.delete(telefonosUsuarios).where(eq(telefonosUsuarios.id_usuario, Number(id_usuario)));
      if (telefono) {
        await db.insert(telefonosUsuarios).values({
          id_usuario: Number(id_usuario),
          telefono,
          tipo_telefono: "Principal"
        });
      }
    }

    return NextResponse.json({ success: true, message: "Usuario actualizado correctamente" });
  } catch (error: any) {
    console.error("Error al actualizar usuario por admin:", error);
    return NextResponse.json({ message: error.message || "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ message: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const { id_usuario } = body;

    if (!id_usuario) {
      return NextResponse.json({ message: "Falta id_usuario" }, { status: 400 });
    }

    const targetUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.id_usuario, Number(id_usuario))
    });

    if (targetUser?.clerk_id === admin.clerk_id) {
      return NextResponse.json({ message: "No puedes eliminar tu propia cuenta." }, { status: 400 });
    }

    // Verificar si el usuario tiene expedientes
    const tieneExpedientes = await db.query.expedientes.findFirst({
      where: eq(expedientes.id_usuario, Number(id_usuario))
    });

    if (tieneExpedientes) {
      return NextResponse.json({
        message: "No se puede eliminar el usuario porque tiene expedientes registrados. Prueba bloqueando su cuenta para suspender su acceso."
      }, { status: 409 });
    }

    // Eliminar
    await db.delete(usuarios).where(eq(usuarios.id_usuario, Number(id_usuario)));

    return NextResponse.json({ success: true, message: "Usuario eliminado correctamente" });
  } catch (error: any) {
    console.error("Error al eliminar usuario por admin:", error);
    return NextResponse.json({ message: error.message || "Error interno" }, { status: 500 });
  }
}
