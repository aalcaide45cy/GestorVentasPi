import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { clientes, emailsClientes, telefonosClientes, usuarios, expedientes } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    // Verificar rol del usuario local
    const localUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.clerk_id, userId),
    });

    if (!localUser || localUser.rol === "invitado") {
      return NextResponse.json({ message: "No tienes permisos para crear clientes" }, { status: 403 });
    }

    const body = await req.json();
    const { dni, nombre, fecha_de_nacimiento, tienda_id, emails, telefonos } = body;

    if (!nombre) {
      return NextResponse.json({ message: "Nombre es un campo obligatorio" }, { status: 400 });
    }

    // Verificar si el cliente ya existe por DNI (si se proporciona)
    let clienteExistente = null;
    if (dni) {
      clienteExistente = await db.query.clientes.findFirst({
        where: eq(clientes.dni, dni),
      });
    }

    if (clienteExistente) {
      return NextResponse.json({ message: "Ya existe un cliente registrado con este DNI/NIE." }, { status: 409 });
    }

    // 1. Insertar el cliente
    const [nuevoCliente] = await db.insert(clientes).values({
      cliente_id: crypto.randomUUID(),
      dni: dni || null,
      nombre,
      fecha_de_nacimiento: fecha_de_nacimiento || null,
      tienda_id: tienda_id ? Number(tienda_id) : (localUser.tienda_predeterminada_id || null)
    }).returning();

    const clienteId = nuevoCliente.id;

    // 2. Insertar emails
    if (emails && emails.length > 0) {
      await db.insert(emailsClientes).values(
        emails.map((e: any) => ({
          id_cliente: clienteId,
          email: e.email,
          tipo_email: e.tipo || "Principal"
        }))
      );
    }

    // 3. Insertar teléfonos
    if (telefonos && telefonos.length > 0) {
      await db.insert(telefonosClientes).values(
        telefonos.map((t: any) => ({
          id_cliente: clienteId,
          telefono: t.telefono,
          tipo_telefono: t.tipo || "Principal"
        }))
      );
    }

    return NextResponse.json({ success: true, data: nuevoCliente }, { status: 201 });
  } catch (error: any) {
    console.error("Error al crear cliente:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    // Verificar rol del usuario local
    const localUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.clerk_id, userId),
    });

    if (!localUser || localUser.rol === "invitado") {
      return NextResponse.json({ message: "No tienes permisos para editar clientes" }, { status: 403 });
    }

    const body = await req.json();
    const { id, dni, nombre, fecha_de_nacimiento, tienda_id, emails, telefonos } = body;

    if (!id || !nombre) {
      return NextResponse.json({ message: "ID y Nombre son campos obligatorios" }, { status: 400 });
    }

    // Verificar si el cliente existe
    const clienteExistente = await db.query.clientes.findFirst({
      where: eq(clientes.id, id),
    });

    if (!clienteExistente) {
      return NextResponse.json({ message: "Cliente no encontrado" }, { status: 404 });
    }

    // Verificar DNI duplicado para otro cliente (si se proporciona)
    let dniExistente = null;
    if (dni) {
      dniExistente = await db.query.clientes.findFirst({
        where: eq(clientes.dni, dni),
      });
    }

    if (dniExistente && dniExistente.id !== id) {
      return NextResponse.json({ message: "Ya existe otro cliente registrado con este DNI/NIE." }, { status: 409 });
    }

    // 1. Actualizar el cliente
    await db.update(clientes).set({
      dni: dni || null,
      nombre,
      fecha_de_nacimiento: fecha_de_nacimiento || null,
      tienda_id: tienda_id ? Number(tienda_id) : null
    }).where(eq(clientes.id, id));

    // 2. Actualizar emails
    await db.delete(emailsClientes).where(eq(emailsClientes.id_cliente, id));
    if (emails && emails.length > 0) {
      await db.insert(emailsClientes).values(
        emails.map((e: any) => ({
          id_cliente: id,
          email: e.email,
          tipo_email: e.tipo || e.tipo_email || "Principal"
        }))
      );
    }

    // 3. Actualizar teléfonos
    await db.delete(telefonosClientes).where(eq(telefonosClientes.id_cliente, id));
    if (telefonos && telefonos.length > 0) {
      await db.insert(telefonosClientes).values(
        telefonos.map((t: any) => ({
          id_cliente: id,
          telefono: t.telefono,
          tipo_telefono: t.tipo || t.tipo_telefono || "Principal"
        }))
      );
    }

    return NextResponse.json({ success: true, message: "Cliente actualizado correctamente" }, { status: 200 });
  } catch (error: any) {
    console.error("Error al editar cliente:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const localUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.clerk_id, userId),
    });

    if (!localUser || localUser.rol === "invitado") {
      return NextResponse.json({ message: "No autorizado" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    let idsToDelete: number[] = [];

    if (id) {
      idsToDelete = [Number(id)];
    } else {
      try {
        const body = await req.json();
        if (body.ids && Array.isArray(body.ids)) {
          idsToDelete = body.ids.map(Number);
        }
      } catch (e) {
        // Ignorar error de lectura de body
      }
    }

    if (idsToDelete.length === 0) {
      return NextResponse.json({ message: "Faltan los IDs de los clientes a eliminar" }, { status: 400 });
    }

    // 1. Poner a null el id_cliente en los expedientes correspondientes
    await db.update(expedientes)
      .set({ id_cliente: null })
      .where(inArray(expedientes.id_cliente, idsToDelete));

    // 2. Eliminar los clientes (los correos y teléfonos se borran por cascade en FK)
    await db.delete(clientes)
      .where(inArray(clientes.id, idsToDelete));

    return NextResponse.json({
      success: true,
      message: idsToDelete.length === 1
        ? "Cliente eliminado correctamente"
        : `${idsToDelete.length} clientes eliminados correctamente`
    }, { status: 200 });

  } catch (error: any) {
    console.error("Error al eliminar clientes:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
