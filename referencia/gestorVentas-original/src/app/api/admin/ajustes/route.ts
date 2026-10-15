import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { ajustes, usuarios } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = 'force-dynamic';

// GET: Obtener todos los ajustes en formato de objeto { [clave]: valor }
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const list = await db.select().from(ajustes);
    const result: Record<string, string> = {};
    list.forEach(row => {
      result[row.clave] = row.valor;
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Error al obtener ajustes:", error);
    return NextResponse.json({ success: false, message: error.message || "Error al obtener ajustes" }, { status: 500 });
  }
}

// POST: Crear o actualizar un ajuste (Solo para administradores)
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const localUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.clerk_id, userId),
    });

    if (!localUser || localUser.rol !== "administrador") {
      return NextResponse.json({ message: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const { clave, valor } = body;

    if (!clave) {
      return NextResponse.json({ success: false, message: "Falta la clave del ajuste" }, { status: 400 });
    }

    const existing = await db.select().from(ajustes).where(eq(ajustes.clave, clave)).limit(1);
    
    if (existing.length > 0) {
      await db.update(ajustes)
        .set({ valor: String(valor) })
        .where(eq(ajustes.clave, clave));
    } else {
      await db.insert(ajustes).values({
        clave,
        valor: String(valor)
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error al guardar ajuste:", error);
    return NextResponse.json({ success: false, message: error.message || "Error al guardar ajuste" }, { status: 500 });
  }
}
