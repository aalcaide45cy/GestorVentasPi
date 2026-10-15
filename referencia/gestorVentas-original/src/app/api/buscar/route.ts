import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { clientes, expedientes } from "@/db/schema";
import { or, ilike, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";

    if (!q.trim()) {
      return NextResponse.json({ expedientes: [], clientes: [] });
    }

    // 1. Clientes
    const matchedClientes = await db.query.clientes.findMany({
      where: or(
        ilike(clientes.nombre, `%${q}%`),
        ilike(clientes.dni, `%${q}%`)
      ),
      limit: 5
    });

    // 2. Expedientes (buscar por matricula, VIN)
    const dbExpedientes = await db.query.expedientes.findMany({
      orderBy: [desc(expedientes.id_expediente)],
      with: {
        cliente: true,
        modelo: {
          with: {
            marca: true
          }
        }
      }
    });

    const matchedExpedientes = dbExpedientes
      .filter(exp => {
        const qLower = q.toLowerCase();
        const matriculaMatch = exp.matricula?.toLowerCase().includes(qLower);
        const clienteNameMatch = exp.cliente?.nombre?.toLowerCase().includes(qLower);
        const clienteDniMatch = exp.cliente?.dni?.toLowerCase().includes(qLower);
        const modeloMatch = exp.modelo?.nombre_modelo?.toLowerCase().includes(qLower);
        const marcaMatch = exp.modelo?.marca?.nombre?.toLowerCase().includes(qLower);
        const idMatch = String(exp.id_expediente).includes(qLower);
        return matriculaMatch || clienteNameMatch || clienteDniMatch || modeloMatch || marcaMatch || idMatch;
      })
      .slice(0, 5);

    return NextResponse.json({
      clientes: matchedClientes.map(c => ({
        id: c.id,
        nombre: c.nombre,
        dni: c.dni,
        label: `${c.nombre} (${c.dni || "DNI N/D"})`
      })),
      expedientes: matchedExpedientes.map(e => {
        const modelName = e.modelo?.nombre_modelo || "VO";
        const brandName = e.modelo?.marca?.nombre || "";
        const clientName = e.cliente?.nombre || "Sin Cliente";
        const matricula = e.matricula ? ` [${e.matricula}]` : "";
        return {
          id_expediente: e.id_expediente,
          label: `#EXP-${String(e.id_expediente).padStart(4, "0")} - ${clientName} - ${brandName} ${modelName}${matricula}`
        };
      })
    });
  } catch (error: any) {
    console.error("Error al buscar sugerencias:", error);
    return NextResponse.json({ message: error.message || "Error interno" }, { status: 500 });
  }
}
