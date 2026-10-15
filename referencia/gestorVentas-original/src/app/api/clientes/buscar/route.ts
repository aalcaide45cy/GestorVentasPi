import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { clientes } from "@/db/schema";
import { or, ilike } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";

    if (!q.trim()) {
      return NextResponse.json({ data: [] });
    }

    const matched = await db.query.clientes.findMany({
      where: or(
        ilike(clientes.nombre, `%${q}%`),
        ilike(clientes.dni, `%${q}%`)
      ),
      with: {
        emails: true,
        telefonos: true
      },
      limit: 10
    });

    return NextResponse.json({ data: matched });
  } catch (error: any) {
    console.error("Error al buscar clientes:", error);
    return NextResponse.json({ message: error.message || "Error interno" }, { status: 500 });
  }
}
