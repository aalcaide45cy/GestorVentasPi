import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { clientes } from "@/db/schema";
import { eq, ilike, or } from "drizzle-orm";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { dni, nombre } = body;

    if (!nombre && !dni) {
      return NextResponse.json({ exists: false }, { status: 200 });
    }

    const conditions = [];

    if (dni && String(dni).trim()) {
      conditions.push(eq(clientes.dni, String(dni).trim()));
    }

    if (nombre && String(nombre).trim()) {
      conditions.push(ilike(clientes.nombre, String(nombre).trim()));
    }

    if (conditions.length === 0) {
      return NextResponse.json({ exists: false }, { status: 200 });
    }

    // Buscar si existe algún cliente que coincida con las condiciones
    const clienteExistente = await db.query.clientes.findFirst({
      where: or(...conditions),
    });

    if (clienteExistente) {
      return NextResponse.json({
        exists: true,
        cliente: {
          id: clienteExistente.id,
          nombre: clienteExistente.nombre,
          dni: clienteExistente.dni,
        }
      }, { status: 200 });
    }

    return NextResponse.json({ exists: false }, { status: 200 });
  } catch (error: any) {
    console.error("Error al verificar existencia de cliente:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
