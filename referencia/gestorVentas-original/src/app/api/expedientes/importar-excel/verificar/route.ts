import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { usuarios, clientes, expedientes } from "@/db/schema";
import { eq, ilike, inArray } from "drizzle-orm";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { rows } = body;

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
    }

    const results = [];

    for (const row of rows) {
      const { rowIdx, cliente } = row;
      if (!cliente) {
        results.push({ rowIdx, status: "no_match" });
        continue;
      }

      // Buscar todos los clientes con este nombre (por si hay duplicados)
      const matchedClients = await db.query.clientes.findMany({
        where: ilike(clientes.nombre, cliente.trim())
      });

      if (matchedClients.length === 0) {
        results.push({ rowIdx, status: "no_match" });
        continue;
      }

      const clientIds = matchedClients.map(c => c.id);

      // Buscar expedientes de cualquiera de los clientes coincidentes
      const clientExps = await db.query.expedientes.findMany({
        where: inArray(expedientes.id_cliente, clientIds),
        with: {
          cliente: true,
          modelo: {
            with: {
              marca: true
            }
          },
          tipoDeVenta: true,
          estadoVehiculo: true
        }
      });

      if (clientExps.length === 1) {
        const activeClient = clientExps[0].cliente || matchedClients[0];
        results.push({
          rowIdx,
          status: "ok",
          id_cliente: activeClient.id,
          id_expediente: clientExps[0].id_expediente,
          client: {
            nombre: activeClient.nombre,
            dni: activeClient.dni
          },
          expediente: {
            id_expediente: clientExps[0].id_expediente,
            modelo: clientExps[0].modelo?.nombre_modelo || "Desconocido",
            marca: clientExps[0].modelo?.marca?.nombre || "Desconocido",
            vin: clientExps[0].vin || "",
            matricula: clientExps[0].matricula || "",
            fecha_afectacion: clientExps[0].fecha_afectacion || "",
            fecha_matriculacion: clientExps[0].fecha_matriculacion || ""
          }
        });
      } else if (clientExps.length > 1) {
        const activeClient = clientExps[0].cliente || matchedClients[0];
        results.push({
          rowIdx,
          status: "multiple",
          id_cliente: activeClient.id,
          client: {
            nombre: activeClient.nombre,
            dni: activeClient.dni
          },
          expedientes: clientExps.map(e => ({
            id_expediente: e.id_expediente,
            modelo: e.modelo?.nombre_modelo || "Desconocido",
            marca: e.modelo?.marca?.nombre || "Desconocido",
            vin: e.vin || "",
            matricula: e.matricula || "",
            fecha_afectacion: e.fecha_afectacion || "",
            fecha_matriculacion: e.fecha_matriculacion || "",
            fecha_expediente: e.fecha_expediente || ""
          }))
        });
      } else {
        // El cliente existe pero no tiene expedientes
        results.push({ rowIdx, status: "no_match" });
      }
    }

    return NextResponse.json({ success: true, results }, { status: 200 });
  } catch (error: any) {
    console.error("Error al verificar filas de Excel:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
