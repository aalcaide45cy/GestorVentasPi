import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { importacionesBloques, usuarios } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = 'force-dynamic';

export async function GET() {
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

    const blocks = await db.query.importacionesBloques.findMany({
      orderBy: [desc(importacionesBloques.fecha)],
      with: {
        usuario: {
          columns: {
            nombre: true,
            rol: true
          }
        },
        registros: {
          with: {
            expediente: {
              with: {
                modelo: {
                  with: {
                    marca: true
                  }
                },
                tienda: true,
                tipoDeVenta: true,
                estadoVehiculo: true
              }
            }
          }
        }
      }
    });

    return NextResponse.json({ success: true, data: blocks }, { status: 200 });
  } catch (error: any) {
    console.error("Error al obtener log de importaciones:", error);
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

    if (!id) {
      return NextResponse.json({ message: "ID del bloque es requerido" }, { status: 400 });
    }

    await db.delete(importacionesBloques).where(eq(importacionesBloques.id, Number(id)));

    return NextResponse.json({ success: true, message: "Bloque de importación eliminado correctamente de los registros." }, { status: 200 });
  } catch (error: any) {
    console.error("Error al eliminar log de importación:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
