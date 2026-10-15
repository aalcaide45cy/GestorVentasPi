import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { usuarios, tiendas } from "@/db/schema";
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
    const { nombre, ciudad } = body;

    if (!nombre) {
      return NextResponse.json({ message: "El nombre de la tienda es obligatorio" }, { status: 400 });
    }

    const [nueva] = await db.insert(tiendas).values({
      nombre,
      ciudad: ciudad || null
    }).returning();

    return NextResponse.json({ success: true, data: nueva }, { status: 201 });
  } catch (error: any) {
    console.error("Error al crear tienda:", error);
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
    const { id_tienda } = body;

    if (!id_tienda) {
      return NextResponse.json({ message: "Falta id_tienda" }, { status: 400 });
    }

    // Verificar si hay expedientes vinculados a esta tienda
    const tieneExpedientes = await db.query.expedientes.findFirst({
      where: (exp, { eq }) => eq(exp.id_tienda, Number(id_tienda))
    });

    if (tieneExpedientes) {
      return NextResponse.json({
        message: "No se puede eliminar la tienda porque tiene expedientes de venta registrados."
      }, { status: 409 });
    }

    await db.delete(tiendas).where(eq(tiendas.id_tienda, Number(id_tienda)));

    return NextResponse.json({ success: true, message: "Tienda eliminada correctamente" });
  } catch (error: any) {
    console.error("Error al eliminar tienda:", error);
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
    const { id_tienda, nombre, ciudad } = body;

    if (!id_tienda || !nombre) {
      return NextResponse.json({ message: "Faltan datos requeridos (id_tienda, nombre)" }, { status: 400 });
    }

    const [actualizada] = await db.update(tiendas)
      .set({ nombre, ciudad: ciudad || null })
      .where(eq(tiendas.id_tienda, Number(id_tienda)))
      .returning();

    return NextResponse.json({ success: true, data: actualizada });
  } catch (error: any) {
    console.error("Error al actualizar tienda:", error);
    return NextResponse.json({ message: error.message || "Error interno" }, { status: 500 });
  }
}
