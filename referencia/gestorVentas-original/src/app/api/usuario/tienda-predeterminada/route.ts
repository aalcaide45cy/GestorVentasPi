import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { id_tienda } = body;

    const localUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.clerk_id, userId),
    });

    if (!localUser) {
      return NextResponse.json({ message: "Usuario no encontrado" }, { status: 404 });
    }

    await db.update(usuarios)
      .set({ tienda_predeterminada_id: id_tienda ? Number(id_tienda) : null })
      .where(eq(usuarios.id_usuario, localUser.id_usuario));

    return NextResponse.json({
      success: true,
      message: "Tienda predeterminada actualizada correctamente"
    }, { status: 200 });
  } catch (error: any) {
    console.error("Error al establecer tienda predeterminada:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
